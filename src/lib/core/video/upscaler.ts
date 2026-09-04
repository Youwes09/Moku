export type UpscaleMode = "off" | "fast" | "quality";

const CAP: Record<Exclude<UpscaleMode, "off">, { w: number; h: number; strength: number; lines: number }> = {
  fast:    { w: 2560, h: 1440, strength: 0.55, lines: 0.0 },
  quality: { w: 3840, h: 2160, strength: 0.9,  lines: 0.35 },
};

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_color;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_strength;
uniform float u_lines;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 c  = texture(u_tex, uv).rgb;

  vec3 n = texture(u_tex, uv + vec2(0.0, -u_texel.y)).rgb;
  vec3 s = texture(u_tex, uv + vec2(0.0,  u_texel.y)).rgb;
  vec3 e = texture(u_tex, uv + vec2( u_texel.x, 0.0)).rgb;
  vec3 w = texture(u_tex, uv + vec2(-u_texel.x, 0.0)).rgb;

  vec3 blur = (n + s + e + w) * 0.25;
  float lc = luma(c);
  float grad = abs(luma(n) - luma(s)) + abs(luma(e) - luma(w));
  float edge = clamp(grad * 3.0, 0.0, 1.0);

  vec3 sharp = c + (c - blur) * (u_strength * (0.35 + 0.65 * edge));

  if (u_lines > 0.0) {
    float minN = min(min(luma(n), luma(s)), min(luma(e), luma(w)));
    float dark = clamp((lc - minN) * 4.0, 0.0, 1.0) * edge;
    sharp *= 1.0 - dark * u_lines * 0.25;
  }

  o_color = vec4(clamp(sharp, 0.0, 1.0), 1.0);
}`;

export class VideoUpscaler {
  readonly supported: boolean;
  onFirstFrame: (() => void) | null = null;
  onError: ((reason: string) => void) | null = null;

  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private uTexel: WebGLUniformLocation | null = null;
  private uStrength: WebGLUniformLocation | null = null;
  private uLines: WebGLUniformLocation | null = null;

  private mode: UpscaleMode = "off";
  private running = false;
  private rvfcHandle = 0;
  private rafHandle = 0;
  private lastTime = -1;
  private firstDone = false;
  private uploadFails = 0;
  private ro: ResizeObserver | null = null;

  private scratch: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D | null;

  constructor(
    private video: HTMLVideoElement,
    private canvas: HTMLCanvasElement,
  ) {
    this.scratch = document.createElement("canvas");
    this.sctx = this.scratch.getContext("2d", { willReadFrequently: false });

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.supported = !!gl && !!this.sctx;
    if (!gl || !this.sctx) return;
    this.gl = gl;

    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    this.initGL();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);

    this.video.addEventListener("loadedmetadata", this.onVideoResize);
    this.video.addEventListener("resize", this.onVideoResize);
  }

  private onVideoResize = () => this.resize();

  setMode(mode: UpscaleMode) {
    this.mode = mode;
    if (mode === "off") {
      this.stop();
      return;
    }
    this.resize();
    this.start();
  }

  start() {
    if (!this.gl || this.running || this.mode === "off") return;
    this.running = true;
    this.firstDone = false;
    this.uploadFails = 0;
    this.schedule();
  }

  stop() {
    this.running = false;
    if (this.rvfcHandle && "cancelVideoFrameCallback" in this.video) {
      (this.video as any).cancelVideoFrameCallback(this.rvfcHandle);
    }
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rvfcHandle = 0;
    this.rafHandle = 0;
  }

  destroy() {
    this.stop();
    this.ro?.disconnect();
    this.ro = null;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.video.removeEventListener("loadedmetadata", this.onVideoResize);
    this.video.removeEventListener("resize", this.onVideoResize);
    const gl = this.gl;
    if (gl) {
      if (this.tex) gl.deleteTexture(this.tex);
      if (this.prog) gl.deleteProgram(this.prog);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.vbo) gl.deleteBuffer(this.vbo);
    }
    this.gl = null;
  }

  private initGL() {
    const gl = this.gl!;
    const vs = this.compile(gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("upscaler link: " + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.uTexel = gl.getUniformLocation(prog, "u_texel");
    this.uStrength = gl.getUniformLocation(prog, "u_strength");
    this.uLines = gl.getUniformLocation(prog, "u_lines");

    gl.useProgram(prog);
    const uTex = gl.getUniformLocation(prog, "u_tex");
    if (uTex) gl.uniform1i(uTex, 0);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl!;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("upscaler compile: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  private targetSize(): { w: number; h: number } | null {
    if (this.mode === "off") return null;
    const sw = this.video.videoWidth;
    const sh = this.video.videoHeight;
    if (!sw || !sh) return null;

    const cap = CAP[this.mode];
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wantW = Math.max(sw, Math.round((rect.width || sw) * dpr));
    const scale = Math.min(cap.w / sw, cap.h / sh, Math.max(1, wantW / sw));
    return { w: Math.round(sw * scale), h: Math.round(sh * scale) };
  }

  private resize() {
    if (!this.gl) return;
    const t = this.targetSize();
    if (!t) return;
    if (this.canvas.width !== t.w || this.canvas.height !== t.h) {
      this.canvas.width = t.w;
      this.canvas.height = t.h;
    }
  }

  private schedule() {
    if (!this.running) return;
    const v = this.video as any;
    if (typeof v.requestVideoFrameCallback === "function") {
      this.rvfcHandle = v.requestVideoFrameCallback(() => {
        this.render();
        this.schedule();
      });
    } else {
      this.rafHandle = requestAnimationFrame(() => {
        if (this.video.currentTime !== this.lastTime || !this.video.paused) {
          this.lastTime = this.video.currentTime;
          this.render();
        }
        this.schedule();
      });
    }
  }

  private render() {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    const sw = this.video.videoWidth;
    const sh = this.video.videoHeight;
    if (!sw || !sh || this.video.readyState < 2) return;

    const t = this.targetSize();
    if (!t) return;
    if (this.canvas.width !== t.w || this.canvas.height !== t.h) {
      this.canvas.width = t.w;
      this.canvas.height = t.h;
    }

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.scratch.width !== sw || this.scratch.height !== sh) {
      this.scratch.width = sw;
      this.scratch.height = sh;
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    try {
      this.sctx!.drawImage(this.video, 0, 0, sw, sh);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.scratch);
    } catch (err) {
      if (++this.uploadFails >= 3) {
        this.stop();
        this.onError?.(
          (err as Error)?.name === "SecurityError"
            ? "This stream can't be read for upscaling (no CORS)."
            : "Video upscaling failed to read frames.",
        );
      }
      return;
    }
    this.uploadFails = 0;

    const cap = CAP[this.mode as Exclude<UpscaleMode, "off">];
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uTexel, 1 / sw, 1 / sh);
    gl.uniform1f(this.uStrength, cap.strength);
    gl.uniform1f(this.uLines, cap.lines);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!this.firstDone) {
      this.firstDone = true;
      this.onFirstFrame?.();
    }
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.stop();
  };

  private onContextRestored = () => {
    if (!this.canvas) return;
    const gl = this.canvas.getContext("webgl2");
    if (!gl) return;
    this.gl = gl as WebGL2RenderingContext;
    this.initGL();
    this.resize();
    if (this.mode !== "off") this.start();
  };
}
