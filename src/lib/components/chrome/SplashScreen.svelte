<script module lang="ts">
  function getLiveSet(): Set<HTMLCanvasElement> {
    const g = window as any
    if (!g.__splashCanvasSet) g.__splashCanvasSet = new Set<HTMLCanvasElement>()
    return g.__splashCanvasSet as Set<HTMLCanvasElement>
  }

  function pruneSet(set: Set<HTMLCanvasElement>) {
    for (const el of set) if (!el.isConnected) set.delete(el)
  }

  export function splashDevRegister(el: HTMLCanvasElement) {
    const set = getLiveSet()
    pruneSet(set)
    set.add(el)
  }

  export function splashDevUnregister(el: HTMLCanvasElement) {
    const set = getLiveSet()
    set.delete(el)
    pruneSet(set)
  }

  export function splashDevLiveCount(): number {
    const set = getLiveSet()
    pruneSet(set)
    return set.size
  }

  export function splashDevNextMount(): number {
    const g = window as any
    g.__splashTotalMounts = (g.__splashTotalMounts ?? 0) + 1
    return g.__splashTotalMounts as number
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import logoUrl     from '$lib/assets/moku-icon-splash.svg'
  import { platformService } from '$lib/platform-service'

  const isTauri = platformService.platform === 'tauri'
  const isDev   = import.meta.env.DEV

  interface Props {
    mode?:           'loading' | 'idle' | 'locked'
    ringFull?:       boolean
    failed?:         boolean
    notConfigured?:  boolean
    authRequired?:   boolean
    showCards?:      boolean
    showFps?:        boolean
    showDevOverlay?: boolean
    pinLen?:         number
    pinCorrect?:     string
    windowsHelloEnabled?: boolean
    errorMessage?:   string
    errorLog?:       string
    onReady?:        () => void
    onUnlock?:       () => void
    onRetry?:        () => void
    onBypass?:       () => void
    onSkip?:         () => void
    onDismiss?:      () => void
    onCopyLog?:      () => void
    onOpenDataDir?:  () => void
  }

  let {
    mode = 'loading', ringFull = false, failed = false,
    notConfigured = false, authRequired = false, showCards = true, showFps = false, showDevOverlay = false,
    pinLen = 4, pinCorrect = '', windowsHelloEnabled = false,
    errorMessage = '', errorLog = '',
    onReady, onUnlock, onRetry, onBypass, onSkip, onDismiss, onCopyLog, onOpenDataDir,
  }: Props = $props()

  let logCopied = $state(false)

  let fpsEl    = $state<HTMLSpanElement | undefined>(undefined)
  let dots     = $state('')
  let ringProg = $state(0.025)
  let exiting  = $state(false)
  let exitLock = false

  let pinEntry = $state('')
  let pinShake = $state(false)

  let helloAvailable = $state(false)
  let helloBusy       = $state(false)
  let helloError       = $state(false)

  const logoLoadingSize = 140
  const logoIdleSize    = 128
  const ringR    = 70
  const ringPad  = 12
  const ringSize = (ringR + ringPad) * 2
  const ringC    = ringR + ringPad
  const ringCirc = 2 * Math.PI * ringR
  const ringArc  = $derived(ringCirc * Math.min(Math.max(ringProg, 0.025), 0.999))

  const EXIT_MS       = 320
  const PHASE1_TARGET = 0.85
  const PHASE1_MS     = 3000
  const PHASE2_TARGET = 0.95
  const PHASE2_MS     = 10000

  function triggerExit(cb?: () => void) {
    if (exitLock) return
    exitLock = true
    exiting  = true
    setTimeout(() => cb?.(), EXIT_MS)
  }

  let animFrame = 0
  let animStart: number | null = null
  let animPhase = 1

  function animateRing(ts: number) {
    if (exitLock) return
    if (animStart === null) animStart = ts
    const elapsed = ts - animStart
    if (animPhase === 1) {
      const t = Math.min(elapsed / PHASE1_MS, 1)
      ringProg = 0.025 + (1 - Math.pow(1 - t, 3)) * (PHASE1_TARGET - 0.025)
      if (t >= 1) { animPhase = 2; animStart = ts }
    } else {
      const t = Math.min(elapsed / PHASE2_MS, 1)
      ringProg = PHASE1_TARGET + (1 - Math.pow(1 - t, 4)) * (PHASE2_TARGET - PHASE1_TARGET)
    }
    animFrame = requestAnimationFrame(animateRing)
  }

  $effect(() => {
    if (mode !== 'loading' || failed || notConfigured || ringFull || !isTauri) return
    animStart = null
    animPhase = 1
    animFrame = requestAnimationFrame(animateRing)
    return () => cancelAnimationFrame(animFrame)
  })

  $effect(() => {
    if (!ringFull || mode === 'locked') { exitLock = false; exiting = false; return }
    cancelAnimationFrame(animFrame)
    animFrame = 0
    ringProg  = 1
    if (authRequired) return
    const t = setTimeout(() => triggerExit(onReady), 650)
    return () => clearTimeout(t)
  })

  function submitPin() {
    if (pinEntry === pinCorrect) {
      triggerExit(onUnlock)
    } else {
      pinShake = true
      pinEntry = ''
      setTimeout(() => (pinShake = false), 500)
    }
  }

  function onPinKey(e: KeyboardEvent) {
    if (mode !== 'locked' || exitLock) return
    if (e.key === 'Enter')     { e.preventDefault(); submitPin(); return }
    if (e.key === 'Backspace') { e.preventDefault(); pinEntry = pinEntry.slice(0, -1); return }
    if (/^\d$/.test(e.key)) {
      e.preventDefault()
      pinEntry = (pinEntry + e.key).slice(0, 8)
      if (pinEntry.length >= pinLen) submitPin()
    }
  }

  $effect(() => {
    if (mode !== 'locked') return
    pinEntry = ''
    window.addEventListener('keydown', onPinKey)
    return () => window.removeEventListener('keydown', onPinKey)
  })

  $effect(() => {
    if (mode !== 'locked' || !isTauri || !windowsHelloEnabled) return
    let cancelled = false
    import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke<boolean>('windows_hello_available')
    ).then(v => { if (!cancelled) helloAvailable = v }).catch(() => { if (!cancelled) helloAvailable = false })
    return () => { cancelled = true }
  })

  async function tryWindowsHello() {
    if (helloBusy || exitLock) return
    helloBusy  = true
    helloError = false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('windows_hello_authenticate', { reason: 'Unlock Moku' })
      triggerExit(onUnlock)
    } catch {
      helloError = true
      setTimeout(() => (helloError = false), 2000)
    } finally {
      helloBusy = false
    }
  }

  onMount(() => {
    const iv = setInterval(() => { dots = dots.length >= 3 ? '' : dots + '.' }, 420)

    if (mode === 'idle' && onDismiss) {
      const handler = () => triggerExit(onDismiss)
      const t = setTimeout(() => {
        window.addEventListener('keydown',    handler, { once: true })
        window.addEventListener('mousedown',  handler, { once: true })
        window.addEventListener('touchstart', handler, { once: true })
      }, 200)
      return () => {
        clearTimeout(t)
        clearInterval(iv)
        window.removeEventListener('keydown',    handler)
        window.removeEventListener('mousedown',  handler)
        window.removeEventListener('touchstart', handler)
      }
    }

    return () => clearInterval(iv)
  })

  interface CardDef    { cx: number; w: number; h: number; lines: number; alpha: number; speed: number; cycleSec: number; phase: number; travel: number; yStart: number; angleStart: number; tilt: number }
  interface CardTrig   { cosA: number; sinA: number; tiltRad: number }
  interface RenderState { cards: CardDef[]; trigs: CardTrig[]; stamps: HTMLCanvasElement[]; vignette: HTMLCanvasElement; CW: number; CH: number; scale: number }

  const LAYER_CFG = [
    { wMin: 26, wMax: 40, speedMin: 30,  speedMax: 50,  alpha: 0.22 },
    { wMin: 38, wMax: 56, speedMin: 52,  speedMax: 80,  alpha: 0.35 },
    { wMin: 54, wMax: 76, speedMin: 85,  speedMax: 120, alpha: 0.50 },
  ] as const

  const BUF = 80, COLS = 14

  function hash(n: number): number {
    let x = Math.imul(n ^ (n >>> 16), 0x45d9f3b)
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
    return ((x ^ (x >>> 16)) >>> 0) / 0xffffffff
  }

  function buildCards(vw: number, vh: number) {
    const cards: CardDef[] = []
    const laneW = vw / COLS
    for (let layer = 0; layer < 3; layer++) {
      const cfg = LAYER_CFG[layer]
      for (let col = 0; col < COLS; col++) {
        const seed  = col * 31 + layer * 97 + 7
        const w     = cfg.wMin + hash(seed + 1) * (cfg.wMax - cfg.wMin)
        const h     = w * 1.44
        const speed = cfg.speedMin + hash(seed + 5) * (cfg.speedMax - cfg.speedMin)
        const travel = vh + h + BUF
        cards.push({
          cx:         (col + 0.5) * laneW + (hash(seed + 2) * 2 - 1) * Math.max(0, (laneW - w) / 2 - 2),
          w, h,
          lines:      1 + Math.floor(hash(seed + 7) * 3),
          alpha:      cfg.alpha,
          speed,
          cycleSec:   travel / speed,
          phase:      ((col / COLS) + hash(seed + 6) * 0.6 + layer * 0.23) % 1,
          travel,
          yStart:     vh + h / 2 + BUF / 2,
          angleStart: hash(seed + 3) * 50 - 25,
          tilt:       (hash(seed + 4) * 2 - 1) * 18,
        })
      }
    }
    const trigs: CardTrig[] = cards.map(c => ({
      cosA:    Math.cos(c.angleStart * (Math.PI / 180)),
      sinA:    Math.sin(c.angleStart * (Math.PI / 180)),
      tiltRad: c.tilt * (Math.PI / 180),
    }))
    return { cards, trigs }
  }

  function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y);         ctx.lineTo(x + w - r, y);     ctx.arcTo(x + w, y,     x + w, y + r,     r)
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h);     ctx.arcTo(x,     y + h, x,     y + h - r, r)
    ctx.lineTo(x, y + r);         ctx.arcTo(x,     y,     x + r, y,         r)
    ctx.closePath()
  }

  const STAMP_PAD = 6

  function buildStamp(c: CardDef, dpr: number): HTMLCanvasElement {
    const oc  = document.createElement('canvas')
    oc.width  = Math.round(Math.ceil(c.w + STAMP_PAD * 2) * dpr)
    oc.height = Math.round(Math.ceil(c.h + STAMP_PAD * 2) * dpr)
    const ctx = oc.getContext('2d')!
    ctx.scale(dpr, dpr)
    const x0     = STAMP_PAD, y0 = STAMP_PAD
    const coverH = c.w * 0.72 * 1.05
    const lineY0 = y0 + 3 + coverH + 5
    ctx.fillStyle   = 'rgba(0,0,0,0.5)';         rrect(ctx, x0 + 2, y0 + 2, c.w, c.h, 4);                   ctx.fill()
    ctx.fillStyle   = 'rgba(255,255,255,0.07)';  rrect(ctx, x0, y0, c.w, c.h, 4);                            ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';  ctx.lineWidth = 1.2; rrect(ctx, x0, y0, c.w, c.h, 4);       ctx.stroke()
    ctx.fillStyle   = 'rgba(255,255,255,0.15)';  rrect(ctx, x0 + 3, y0 + 3, c.w - 6, coverH, 3);            ctx.fill()
    ctx.fillStyle   = 'rgba(255,255,255,0.08)';  rrect(ctx, x0 + 3, y0 + 3, (c.w - 6) * 0.45, coverH, 3);  ctx.fill()
    for (let li = 0; li < c.lines; li++) {
      ctx.fillStyle = li === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.20)'
      ctx.fillRect(x0 + 4, lineY0 + li * 8, (c.w - 8) * (li === 0 ? 0.78 : 0.52), li === 0 ? 3 : 2)
    }
    return oc
  }

  function buildVignette(vw: number, vh: number, dpr: number): HTMLCanvasElement {
    const oc  = document.createElement('canvas')
    oc.width  = Math.round(vw * dpr)
    oc.height = Math.round(vh * dpr)
    const ctx = oc.getContext('2d')!
    ctx.scale(dpr, dpr)
    const g = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, Math.max(vw, vh) * 0.65)
    g.addColorStop(0,   'rgba(0,0,0,0)')
    g.addColorStop(0.4, 'rgba(0,0,0,0)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.25)')
    g.addColorStop(1,   'rgba(0,0,0,0.65)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, vw, vh)
    return oc
  }

  function drawFrame(
    ctx: CanvasRenderingContext2D, t: number, cw: number, ch: number, dpr: number,
    cards: CardDef[], trigs: CardTrig[], stamps: HTMLCanvasElement[], vignette: HTMLCanvasElement,
  ) {
    ctx.clearRect(0, 0, cw, ch)
    for (let i = 0; i < cards.length; i++) {
      const c     = cards[i]
      const p     = ((t / c.cycleSec) + c.phase) % 1
      const alpha = p < 0.07 ? (p / 0.07) * c.alpha : p > 0.86 ? ((1 - p) / 0.14) * c.alpha : c.alpha
      if (alpha < 0.005) continue
      const cy    = c.yStart - p * c.travel
      const tg    = trigs[i]
      const delta = tg.tiltRad * p
      const cos   = tg.cosA * Math.cos(delta) - tg.sinA * Math.sin(delta)
      const sin   = tg.sinA * Math.cos(delta) + tg.cosA * Math.sin(delta)
      ctx.globalAlpha = alpha
      ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, c.cx * dpr, cy * dpr)
      const sw = stamps[i].width / dpr, sh = stamps[i].height / dpr
      ctx.drawImage(stamps[i], -sw / 2, -sh / 2, sw, sh)
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.drawImage(vignette, 0, 0, cw, ch)
  }

  let fpsFrames = 0, fpsLast = -1
  function tickFps(now: number) {
    if (fpsLast < 0) { fpsLast = now; return }
    fpsFrames++
    if (now - fpsLast >= 500) {
      const fps = Math.round(fpsFrames / ((now - fpsLast) / 1000))
      fpsFrames = 0
      fpsLast   = now
      if (fpsEl) fpsEl.textContent = `${fps} fps`
    }
  }

  interface DevMetrics {
    totalMounts:  number
    resizeCount:  number
    stampCount:   number
    mountedAt:    number
    lastResizeAt: number | null
  }

  let devMetrics   = $state<DevMetrics | null>(null)
  let uptimeSecs   = $state(0)
  let devLiveCount = $state(0)

  $effect(() => {
    if (!isDev || mode !== 'idle' || !devMetrics) return
    const start = Date.now()
    const iv = setInterval(() => { uptimeSecs = Math.floor((Date.now() - start) / 1000) }, 1000)
    return () => clearInterval(iv)
  })

  function fmtUptime(s: number): string {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  function fmtAgo(ts: number | null): string {
    if (ts === null) return '—'
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  function mountCanvas(el: HTMLCanvasElement) {
    const ctx = el.getContext('2d')!
    let live: RenderState | null = null
    let lastLogW = 0, lastLogH = 0, lastScale = 0, buildGen = 0

    if (isDev && mode === 'idle') {
      splashDevRegister(el)
      devLiveCount = splashDevLiveCount()
      uptimeSecs   = 0
      devMetrics   = {
        totalMounts:  splashDevNextMount(),
        resizeCount:  0,
        stampCount:   0,
        mountedAt:    Date.now(),
        lastResizeAt: null,
      }
    }

    function cleanup() {
      if (live) {
        live.stamps.forEach(c => { c.width = 0; c.height = 0 })
        live.vignette.width  = 0
        live.vignette.height = 0
        live = null
      }
      ctx.clearRect(0, 0, el.width, el.height)
    }

    function applySize(logW: number, logH: number, scale: number) {
      const gen = ++buildGen
      if (logW <= 0 || logH <= 0) return
      if (logW === lastLogW && logH === lastLogH && scale === lastScale) return
      lastLogW = logW; lastLogH = logH; lastScale = scale
      if (live) cleanup()
      const built  = buildCards(logW, logH)
      const stamps = built.cards.map(c => buildStamp(c, scale))
      const vig    = buildVignette(logW, logH, scale)
      el.width  = Math.round(logW * scale)
      el.height = Math.round(logH * scale)
      if (gen === buildGen) {
        live = { cards: built.cards, trigs: built.trigs, stamps, vignette: vig, CW: el.width, CH: el.height, scale }
        if (isDev && mode === 'idle' && devMetrics) {
          devMetrics = {
            ...devMetrics,
            resizeCount:  devMetrics.resizeCount + 1,
            stampCount:   stamps.length,
            lastResizeAt: Date.now(),
          }
        }
      }
    }

    let extraCleanup: (() => void) | undefined

    if (isTauri) {
      let tauriRo: ResizeObserver | undefined
      let tauriUnlisten: (() => void) | undefined
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const win = getCurrentWindow()
        const doSync = () => Promise.all([win.innerSize(), win.scaleFactor()])
          .then(([phys, scale]) => applySize(phys.width / scale, phys.height / scale, scale))
        doSync()
        tauriRo = new ResizeObserver(() => doSync())
        tauriRo.observe(el)
        win.onFocusChanged(() => doSync()).then(u => { tauriUnlisten = u })
      })
      extraCleanup = () => { tauriRo?.disconnect(); tauriUnlisten?.() }
    } else {
      const syncWeb = () => applySize(el.clientWidth, el.clientHeight, window.devicePixelRatio || 1)
      const ro = new ResizeObserver(() => syncWeb())
      ro.observe(el)
      requestAnimationFrame(() => syncWeb())
      extraCleanup = () => ro.disconnect()
    }

    let raf = 0, t0 = -1, paused = false

    function frame(now: number) {
      if (paused) { raf = 0; return }
      raf = requestAnimationFrame(frame)
      if (!live) return
      const { cards, trigs, stamps, vignette, CW, CH, scale } = live
      if (CW <= 0 || CH <= 0 || vignette.width <= 0 || vignette.height <= 0) return
      if (stamps.some(s => s.width <= 0 || s.height <= 0)) return
      if (t0 < 0) t0 = now
      if (showFps) tickFps(now)
      drawFrame(ctx, (now - t0) / 1000, CW, CH, scale, cards, trigs, stamps, vignette)
    }

    function pause()  { paused = true; t0 = -1 }
    function resume() { if (!paused) return; paused = false; raf = requestAnimationFrame(frame) }
    function onVis()  { document.hidden ? pause() : resume() }

    document.addEventListener('visibilitychange', onVis)
    raf = requestAnimationFrame(frame)

    return {
      destroy() {
        cancelAnimationFrame(raf)
        cleanup()
        extraCleanup?.()
        document.removeEventListener('visibilitychange', onVis)
        if (isDev && mode === 'idle') {
          splashDevUnregister(el)
          devLiveCount = splashDevLiveCount()
        }
      }
    }
  }
