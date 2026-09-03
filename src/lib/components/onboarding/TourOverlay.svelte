<script lang="ts">
  import { tick } from 'svelte'
  import { fade } from 'svelte/transition'
  import { goto } from '$app/navigation'
  import { settingsState } from '$lib/state/settings.svelte'
  import { app } from '$lib/state/app.svelte'
  import { tourState, TOUR_STEPS, nextTourStep, endTour } from '$lib/state/onboarding.svelte'

  const step   = $derived(TOUR_STEPS[tourState.step])
  const isLast = $derived(tourState.step === TOUR_STEPS.length - 1)

  const zoom = $derived.by(() => {
    void viewport
    void settingsState.settings.uiZoom
    const applied = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom-factor'))
    if (Number.isFinite(applied) && applied > 0) return applied
    const w = viewport.w || window.innerWidth
    const h = viewport.h || window.innerHeight
    return Math.max(0.6, Math.min(4, Math.max(0.8, Math.min(w / 1440, h / 820)) * (settingsState.settings.uiZoom ?? 1)))
  })

  let rect     = $state<DOMRect | null>(null)
  let viewport = $state({ w: 0, h: 0 })

  function unionRect(els: Element[]): DOMRect | null {
    if (!els.length) return null
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const el of els) {
      const r = el.getBoundingClientRect()
      left   = Math.min(left,   r.left)
      top    = Math.min(top,    r.top)
      right  = Math.max(right,  r.right)
      bottom = Math.max(bottom, r.bottom)
    }
    return new DOMRect(left, top, right - left, bottom - top)
  }

  function readRect(): DOMRect | null {
    if (!tourState.active || !step) return null
    return unionRect(Array.from(document.querySelectorAll(step.selector)))
  }

  function measure() {
    viewport = { w: window.innerWidth, h: window.innerHeight }
    const next = readRect()
    if (next) rect = next
  }

  $effect(() => {
    if (!tourState.active || !step) { rect = null; return }

    let cancelled = false
    let ro: ResizeObserver | null = null
    let mo: MutationObserver | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    async function setup() {
      if (step.settingsTab) app.setSettingsOpen(true, step.settingsTab)
      else app.setSettingsOpen(false)
      if (step.route) await goto(step.route)
      await tick()
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      if (cancelled) return

      measure()

      if (!readRect()) {
        let tries = 0
        pollTimer = setInterval(() => {
          if (cancelled || readRect() || ++tries > 20) {
            if (pollTimer) clearInterval(pollTimer)
            pollTimer = null
          }
          measure()
        }, 120)
      }

      const els = Array.from(document.querySelectorAll(step.selector))
      if (els.length) {
        ro = new ResizeObserver(measure)
        for (const el of els) ro.observe(el)
        ro.observe(document.body)
      }
      mo = new MutationObserver(measure)
      mo.observe(document.body, { attributes: true, childList: true, subtree: true })
      window.addEventListener('resize', measure)
      document.addEventListener('scroll', measure, true)
    }

    setup()

    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', measure, true)
    }
  })

  const box = $derived((() => {
    if (!rect || !step) return null
    if (rect.width < 1 && rect.height < 1) return null
    const pad = step.padding ?? 6
    const b = {
      l: (rect.left - pad) / zoom,
      t: (rect.top  - pad) / zoom,
      w: (rect.width  + pad * 2) / zoom,
      h: (rect.height + pad * 2) / zoom,
    }
    const w = viewport.w / zoom, h = viewport.h / zoom
    if (!w || !h) return null
    if (b.l > w || b.t > h || b.l + b.w < 0 || b.t + b.h < 0) return null
    return b
  })())

  const vw = $derived(viewport.w / zoom)
  const vh = $derived(viewport.h / zoom)

  const TOOLTIP_W = 232
  const TOOLTIP_H_EST = 150
  const MARGIN = 14

  const tooltipStyle = $derived((() => {
    if (!box) {
      return `left:${Math.max(MARGIN, (vw - TOOLTIP_W) / 2)}px; top:${Math.max(MARGIN, (vh - TOOLTIP_H_EST) / 2)}px;`
    }
    const placement = step?.placement ?? 'bottom'

    let left = placement === 'right' ? box.l + box.w + MARGIN : box.l
    let top  = placement === 'right' ? box.t                  : box.t + box.h + MARGIN

    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - TOOLTIP_W - MARGIN))
    top  = Math.min(Math.max(top,  MARGIN), Math.max(MARGIN, vh - TOOLTIP_H_EST - MARGIN))

    return `left:${left}px; top:${top}px;`
  })())
