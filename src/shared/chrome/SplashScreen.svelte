<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { store } from "@store/state.svelte";
  import logoUrl from "@assets/moku-icon-splash.svg";

  interface Props {
    mode?:          "loading" | "idle";
    ringFull?:      boolean;
    failed?:        boolean;
    notConfigured?: boolean;
    showCards?:     boolean;
    showFps?:       boolean;
    onReady?:       () => void;
    onRetry?:       () => void;
    onBypass?:      () => void;
    onDismiss?:     () => void;
  }

  let {
    mode = "loading", ringFull = false, failed = false,
    notConfigured = false, showCards = true, showFps = false,
    onReady, onRetry, onBypass, onDismiss,
  }: Props = $props();

  const serverAuthActive = $derived(
    store.settings.serverAuthMode === "BASIC_AUTH" || store.settings.serverAuthMode === "UI_LOGIN"
  );

  const lockEnabled = $derived(
    store.settings.appLockEnabled &&
    (store.settings.appLockPin?.length ?? 0) >= 4 &&
    (mode === "idle" || !serverAuthActive)
  );

  let pinEntry    = $state("");
  let pinShake    = $state(false);
  let pinUnlocked = $state(false);
  let pinVisible  = $state(false);
  let uiScale     = $state(1);
  let fpsEl       = $state<HTMLSpanElement | undefined>(undefined);

  const logoLoadingSize = 140;
  const logoIdleSize    = 128;
  const logoLockSize    = 96;

  const ringR    = $derived(70);
  const ringPad  = $derived(12);
  const ringSize = $derived((ringR + ringPad) * 2);
  const ringC    = $derived(ringR + ringPad);
  const ringCirc = $derived(2 * Math.PI * ringR);
  const ringArc  = $derived(ringCirc * Math.min(Math.max(ringProg, 0.025), 0.999));
  const ringTop  = $derived(-((ringSize - logoLoadingSize) / 2));
  const ringLeft = $derived(-((ringSize - logoLoadingSize) / 2));

  function submitPin() {
    if (pinEntry === store.settings.appLockPin) {
      pinUnlocked = true;
      pinEntry    = "";
      if (mode === "idle") triggerExit(onDismiss);
    } else {
      pinShake = true;
      pinEntry = "";
      setTimeout(() => (pinShake = false), 500);
    }
  }

  function onPinKey(e: KeyboardEvent) {
    if (e.key === "Enter")     { submitPin(); return; }
    if (e.key === "Backspace") { pinEntry = pinEntry.slice(0, -1); return; }
    if (/^\d$/.test(e.key)) {
      pinEntry = (pinEntry + e.key).slice(0, 8);
      if (pinEntry.length >= (store.settings.appLockPin?.length ?? 4)) submitPin();
    }
  }

  const EXIT_MS       = 320;
  const PHASE1_TARGET = 0.85;
  const PHASE1_MS     = 3000;
  const PHASE2_TARGET = 0.95;
  const PHASE2_MS     = 10000;

  let dots     = $state("");
  let ringProg = $state(0.025);
  let exiting  = $state(false);
  let exitLock = false;

  function triggerExit(cb?: () => void) {
    if (exitLock) return;
    exitLock = true;
    exiting  = true;
    setTimeout(() => cb?.(), EXIT_MS);
  }

  let animFrame: number;
  let animStart: number | null = null;
  let animPhase = 1;

  function animateRing(ts: number) {
    if (exitLock) return;
    if (animStart === null) animStart = ts;
    const elapsed = ts - animStart;
    if (animPhase === 1) {
      const t = Math.min(elapsed / PHASE1_MS, 1);
      ringProg = 0.025 + (1 - Math.pow(1 - t, 3)) * (PHASE1_TARGET - 0.025);
      if (t >= 1) { animPhase = 2; animStart = ts; }
    } else {
      const t = Math.min(elapsed / PHASE2_MS, 1);
      ringProg = PHASE1_TARGET + (1 - Math.pow(1 - t, 4)) * (PHASE2_TARGET - PHASE1_TARGET);
    }
    animFrame = requestAnimationFrame(animateRing);
  }

  $effect(() => {
    if (mode === "loading" && !failed && !notConfigured) {
      animFrame = requestAnimationFrame(animateRing);
      return () => cancelAnimationFrame(animFrame);
    }
  });

  $effect(() => {
    if (!ringFull) {
      exitLock = false;
      exiting  = false;
      return;
    }
    cancelAnimationFrame(animFrame);
    ringProg = 1;
    if (lockEnabled && !pinUnlocked) {
      setTimeout(() => (pinVisible = true), 400);
    } else {
      setTimeout(() => triggerExit(onReady), 650);
    }
  });

  $effect(() => {
    const needsPin =
      (mode === "idle" && lockEnabled) ||
      (mode === "loading" && lockEnabled && ringFull && !pinUnlocked);
    if (!needsPin) return;
    window.addEventListener("keydown", onPinKey);
    return () => window.removeEventListener("keydown", onPinKey);
  });

  $effect(() => {
    if (pinUnlocked && mode !== "idle") triggerExit(onReady);
  });

  const dotsInterval = setInterval(() => {
    dots = dots.length >= 3 ? "" : dots + ".";
  }, 420);

  onMount(async () => {
    const win = getCurrentWindow();
    uiScale = await win.scaleFactor();

    if (mode === "idle" && onDismiss) {
      if (lockEnabled) return () => clearInterval(dotsInterval);
      const handler = () => triggerExit(onDismiss);
      const t = setTimeout(() => {
        window.addEventListener("keydown",    handler, { once: true });
        window.addEventListener("mousedown",  handler, { once: true });
        window.addEventListener("touchstart", handler, { once: true });
      }, 200);
      return () => {
        clearTimeout(t);
        clearInterval(dotsInterval);
        window.removeEventListener("keydown",    handler);
        window.removeEventListener("mousedown",  handler);
        window.removeEventListener("touchstart", handler);
      };
    }
    return () => clearInterval(dotsInterval);
  });

  interface CardDef  { cx: number; w: number; h: number; lines: number; alpha: number; speed: number; cycleSec: number; phase: number; travel: number; yStart: number; angleStart: number; tilt: number; }
  interface CardTrig { cosA: number; sinA: number; tiltRad: number; }
  interface RenderState { cards: CardDef[]; trigs: CardTrig[]; stamps: HTMLCanvasElement[]; vignette: HTMLCanvasElement; CW: number; CH: number; scale: number; }

  const LAYER_CFG = [
    { wMin: 26, wMax: 40, speedMin: 30,  speedMax: 50,  alpha: 0.22 },
    { wMin: 38, wMax: 56, speedMin: 52,  speedMax: 80,  alpha: 0.35 },
    { wMin: 54, wMax: 76, speedMin: 85,  speedMax: 120, alpha: 0.50 },
  ] as const;

  const BUF = 80, COLS = 14;

  function hash(n: number): number {
    let x = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    return ((x ^ (x >>> 16)) >>> 0) / 0xffffffff;
  }

  function buildCards(vw: number, vh: number) {
    const cards: CardDef[] = [];
    const laneW = vw / COLS;
    for (let layer = 0; layer < 3; layer++) {
      const cfg = LAYER_CFG[layer];
      for (let col = 0; col < COLS; col++) {
        const seed   = col * 31 + layer * 97 + 7;
        const w      = cfg.wMin + hash(seed + 1) * (cfg.wMax - cfg.wMin);
        const h      = w * 1.44;
        const speed  = cfg.speedMin + hash(seed + 5) * (cfg.speedMax - cfg.speedMin);
        const travel = vh + h + BUF;
        cards.push({
          cx: (col + 0.5) * laneW + (hash(seed + 2) * 2 - 1) * Math.max(0, (laneW - w) / 2 - 2),
          w, h,
          lines: 1 + Math.floor(hash(seed + 7) * 3),
          alpha: cfg.alpha,
          speed,
          cycleSec: travel / speed,
          phase: ((col / COLS) + hash(seed + 6) * 0.6 + layer * 0.23) % 1,
          travel,
          yStart: vh + h / 2 + BUF / 2,
          angleStart: hash(seed + 3) * 50 - 25,
          tilt: (hash(seed + 4) * 2 - 1) * 18,
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

  function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);         ctx.lineTo(x + w - r, y);     ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);     ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x, y + r);         ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
  }

  const STAMP_PAD = 6;

  function buildStamp(c: CardDef, dpr: number): HTMLCanvasElement {
    const oc  = document.createElement("canvas");
    oc.width  = Math.round(Math.ceil(c.w + STAMP_PAD * 2) * dpr);
    oc.height = Math.round(Math.ceil(c.h + STAMP_PAD * 2) * dpr);
    const ctx = oc.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const x0     = STAMP_PAD, y0 = STAMP_PAD;
    const coverH = c.w * 0.72 * 1.05;
    const lineY0 = y0 + 3 + coverH + 5;
    ctx.fillStyle   = "rgba(0,0,0,0.5)";          rrect(ctx, x0 + 2, y0 + 2, c.w, c.h, 4);            ctx.fill();
    ctx.fillStyle   = "rgba(255,255,255,0.07)";   rrect(ctx, x0, y0, c.w, c.h, 4);                     ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth   = 1.2;                        rrect(ctx, x0, y0, c.w, c.h, 4);                     ctx.stroke();
    ctx.fillStyle   = "rgba(255,255,255,0.15)";   rrect(ctx, x0 + 3, y0 + 3, c.w - 6, coverH, 3);     ctx.fill();
    ctx.fillStyle   = "rgba(255,255,255,0.08)";   rrect(ctx, x0 + 3, y0 + 3, (c.w - 6) * 0.45, coverH, 3); ctx.fill();
    for (let li = 0; li < c.lines; li++) {
      ctx.fillStyle = li === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.20)";
      ctx.fillRect(x0 + 4, lineY0 + li * 8, (c.w - 8) * (li === 0 ? 0.78 : 0.52), li === 0 ? 3 : 2);
    }
    return oc;
  }

  function buildVignette(vw: number, vh: number, dpr: number): HTMLCanvasElement {
    const oc  = document.createElement("canvas");
    oc.width  = Math.round(vw * dpr);
    oc.height = Math.round(vh * dpr);
    const ctx = oc.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const g = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, Math.max(vw, vh) * 0.65);
    g.addColorStop(0,   "rgba(0,0,0,0)");
    g.addColorStop(0.4, "rgba(0,0,0,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0.25)");
    g.addColorStop(1,   "rgba(0,0,0,0.65)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    return oc;
  }

  function drawFrame(
    ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number, dpr: number,
    cards: CardDef[], trigs: CardTrig[], stamps: HTMLCanvasElement[], vignette: HTMLCanvasElement,
  ) {
    ctx.clearRect(0, 0, cw, ch);
    for (let i = 0; i < cards.length; i++) {
      const c     = cards[i];
      const p     = ((t / c.cycleSec) + c.phase) % 1;
      const alpha = p < 0.07 ? (p / 0.07) * c.alpha : p > 0.86 ? ((1 - p) / 0.14) * c.alpha : c.alpha;
      if (alpha < 0.005) continue;
      const cy    = c.yStart - p * c.travel;
      const tg    = trigs[i];
      const delta = tg.tiltRad * p;
      const cos   = tg.cosA * Math.cos(delta) - tg.sinA * Math.sin(delta);
      const sin   = tg.sinA * Math.cos(delta) + tg.cosA * Math.sin(delta);
      ctx.globalAlpha = alpha;
      ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, c.cx * dpr, cy * dpr);
      const sw = stamps[i].width / dpr, sh = stamps[i].height / dpr;
      ctx.drawImage(stamps[i], -sw / 2, -sh / 2, sw, sh);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(vignette, 0, 0, cw, ch);
  }

  let fps = 0, fpsFrames = 0, fpsLast = 0;
  function tickFps(now: number) {
    fpsFrames++;
    if (now - fpsLast >= 500) {
      fps       = Math.round(fpsFrames / ((now - fpsLast) / 1000));
      fpsFrames = 0;
      fpsLast   = now;
      if (fpsEl) fpsEl.textContent = `${fps} fps`;
    }
  }

  function mountCanvas(el: HTMLCanvasElement) {
    const win = getCurrentWindow();
    const ctx = el.getContext("2d")!;
    let live: RenderState | null = null;
    let lastLogW = 0, lastLogH = 0, lastScale = 0, buildGen = 0;

    async function syncSize() {
      const gen = ++buildGen;
      const [phys, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
      if (gen !== buildGen) return;
      const logW = phys.width / scale, logH = phys.height / scale;
      if (logW === lastLogW && logH === lastLogH && scale === lastScale) return;
      lastLogW = logW; lastLogH = logH; lastScale = scale;
      const built  = buildCards(logW, logH);
      const stamps = built.cards.map(c => buildStamp(c, scale));
      const vig    = buildVignette(logW, logH, scale);
      el.width = phys.width; el.height = phys.height;
      live = { cards: built.cards, trigs: built.trigs, stamps, vignette: vig, CW: phys.width, CH: phys.height, scale };
    }

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(el);
    syncSize();

    let raf = 0, t0 = -1, paused = false;

    function frame(now: number) {
      if (paused) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      if (!live) return;
      if (t0 < 0) t0 = now;
      if (showFps) tickFps(now);
      const { cards, trigs, stamps, vignette, CW, CH, scale } = live;
      drawFrame(ctx, (now - t0) / 1000, CW, CH, scale, cards, trigs, stamps, vignette);
    }

    function pause()  { paused = true; t0 = -1; }
    function resume() { if (!paused) return; paused = false; raf = requestAnimationFrame(frame); }

    function onVisibility() { document.hidden ? pause() : resume(); }

    document.addEventListener("visibilitychange", onVisibility);
    const unlistenFocus = win.onFocusChanged(({ payload: focused }) => {
      focused ? resume() : pause();
    });

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      unlistenFocus.then(f => f());
    };
  }