</script>

<div class="splash" class:exiting style="cursor:{mode === 'idle' ? 'pointer' : 'default'}">
  {#if showCards}
    <canvas style="position:absolute;inset:0;pointer-events:none;width:100%;height:100%" use:mountCanvas></canvas>
    {#if showFps}
      <span bind:this={fpsEl} style="position:absolute;top:8px;right:8px;font-family:var(--font-ui);font-size:10px;color:var(--text-faint);z-index:2;pointer-events:none"></span>
    {/if}
  {/if}

  {#if isDev && mode === 'idle' && devMetrics && showDevOverlay}
    <div class="dev-overlay">
      <span class="dev-title">canvas · idle splash</span>
      <div class="dev-grid">
        <span class="dev-k">live</span>          <span class="dev-v" class:dev-warn={devLiveCount > 1}>{devLiveCount}</span>
        <span class="dev-k">total mounts</span>  <span class="dev-v">{devMetrics.totalMounts}</span>
        <span class="dev-k">stamps</span>        <span class="dev-v">{devMetrics.stampCount}</span>
        <span class="dev-k">resizes</span>       <span class="dev-v">{devMetrics.resizeCount}</span>
        <span class="dev-k">uptime</span>        <span class="dev-v">{fmtUptime(uptimeSecs)}</span>
        <span class="dev-k">last resize</span>   <span class="dev-v">{fmtAgo(devMetrics.lastResizeAt)}</span>
      </div>
    </div>
  {/if}

  {#if mode === 'idle'}
    <div style="z-index:1;display:flex;flex-direction:column;align-items:center">
      <div style="position:relative;width:{logoIdleSize}px;height:{logoIdleSize}px;margin-bottom:32px">
        <div class="logo-glow"></div>
        <img src={logoUrl} alt="Moku" class="logo-breathe" style="width:{logoIdleSize}px;height:{logoIdleSize}px;border-radius:28px;display:block;position:relative" />
      </div>
      <p class="hint">press any key to continue</p>
    </div>

  {:else if mode === 'locked'}
    <div class="pin-card" class:pin-card--leaving={exiting}>
      <div class="logo-wrap">
        <div class="logo-glow"></div>
        <img src={logoUrl} alt="Moku" class="logo-breathe" style="width:56px;height:56px;border-radius:14px;display:block;position:relative" />
      </div>
      <p class="pin-label">Enter PIN</p>
      <div class="pin-dots" class:pin-shake={pinShake}>
        {#each Array(pinLen) as _, i}
          <div class="pin-dot" class:filled={i < pinEntry.length}></div>
        {/each}
      </div>
      {#if windowsHelloEnabled && helloAvailable}
        <button class="hello-btn" class:hello-btn--error={helloError} disabled={helloBusy} onclick={tryWindowsHello}>
          {helloBusy ? 'Waiting…' : helloError ? 'Try again' : 'Use Windows Hello'}
        </button>
      {/if}
    </div>

  {:else if isTauri || failed || notConfigured || ringFull}
    <div style="position:relative;width:{ringSize}px;height:{ringSize}px;margin-bottom:20px;display:flex;align-items:center;justify-content:center">
      {#if !failed && !notConfigured && isTauri}
        <svg width={ringSize} height={ringSize} class="loading-ring" style="position:absolute;top:0;left:0;pointer-events:none">
          <circle cx={ringC} cy={ringC} r={ringR} fill="none" stroke="var(--border-base)" stroke-width="2" />
          <circle cx={ringC} cy={ringC} r={ringR} fill="none" stroke="var(--accent)" stroke-width="2"
            stroke-linecap="round"
            stroke-dasharray="{ringArc} {ringCirc}"
            transform="rotate(-90 {ringC} {ringC})"
            style="transition:stroke-dasharray 0.4s cubic-bezier(0.4,0,0.2,1)" />
        </svg>
      {/if}
      <img src={logoUrl} alt="Moku" style="width:{logoLoadingSize}px;height:{logoLoadingSize}px;border-radius:32px;display:block;position:relative" />
    </div>
    <div class="bottom-area" style="z-index:1">
      {#if failed || notConfigured}
        <div class="error-box anim-fade-up">
          <p class="error-label">{failed ? (errorMessage || 'Could not reach server') : 'Server not configured'}</p>
          {#if errorLog}
            <pre class="error-log">{errorLog.split('\n').slice(-12).join('\n')}</pre>
          {/if}
          <div class="error-actions">
            <button class="err-btn" onclick={() => onRetry?.()}>Retry</button>
            {#if errorLog && onCopyLog}
              <button class="err-btn" onclick={() => { onCopyLog?.(); logCopied = true; setTimeout(() => (logCopied = false), 1500) }}>{logCopied ? 'Copied' : 'Copy log'}</button>
            {/if}
            {#if onOpenDataDir}
              <button class="err-btn" onclick={() => onOpenDataDir?.()}>Data folder</button>
            {/if}
            <button class="err-btn err-btn--primary" onclick={() => onBypass?.()}>Enter app</button>
          </div>
        </div>
      {:else if authRequired && ringFull}
        <div class="error-box anim-fade-up">
          <p class="error-label">Waiting for login</p>
          <div class="error-actions">
            <button class="err-btn" onclick={() => { onSkip?.() }}>Skip</button>
          </div>
        </div>
      {:else}
        <p class="status-text">{ringFull ? '' : `Initializing server${dots}`}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .splash  { position:fixed; inset:0; z-index:9999; background:var(--bg-base); overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; animation:spIn 0.35s cubic-bezier(0,0,0.2,1) both; }
  .exiting { animation:spOut 320ms cubic-bezier(0.4,0,1,1) both; }

  @keyframes spIn        { from { opacity:0; transform:scale(1.015) } to { opacity:1; transform:scale(1) } }
  @keyframes spOut       { from { opacity:1; transform:scale(1) }     to { opacity:0; transform:scale(0.96) } }
  @keyframes logoBreathe { 0%,100% { transform:scale(1); filter:drop-shadow(0 0 0px rgba(255,255,255,0)) } 50% { transform:scale(1.04); filter:drop-shadow(0 0 18px rgba(255,255,255,0.12)) } }
  @keyframes hintFade    { 0%,100% { opacity:0.35 } 50% { opacity:0.7 } }
  @keyframes pinShake    { 0%,100% { transform:translateX(0) } 20%,60% { transform:translateX(-6px) } 40%,80% { transform:translateX(6px) } }

  .logo-glow    { position:absolute; inset:-20px; border-radius:50%; background:radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%); animation:logoBreathe 4s ease-in-out infinite; }
  .logo-breathe { animation:logoBreathe 4s ease-in-out infinite; }
  .hint         { font-family:var(--font-ui); font-size:10px; color:var(--text-faint); letter-spacing:0.22em; text-transform:uppercase; margin:0; user-select:none; animation:hintFade 3.5s ease-in-out infinite; }

  .logo-wrap { position:relative; width:72px; height:72px; display:flex; align-items:center; justify-content:center; }

  .pin-card          { z-index:1; width:min(280px,calc(100vw - 48px)); background:var(--bg-surface); border:1px solid var(--border-base); border-radius:var(--radius-xl); padding:var(--sp-6) var(--sp-5); display:flex; flex-direction:column; align-items:center; gap:var(--sp-3); box-shadow:0 32px 80px rgba(0,0,0,0.75); animation:cardIn 0.38s cubic-bezier(0.22,1,0.36,1) 0.06s both; }
  .pin-card--leaving { animation:cardOut 0.28s cubic-bezier(0.4,0,1,1) both; }

  .pin-label { font-family:var(--font-ui); font-size:var(--text-xs); color:var(--text-faint); letter-spacing:var(--tracking-wider); text-transform:uppercase; margin:0; }
  .pin-dots  { display:flex; gap:12px; align-items:center; }
  .pin-dot   { width:10px; height:10px; border-radius:50%; border:1px solid var(--border-strong); background:transparent; transition:background 0.12s, border-color 0.12s; }
  .pin-dot.filled { background:var(--accent); border-color:var(--accent); }
  .pin-shake { animation:pinShake 0.42s ease; }

  .hello-btn { margin-top:var(--sp-1); padding:6px 14px; border-radius:var(--radius-md); border:1px solid var(--border-base); background:transparent; color:var(--text-faint); cursor:pointer; font-family:var(--font-ui); font-size:11px; letter-spacing:0.04em; transition:border-color 0.15s, color 0.15s; }
  .hello-btn:hover:not(:disabled) { border-color:var(--border-strong); color:var(--text-secondary); }
  .hello-btn:disabled { opacity:0.5; cursor:default; }
  .hello-btn--error { border-color:color-mix(in srgb, var(--color-error) 40%, transparent); color:var(--color-error); }

  @keyframes cardIn  { from { opacity:0; transform:translateY(28px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
  @keyframes cardOut { from { opacity:1; transform:translateY(0) scale(1) } to { opacity:0; transform:translateY(18px) scale(0.97) } }

  .bottom-area { display:flex; align-items:center; justify-content:center; min-height:48px; }
  .status-text { font-family:var(--font-ui); font-size:10px; color:var(--text-faint); letter-spacing:0.12em; margin:0; min-width:160px; text-align:center; }
  .loading-ring { transition:opacity 0.5s ease; }

  .error-box     { display:flex; flex-direction:column; align-items:center; gap:12px; padding:16px 20px; border-radius:var(--radius-lg); background:var(--bg-surface); border:1px solid var(--border-base); max-width:min(520px,calc(100vw - 48px)); text-align:center; }
  .error-label   { font-family:var(--font-ui); font-size:11px; font-weight:500; color:var(--text-muted); letter-spacing:0.06em; margin:0; }
  .error-log     { font-family:var(--font-mono,monospace); font-size:10px; line-height:1.45; color:var(--text-faint); background:var(--bg-void); border:1px solid var(--border-dim); border-radius:var(--radius-md); padding:8px 10px; margin:0; max-height:160px; max-width:100%; overflow:auto; white-space:pre-wrap; text-align:left; }
  .error-actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
  .err-btn       { padding:5px 14px; border-radius:var(--radius-md); border:1px solid var(--border-base); background:transparent; color:var(--text-muted); cursor:pointer; font-family:var(--font-ui); font-size:11px; letter-spacing:0.04em; transition:border-color 0.15s, color 0.15s; }
  .err-btn:hover { border-color:var(--border-strong); color:var(--text-secondary); }
  .err-btn--primary       { border-color:var(--accent-dim); color:var(--accent-fg); background:var(--accent-muted); }
  .err-btn--primary:hover { border-color:var(--accent); color:var(--accent-bright); }

  .dev-overlay { position:absolute; top:12px; left:12px; z-index:10; background:rgba(0,0,0,0.72); border:1px solid rgba(255,255,255,0.10); border-radius:6px; padding:8px 10px; pointer-events:none; backdrop-filter:blur(6px); }
  .dev-title   { display:block; font-family:var(--font-ui); font-size:9px; letter-spacing:0.14em; text-transform:uppercase; color:var(--accent); margin-bottom:6px; }
  .dev-grid    { display:grid; grid-template-columns:auto auto; column-gap:12px; row-gap:2px; }
  .dev-k       { font-family:var(--font-ui); font-size:10px; color:var(--text-faint); white-space:nowrap; }
  .dev-v       { font-family:var(--font-ui); font-size:10px; color:var(--text-secondary); text-align:right; white-space:nowrap; }
  .dev-warn    { color:#f87171; }
</style>