</script>

{#if tourState.active && step}
  <div class="frame" transition:fade={{ duration: 280 }}>
    {#if box}
      <div class="panel" style="left:0px; top:0px; width:{vw}px; height:{box.t}px;"></div>
      <div class="panel" style="left:0px; top:{box.t + box.h}px; width:{vw}px; height:{Math.max(0, vh - (box.t + box.h))}px;"></div>
      <div class="panel" style="left:0px; top:{box.t}px; width:{box.l}px; height:{box.h}px;"></div>
      <div class="panel" style="left:{box.l + box.w}px; top:{box.t}px; width:{Math.max(0, vw - (box.l + box.w))}px; height:{box.h}px;"></div>
      <div class="ring" style="left:{box.l}px; top:{box.t}px; width:{box.w}px; height:{box.h}px;"></div>
    {:else}
      <div class="panel" style="inset:0;"></div>
    {/if}

    <div class="tooltip" style={tooltipStyle}>
      <div class="tooltip-head">
        <span class="step-count">{tourState.step + 1} / {TOUR_STEPS.length}</span>
        <button class="skip" onclick={endTour}>Skip</button>
      </div>
      <p class="title">{step.title}</p>
      <p class="body">{step.body}</p>
      <button class="btn" onclick={nextTourStep}>{isLast ? 'Done' : 'Next'}</button>
    </div>
  </div>
{/if}

<style>
  .frame  { position: fixed; inset: 0; z-index: 10500; pointer-events: none; }
  .panel  {
    position: fixed; background: rgba(8,9,11,0.62); pointer-events: none;
    transition: left 0.34s cubic-bezier(0.16,1,0.3,1), top 0.34s cubic-bezier(0.16,1,0.3,1),
                width 0.34s cubic-bezier(0.16,1,0.3,1), height 0.34s cubic-bezier(0.16,1,0.3,1);
  }
  .ring   {
    position: fixed; border-radius: 8px;
    border: 1.5px solid var(--accent-fg);
    box-shadow: 0 0 0 3px rgba(107,143,107,0.18), 0 0 24px rgba(107,143,107,0.15);
    pointer-events: none;
    transition: left 0.34s cubic-bezier(0.16,1,0.3,1), top 0.34s cubic-bezier(0.16,1,0.3,1),
                width 0.34s cubic-bezier(0.16,1,0.3,1), height 0.34s cubic-bezier(0.16,1,0.3,1);
  }

  .tooltip {
    position: fixed;
    width: 232px;
    pointer-events: auto;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-lg); padding: var(--sp-3) var(--sp-4) var(--sp-4);
    box-shadow: 0 20px 48px rgba(0,0,0,0.55);
    transition: left 0.34s cubic-bezier(0.16,1,0.3,1), top 0.34s cubic-bezier(0.16,1,0.3,1);
  }

  .tooltip-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-2); }
  .step-count   { font-family: var(--font-ui); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-faint); }
  .skip         { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base); }
  .skip:hover   { color: var(--text-muted); }

  .title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); margin: 0 0 4px; }
  .body  { font-size: var(--text-xs); color: var(--text-muted); line-height: 1.5; margin: 0 0 var(--sp-3); }

  .btn       { width: 100%; padding: 7px; border-radius: var(--radius-md); background: var(--accent-muted); border: 1px solid var(--accent-dim); color: var(--accent-fg); font-size: var(--text-xs); font-family: var(--font-ui); cursor: pointer; transition: filter var(--t-base); }
  .btn:hover { filter: brightness(1.12); }
</style>