</script>

<div class="splash" class:exiting style="cursor: {mode === 'idle' && !lockEnabled ? 'pointer' : 'default'}">
  {#if showCards}
    <canvas style="position:absolute;inset:0;pointer-events:none;width:100%;height:100%" use:mountCanvas></canvas>
    {#if showFps}
      <span bind:this={fpsEl} style="position:absolute;top:8px;right:8px;font-family:var(--font-ui);font-size:10px;color:var(--text-faint);z-index:2;pointer-events:none"></span>
    {/if}
  {/if}

  {#if mode === "idle" && lockEnabled}
    <div style="z-index:1;display:flex;flex-direction:column;align-items:center;gap:var(--sp-6)">
      <div style="position:relative;width:{logoLockSize}px;height:{logoLockSize}px">
        <div class="logo-glow"></div>
        <img src={logoUrl} alt="Moku" class="logo-breathe" style="width:{logoLockSize}px;height:{logoLockSize}px;border-radius:22px;display:block;position:relative" />
      </div>
      <div class="pin-card">
        <p class="pin-label">Enter PIN</p>
        <div class="pin-block">
          <div class="pin-dots" class:pin-shake={pinShake}>
            {#each Array(store.settings.appLockPin?.length ?? 4) as _, i}
              <div class="pin-dot" class:pin-dot-filled={i < pinEntry.length}></div>
            {/each}
          </div>
          <button class="pin-submit-btn" onclick={submitPin} tabindex="-1" aria-label="Submit PIN">Unlock</button>
        </div>
      </div>
    </div>

  {:else if mode === "idle"}
    <div style="z-index:1;display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:{logoIdleSize}px;height:{logoIdleSize}px;margin-bottom:32px">
        <div class="logo-glow"></div>
        <img src={logoUrl} alt="Moku" class="logo-breathe" style="width:{logoIdleSize}px;height:{logoIdleSize}px;border-radius:28px;display:block;position:relative" />
      </div>
      <p class="hint">press any key to continue</p>
    </div>

  {:else}
    <div style="position:relative;width:{ringSize}px;height:{ringSize}px;margin-bottom:20px;display:flex;align-items:center;justify-content:center">
      {#if !failed && !notConfigured}
        <svg width={ringSize} height={ringSize}
          class="loading-ring"
          class:ring-hide={lockEnabled && pinVisible}
          style="position:absolute;top:0;left:0;pointer-events:none">
          <circle cx={ringC} cy={ringC} r={ringR} fill="none" stroke="var(--border-base)" stroke-width="2" />
          <circle cx={ringC} cy={ringC} r={ringR} fill="none" stroke="var(--accent)" stroke-width="2"
            stroke-linecap="round"
            stroke-dasharray="{ringArc} {ringCirc}"
            transform="rotate(-90 {ringC} {ringC})"
            style="transition: stroke-dasharray 0.4s cubic-bezier(0.4,0,0.2,1)" />
        </svg>
      {/if}
      <img src={logoUrl} alt="Moku" style="width:{logoLoadingSize}px;height:{logoLoadingSize}px;border-radius:32px;display:block;position:relative" />
    </div>
    <div class="bottom-area" style="z-index:1">
      <div class="status-slot" class:status-slot-hide={lockEnabled && pinVisible}>
        {#if failed || notConfigured}
          <div class="error-box anim-fade-up">
            <p class="error-label">{failed ? "Could not reach server" : "Server not configured"}</p>
            <div class="error-actions">
              <button class="err-btn" onclick={() => onRetry?.()}>Retry</button>
              <button class="err-btn err-btn--primary" onclick={() => onBypass?.()}>Enter app</button>
            </div>
          </div>
        {:else}
          <p class="status-text">{ringFull ? "" : `Initializing server${dots}`}</p>
        {/if}
      </div>

      {#if lockEnabled}
        <div class="pin-slot" class:pin-slot-visible={pinVisible}>
          <div class="pin-card">
            <p class="pin-label">Enter PIN</p>
            <div class="pin-block">
              <div class="pin-dots" class:pin-shake={pinShake}>
                {#each Array(store.settings.appLockPin?.length ?? 4) as _, i}
                  <div class="pin-dot" class:pin-dot-filled={i < pinEntry.length}></div>
                {/each}
              </div>
              <button class="pin-submit-btn" onclick={submitPin} tabindex="-1" aria-label="Submit PIN">Unlock</button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .splash { position: fixed; inset: 0; z-index: 9999; background: var(--bg-base); overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; animation: spIn 0.35s cubic-bezier(0,0,0.2,1) both; }
  .splash.exiting { animation: spOut 320ms cubic-bezier(0.4,0,1,1) both; }

  @keyframes spIn        { from { opacity:0; transform:scale(1.015) } to { opacity:1; transform:scale(1) } }
  @keyframes spOut       { from { opacity:1; transform:scale(1) }     to { opacity:0; transform:scale(0.96) } }
  @keyframes logoBreathe { 0%,100% { transform:scale(1); filter:drop-shadow(0 0 0px rgba(255,255,255,0)) } 50% { transform:scale(1.04); filter:drop-shadow(0 0 18px rgba(255,255,255,0.12)) } }
  @keyframes hintFade    { 0%,100% { opacity:0.35 } 50% { opacity:0.7 } }
  @keyframes pinShake    { 0%,100% { transform:translateX(0) } 20%,60% { transform:translateX(-6px) } 40%,80% { transform:translateX(6px) } }

  .logo-glow    { position: absolute; inset: -20px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%); animation: logoBreathe 4s ease-in-out infinite; }
  .logo-breathe { animation: logoBreathe 4s ease-in-out infinite; }
  .hint         { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); letter-spacing: 0.22em; text-transform: uppercase; margin: 0; user-select: none; animation: hintFade 3.5s ease-in-out infinite; }

  .error-box     { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 20px; border-radius: var(--radius-lg); background: var(--bg-surface); border: 1px solid var(--border-base); min-width: 200px; text-align: center; }
  .error-label   { font-family: var(--font-ui); font-size: 11px; font-weight: 500; color: var(--text-muted); letter-spacing: 0.06em; margin: 0; }
  .error-actions { display: flex; gap: 6px; }
  .err-btn       { padding: 5px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-base); background: transparent; color: var(--text-muted); cursor: pointer; font-family: var(--font-ui); font-size: 11px; letter-spacing: 0.04em; transition: border-color 0.15s, color 0.15s; }
  .err-btn:hover { border-color: var(--border-strong); color: var(--text-secondary); }
  .err-btn--primary       { border-color: var(--accent-dim); color: var(--accent-fg); background: var(--accent-muted); }
  .err-btn--primary:hover { border-color: var(--accent); color: var(--accent-bright); }

  .bottom-area      { display: flex; align-items: center; justify-content: center; min-height: 48px; position: relative; }
  .status-slot      { display: flex; align-items: center; justify-content: center; transition: opacity 0.35s ease; position: absolute; }
  .status-slot-hide { opacity: 0; pointer-events: none; }
  .status-text      { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); letter-spacing: 0.12em; margin: 0; min-width: 160px; text-align: center; }
  .loading-ring     { transition: opacity 0.5s ease; }
  .ring-hide        { opacity: 0; }

  .pin-slot         { display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); position: absolute; opacity: 0; transform: translateY(4px); transition: opacity 0.4s ease, transform 0.4s ease; pointer-events: none; }
  .pin-slot-visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
  .pin-card         { background: var(--bg-surface); border: 1px solid var(--border-base); border-radius: var(--radius-xl); padding: var(--sp-5) var(--sp-6); display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
  .pin-label        { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; margin: 0; }
  .pin-block        { display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); position: relative; }
  .pin-dots         { display: flex; gap: 12px; align-items: center; }
  .pin-dot          { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--border-strong); background: transparent; transition: background 0.12s, border-color 0.12s; }
  .pin-dot-filled   { background: var(--accent); border-color: var(--accent); }
  .pin-shake        { animation: pinShake 0.42s ease; }
  .pin-submit-btn   { opacity: 0; width: 1px; height: 1px; overflow: hidden; padding: 0; border: none; background: none; cursor: pointer; pointer-events: auto; position: absolute; }
</style>