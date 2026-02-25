import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import logoUrl from "../../assets/moku-icon.svg";

export type SplashMode = "loading" | "idle";
export const EXIT_MS = 320;

interface Props {
  mode:        SplashMode;
  ringFull?:   boolean;
  failed?:     boolean;
  showCards?:  boolean;
  showFps?:    boolean;
  onReady?:    () => void;
  onRetry?:    () => void;
  onDismiss?:  () => void;
}

// ── Hash ──────────────────────────────────────────────────────────────────────
function hash(n: number): number {
  let x = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 0xffffffff;
}

// ── Card definition ───────────────────────────────────────────────────────────
interface CardDef {
  layer:      0 | 1 | 2;
  cx:         number;
  w:          number;
  h:          number;
  lines:      number;
  alpha:      number;
  speed:      number;
  cycleSec:   number;
  phase:      number;
  travel:     number;
  yStart:     number;
  angleStart: number;
  tilt:       number;
}

interface CardTrig { cosA: number; sinA: number; tiltRad: number; }

const LAYER_CFG = [
  { wMin: 26, wMax: 40, speedMin: 30, speedMax: 50,  alpha: 0.22 },
  { wMin: 38, wMax: 56, speedMin: 52, speedMax: 80,  alpha: 0.35 },
  { wMin: 54, wMax: 76, speedMin: 85, speedMax: 120, alpha: 0.50 },
] as const;

const BUF  = 80;
const COLS = 14;

function buildCards(vw: number, vh: number): { cards: CardDef[]; trigs: CardTrig[] } {
  const cards: CardDef[] = [];
  const laneW = vw / COLS;
  for (let layer = 0; layer < 3; layer++) {
    const cfg = LAYER_CFG[layer];
    for (let col = 0; col < COLS; col++) {
      const seed     = col * 31 + layer * 97 + 7;
      const w        = cfg.wMin + hash(seed + 1) * (cfg.wMax - cfg.wMin);
      const h        = w * 1.44;
      const maxNudge = (laneW - w) / 2 - 2;
      const cx       = (col + 0.5) * laneW + (hash(seed + 2) * 2 - 1) * Math.max(0, maxNudge);
      const speed    = cfg.speedMin + hash(seed + 5) * (cfg.speedMax - cfg.speedMin);
      const travel   = vh + h + BUF;
      cards.push({
        layer: layer as 0 | 1 | 2,
        cx, w, h,
        lines:      1 + Math.floor(hash(seed + 7) * 3),
        alpha:      cfg.alpha,
        speed,
        cycleSec:   travel / speed,
        phase:      ((col / COLS) + hash(seed + 6) * 0.6 + layer * 0.23) % 1,
        travel,
        yStart:     vh + h / 2 + BUF / 2,
        angleStart: hash(seed + 3) * 50 - 25,
        tilt:       (hash(seed + 4) * 2 - 1) * 18,
      });
    }
  }
  const trigs: CardTrig[] = cards.map(c => ({
    cosA:    Math.cos(c.angleStart * (Math.PI / 180)),
    sinA:    Math.sin(c.angleStart * (Math.PI / 180)),
    tiltRad: c.tilt * (Math.PI / 180),
  }));
  return { cards, trigs };
}

// ── Rounded rect ──────────────────────────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);     ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);     ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);     ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

// ── Stamp builder ─────────────────────────────────────────────────────────────
const STAMP_PAD = 6;

function buildStamp(c: CardDef, dpr: number): HTMLCanvasElement {
  const logW = Math.ceil(c.w + STAMP_PAD * 2);
  const logH = Math.ceil(c.h + STAMP_PAD * 2);
  const oc   = document.createElement("canvas");
  oc.width   = Math.round(logW * dpr);
  oc.height  = Math.round(logH * dpr);
  const ctx  = oc.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const x0     = STAMP_PAD;
  const y0     = STAMP_PAD;
  const coverH = (c.w * 0.72) * 1.05;
  const lineY0 = y0 + 3 + coverH + 5;

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  rrect(ctx, x0 + 2, y0 + 2, c.w, c.h, 4); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.07)";
  rrect(ctx, x0, y0, c.w, c.h, 4); ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 1.2;
  rrect(ctx, x0, y0, c.w, c.h, 4); ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  rrect(ctx, x0 + 3, y0 + 3, c.w - 6, coverH, 3); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  rrect(ctx, x0 + 3, y0 + 3, (c.w - 6) * 0.45, coverH, 3); ctx.fill();

  for (let li = 0; li < c.lines; li++) {
    ctx.fillStyle = li === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.20)";
    ctx.fillRect(x0 + 4, lineY0 + li * 8, (c.w - 8) * (li === 0 ? 0.78 : 0.52), li === 0 ? 3 : 2);
  }

  return oc;
}

// ── Vignette builder ──────────────────────────────────────────────────────────
function buildVignette(vw: number, vh: number, dpr: number): HTMLCanvasElement {
  const oc  = document.createElement("canvas");
  oc.width  = Math.round(vw * dpr);
  oc.height = Math.round(vh * dpr);
  const ctx = oc.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const g = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, Math.max(vw, vh) * 0.65);
  g.addColorStop(0.15, "rgba(0,0,0,0)");
  g.addColorStop(1,    "rgba(0,0,0,0.82)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh);
  return oc;
}

// ── Draw frame ────────────────────────────────────────────────────────────────
function drawFrame(
  ctx:      CanvasRenderingContext2D,
  t:        number,
  cw:       number,
  ch:       number,
  dpr:      number,
  cards:    CardDef[],
  trigs:    CardTrig[],
  stamps:   HTMLCanvasElement[],
  vignette: HTMLCanvasElement,
) {
  ctx.clearRect(0, 0, cw, ch);

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const p = ((t / c.cycleSec) + c.phase) % 1;

    const alpha = p < 0.07
      ? (p / 0.07) * c.alpha
      : p > 0.86
        ? ((1 - p) / 0.14) * c.alpha
        : c.alpha;

    if (alpha < 0.005) continue;

    const cy       = c.yStart - p * c.travel;
    const tg       = trigs[i];
    const delta    = tg.tiltRad * p;
    const cosDelta = Math.cos(delta);
    const sinDelta = Math.sin(delta);
    const cos = tg.cosA * cosDelta - tg.sinA * sinDelta;
    const sin = tg.sinA * cosDelta + tg.cosA * sinDelta;

    ctx.globalAlpha = alpha;
    ctx.setTransform(
      cos * dpr, sin * dpr,
      -sin * dpr, cos * dpr,
      c.cx * dpr, cy * dpr,
    );
    const sw = c.w + STAMP_PAD * 2;
    const sh = c.h + STAMP_PAD * 2;
    ctx.drawImage(stamps[i], -sw / 2, -sh / 2, sw, sh);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(vignette, 0, 0, cw, ch);
}

// ── Ring ──────────────────────────────────────────────────────────────────────
function Ring({ progress }: { progress: number }) {
  const r = 44, sw = 2, pad = 8;
  const size = (r + pad) * 2, c = r + pad;
  const circ = 2 * Math.PI * r;
  const arc  = circ * Math.min(Math.max(progress, 0.025), 0.999);
  return (
    <svg width={size} height={size} style={{
      position: "absolute", pointerEvents: "none",
      top: -((size - 80) / 2), left: -((size - 80) / 2),
    }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
      <circle cx={c} cy={c} r={r} fill="none" stroke="#4ade80" strokeWidth={sw}
        strokeLinecap="round" strokeDasharray={`${arc} ${circ}`}
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: "stroke-dasharray 0.55s cubic-bezier(0.4,0,0.2,1)" }} />
    </svg>
  );
}

// ── FPS counter ───────────────────────────────────────────────────────────────
function FpsCounter() {
  const divRef = useRef<HTMLDivElement>(null);
  const times  = useRef<number[]>([]);

  useEffect(() => {
    let raf = 0;
    function tick(now: number) {
      const arr = times.current;
      arr.push(now);
      if (arr.length > 60) arr.shift();
      if (arr.length > 1 && divRef.current) {
        const fps = Math.round((arr.length - 1) / ((arr[arr.length - 1] - arr[0]) / 1000));
        divRef.current.textContent = `${fps} fps`;
        divRef.current.style.color = fps >= 55 ? "#4ade80" : fps >= 30 ? "#facc15" : "#f87171";
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={divRef} style={{
      position: "fixed", top: 10, right: 14, zIndex: 10001,
      fontFamily: "var(--font-mono, 'Courier New', monospace)",
      fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
      color: "#4ade80",
      background: "rgba(0,0,0,0.55)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 4, padding: "2px 7px",
      userSelect: "none", pointerEvents: "none",
    }}>-- fps</div>
  );
}

// ── CardCanvas ────────────────────────────────────────────────────────────────
// Uses invoke("get_scale_factor") to get the real OS DPR from winit/Tauri
// before building any bitmaps. window.devicePixelRatio is unreliable in
// nix run and flatpak because WebKitGTK may not have received the HiDPI
// hint from the compositor by the time the JS context initialises.
// Tauri reads it from the native window handle, which is always correct.
function CardCanvas({ showFps }: { showFps: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    let cancelled = false;

    async function init() {
      // Prefer the Tauri-sourced scale factor; fall back to the JS value
      // when running outside Tauri (e.g. vite dev server in a browser).
      let dpr = window.devicePixelRatio || 1;
      try {
        const tauriDpr = await invoke<number>("get_scale_factor");
        if (tauriDpr > 0) dpr = tauriDpr;
      } catch {
        // Not in Tauri — window.devicePixelRatio is fine for the browser.
      }

      if (cancelled) return;

      console.log(
        "[SplashScreen] DPR resolution:",
        `window.devicePixelRatio=${window.devicePixelRatio}`,
        `resolved dpr=${dpr}`,
        `logical=${window.innerWidth}x${window.innerHeight}`,
        `physical=${Math.round(window.innerWidth * dpr)}x${Math.round(window.innerHeight * dpr)}`,
      );

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const { cards, trigs } = buildCards(vw, vh);
      const stamps = cards.map(c => buildStamp(c, dpr));

      let vignette = buildVignette(vw, vh, dpr);
      let lastLW   = vw;
      let lastLH   = vh;
      let lastDpr  = dpr;
      let curDpr   = dpr;

      // syncSize is synchronous for the canvas resize, but fires an async
      // Tauri call to update curDpr so the next frame uses the right value.
      // This handles moving the window between monitors mid-session.
      function syncSize() {
        if (!canvas) return;
        const lw = canvas.offsetWidth  || window.innerWidth;
        const lh = canvas.offsetHeight || window.innerHeight;
        canvas.width  = Math.round(lw * curDpr);
        canvas.height = Math.round(lh * curDpr);

        if (lw !== lastLW || lh !== lastLH || curDpr !== lastDpr) {
          vignette = buildVignette(lw, lh, curDpr);
          lastLW   = lw;
          lastLH   = lh;
          lastDpr  = curDpr;
        }

        // Async DPR refresh for next resize (e.g. monitor switch)
        invoke<number>("get_scale_factor")
          .then(d => { if (d > 0) curDpr = d; })
          .catch(() => { curDpr = window.devicePixelRatio || 1; });
      }

      syncSize();
      const ro = new ResizeObserver(syncSize);
      if (canvas) ro.observe(canvas);

      let raf = 0, t0 = -1;
      function frame(now: number) {
        if (t0 < 0) t0 = now;
        drawFrame(
          ctx!, (now - t0) / 1000,
          canvas!.width, canvas!.height,
          curDpr, cards, trigs, stamps, vignette,
        );
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      // Stash cleanup so the synchronous useEffect return can reach it.
      (canvas as any).__splashCleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }

    init();

    return () => {
      cancelled = true;
      (canvas as any).__splashCleanup?.();
    };
  }, []);

  return (
    <>
      <canvas ref={ref} style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        width: "100%", height: "100%",
      }} />
      {showFps && <FpsCounter />}
    </>
  );
}

// ── Static CSS ────────────────────────────────────────────────────────────────
const STATIC_CSS = `
@keyframes spIn  { from{opacity:0;transform:scale(1.015)} to{opacity:1;transform:scale(1)} }
@keyframes spOut { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.96)} }
@keyframes logoBreathe {
  0%,100%{transform:scale(1);filter:drop-shadow(0 0 0px rgba(255,255,255,0))}
  50%    {transform:scale(1.04);filter:drop-shadow(0 0 18px rgba(255,255,255,0.12))}
}
@keyframes hintFade { 0%,100%{opacity:0.35} 50%{opacity:0.7} }
`;

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SplashScreen({
  mode, ringFull = false, failed = false,
  showCards = true, showFps = false,
  onReady, onRetry, onDismiss,
}: Props) {
  const [dots, setDots]         = useState("");
  const [ringProg, setRingProg] = useState(0.025);
  const [exiting, setExiting]   = useState(false);
  const exitLock                = useRef(false);

  function triggerExit(cb?: () => void) {
    if (exitLock.current) return;
    exitLock.current = true;
    setExiting(true);
    setTimeout(() => cb?.(), EXIT_MS);
  }

  useEffect(() => {
    if (!ringFull) return;
    setRingProg(1);
    const t = setTimeout(() => triggerExit(onReady), 650);
    return () => clearTimeout(t);
  }, [ringFull]);

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? "" : d + "."), 420);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== "idle" || !onDismiss) return;
    function handler() { triggerExit(onDismiss); }
    window.addEventListener("keydown",    handler, { once: true });
    window.addEventListener("mousedown",  handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });
    return () => {
      window.removeEventListener("keydown",    handler);
      window.removeEventListener("mousedown",  handler);
      window.removeEventListener("touchstart", handler);
    };
  }, [mode, onDismiss]);

  const isIdle = mode === "idle";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "var(--bg-base)", overflow: "hidden",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      cursor: isIdle ? "pointer" : "default",
      animation: exiting
        ? `spOut ${EXIT_MS}ms cubic-bezier(0.4,0,1,1) both`
        : "spIn 0.35s cubic-bezier(0,0,0.2,1) both",
    }}>
      <style>{STATIC_CSS}</style>

      {showCards && <CardCanvas showFps={showFps} />}

      {isIdle ? (
        <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ position: "relative", width: 128, height: 128, marginBottom: 32 }}>
            <div style={{
              position: "absolute", inset: -20, borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)",
              animation: "logoBreathe 4s ease-in-out infinite",
            }} />
            <img src={logoUrl} alt="Moku" style={{
              width: 128, height: 128, borderRadius: 28,
              display: "block", position: "relative",
              animation: "logoBreathe 4s ease-in-out infinite",
            }} />
          </div>
          <p style={{
            fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--text-faint)",
            letterSpacing: "0.22em", textTransform: "uppercase",
            margin: 0, userSelect: "none",
            animation: "hintFade 3.5s ease-in-out infinite",
          }}>press any key to continue</p>
        </div>
      ) : (
        <>
          <div style={{ position: "relative", width: 80, height: 80, marginBottom: 20, zIndex: 1 }}>
            {!failed && <Ring progress={ringProg} />}
            <img src={logoUrl} alt="Moku"
              style={{ width: 80, height: 80, borderRadius: 18, display: "block" }} />
          </div>
          <p style={{
            fontFamily: "var(--font-ui)", fontSize: 11, fontWeight: 500,
            letterSpacing: "0.26em", textTransform: "uppercase",
            color: "var(--text-secondary)", margin: "0 0 8px",
            zIndex: 1, userSelect: "none",
          }}>moku</p>
          <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            {failed ? (
              <>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--color-error)", letterSpacing: "0.1em", margin: 0 }}>
                  Could not reach Suwayomi
                </p>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.05em", margin: 0, textAlign: "center", maxWidth: 240, lineHeight: "1.6" }}>
                  Make sure tachidesk-server is on your PATH
                </p>
                <button onClick={onRetry} style={{
                  marginTop: 4, padding: "5px 16px", borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-dim)", background: "var(--bg-raised)",
                  color: "var(--text-muted)", cursor: "pointer",
                  fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: "0.08em",
                }}>Retry</button>
              </>
            ) : (
              <p style={{ fontFamily: "var(--font-ui)", fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.12em", margin: 0, minWidth: 160, textAlign: "center" }}>
                {ringFull ? "Ready" : `Initializing server${dots}`}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}