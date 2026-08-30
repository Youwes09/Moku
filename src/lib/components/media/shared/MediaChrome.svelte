<script lang="ts">
  import { X, CaretLeft, CaretRight, GearSix, ArrowsOut, ArrowsIn, Minus, DotsThree } from "phosphor-svelte";
  import { fly } from "svelte/transition";
  import { cubicIn, cubicOut } from "svelte/easing";
  import { mediaViewState } from "$lib/state/mediaView.svelte";
  import { app } from "$lib/state/app.svelte";
  import { platformService } from "$lib/platform-service";
  import type { Snippet } from "svelte";

  interface Props {
    title:         string;
    chapterLabel:  string;
    readout?:      string | null;
    hasPrev:       boolean;
    hasNext:       boolean;
    onPrev:        () => void;
    onNext:        () => void;
    onClose:       () => void;
    onOpenPreview?: () => void;
    endControls?:   Snippet;
    slider?:        Snippet;
    bottomStart?:   Snippet;
    bottomEnd?:     Snippet;
    showBottomBar?: boolean;
  }

  let {
    title, chapterLabel, readout = null,
    hasPrev, hasNext, onPrev, onNext, onClose, onOpenPreview,
    endControls, slider, bottomStart, bottomEnd, showBottomBar = true,
  }: Props = $props();

  const hidden  = $derived(!mediaViewState.uiVisible);
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  let menuOpen = $state(false);

  function closeMenu() { menuOpen = false; }

  $effect(() => {
    if (!menuOpen) return;
    const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".actions-wrap")) menuOpen = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); menuOpen = false; } };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc, true);
    };
  });
</script>

<div class="bar bar-top" class:hidden>
  <div class="bar-start">
    <button class="icon-btn close-btn" data-tip="Close" aria-label="Close reader" onclick={onClose}>
      <X size={14} weight="regular" />
    </button>

    <div class="bar-divider"></div>

    <button class="icon-btn" data-tip="Previous" aria-label="Previous" onclick={onPrev} disabled={!hasPrev}>
      <CaretLeft size={13} weight="regular" />
    </button>

    <div class="ch-hover-wrap">
      <div class="ch-pill">
        <span class="ch-marquee-track" onwheel={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).scrollLeft += e.deltaY; }}>
          {#if onOpenPreview}
            <button class="ch-marquee-content ch-preview-btn" data-tip="Series details" onclick={onOpenPreview}>
              <span class="ch-title">{title}</span>
              <span class="ch-sep">/</span>
              <span class="ch-name">{chapterLabel}</span>
            </button>
          {:else}
            <span class="ch-marquee-content">
              <span class="ch-title">{title}</span>
              <span class="ch-sep">/</span>
              <span class="ch-name">{chapterLabel}</span>
            </span>
          {/if}
        </span>
      </div>
      {#if readout}<span class="ch-page">{readout}</span>{/if}
    </div>

    <button class="icon-btn" data-tip="Next" aria-label="Next" onclick={onNext} disabled={!hasNext}>
      <CaretRight size={13} weight="regular" />
    </button>
  </div>

  <div class="bar-drag-gap" data-tauri-drag-region></div>

  <div class="bar-end">
    {#if endControls}{@render endControls()}{/if}

    <div class="bar-divider"></div>

    <div class="actions-wrap">
      <button class="icon-btn" class:active={menuOpen} data-tip="More" aria-label="More actions"
        onclick={() => (menuOpen = !menuOpen)}>
        <DotsThree size={16} weight="bold" />
      </button>

      {#if menuOpen}
        <div class="actions-popover" role="presentation" onclick={(e) => e.stopPropagation()}
          in:fly={{ y: -6, duration: 150, easing: cubicOut }}
          out:fly={{ y: -6, duration: 110, easing: cubicIn }}>
          <button class="action-row" onclick={() => { closeMenu(); app.setSettingsOpen(true); }}>
            <GearSix size={13} weight="regular" /><span>Settings</span>
          </button>
          <button class="action-row" onclick={() => { closeMenu(); mediaViewState.toggleFullscreen(); }}>
            {#if mediaViewState.isFullscreen}
              <ArrowsIn size={13} weight="regular" /><span>Exit fullscreen</span>
            {:else}
              <ArrowsOut size={13} weight="regular" /><span>Fullscreen</span>
            {/if}
          </button>
          {#if isTauri}
            <div class="action-divider"></div>
            <button class="action-row" onclick={() => { closeMenu(); platformService.minimize(); }}>
              <Minus size={13} weight="regular" /><span>Minimize</span>
            </button>
            <button class="action-row action-row-danger" onclick={() => { closeMenu(); platformService.close(); }}>
              <X size={13} weight="regular" /><span>Close window</span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

{#if showBottomBar}
<div class="bottombar" class:hidden>
  {#if bottomStart}
    {@render bottomStart()}
  {:else}
    <button class="nav-btn" data-tip="Previous" aria-label="Previous" onclick={onPrev} disabled={!hasPrev}>
      <CaretLeft size={15} weight="regular" />
    </button>
  {/if}
  <div class="slider-wrap">
    {#if slider}{@render slider()}{/if}
  </div>
  {#if bottomEnd}
    {@render bottomEnd()}
  {:else}
    <button class="nav-btn" data-tip="Next" aria-label="Next" onclick={onNext} disabled={!hasNext}>
      <CaretRight size={15} weight="regular" />
    </button>
  {/if}
</div>
{/if}

<style>
  .bar, .bottombar {
    position: fixed; z-index: 40;
    display: flex; align-items: center;
    border-radius: var(--radius-lg);
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
    user-select: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .bar-top {
    top: var(--sp-3); left: var(--sp-3); right: var(--sp-3);
    flex-direction: row; gap: 2px; padding: 0 var(--sp-2); height: 44px;
  }
  .bar.hidden { opacity: 0; pointer-events: none; transform: translateY(-8px); }

  .bar-start { display: flex; align-items: center; gap: 2px; flex-shrink: 0; overflow: hidden; min-width: 0; }
  .bar-end   { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .bar-drag-gap { flex: 1; height: 100%; cursor: grab; }
  .bar-drag-gap:active { cursor: grabbing; }

  .bar-divider { flex-shrink: 0; background: var(--border-dim); border-radius: 1px; width: 1px; height: 18px; margin: 0 var(--sp-1); }

  .icon-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: var(--radius-md);
    color: var(--text-muted); flex-shrink: 0; background: none; border: none; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .icon-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .icon-btn:disabled { opacity: 0.2; cursor: default; }
  .icon-btn.active { color: var(--accent-fg); background: var(--bg-raised); }
  .close-btn:hover:not(:disabled) { color: var(--text-primary); background: color-mix(in srgb, #c0392b 15%, transparent); }

  :global(.bar [data-tip]), :global(.bottombar [data-tip]) { position: relative; }
  :global(.bar [data-tip]:hover)::after,
  :global(.bottombar [data-tip]:hover)::after {
    content: attr(data-tip);
    position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
    background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-sm);
    padding: 3px 7px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-secondary);
    letter-spacing: var(--tracking-wide); white-space: nowrap; pointer-events: none;
    z-index: 50; animation: tip-in 0.1s ease both;
  }
  :global(.bottombar [data-tip]:hover)::after { top: auto; bottom: calc(100% + 6px); }
  @keyframes tip-in { from { opacity: 0; transform: translate(-50%, 2px) } to { opacity: 1; transform: translate(-50%, 0) } }

  .ch-hover-wrap { position: relative; min-width: 0; display: flex; align-items: center; gap: var(--sp-2); }
  .ch-pill {
    display: flex; align-items: center; font-size: var(--text-sm);
    color: var(--text-muted); overflow: hidden; white-space: nowrap; min-width: 0;
    padding: 3px 6px; border-radius: var(--radius-md); border: 1px solid transparent;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .ch-hover-wrap:hover .ch-pill { border-color: var(--border-dim); background: var(--bg-raised); }
  .ch-marquee-track { overflow-x: auto; min-width: 0; flex: 1; scrollbar-width: none; }
  .ch-marquee-track::-webkit-scrollbar { display: none; }
  .ch-marquee-content { display: inline-flex; align-items: center; gap: var(--sp-2); white-space: nowrap; }
  .ch-preview-btn { background: none; border: none; cursor: pointer; padding: 0; font-size: inherit; font-family: inherit; border-radius: var(--radius-sm); transition: opacity var(--t-fast); }
  .ch-preview-btn:hover { opacity: 0.7; }
  .ch-title { color: var(--text-secondary); font-weight: var(--weight-medium); }
  .ch-sep   { color: var(--text-faint); flex-shrink: 0; }
  .ch-name  { color: var(--text-muted); }
  .ch-page  { font-family: var(--font-ui); font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--text-faint); flex-shrink: 0; white-space: nowrap; }

  .actions-wrap { position: relative; }
  .actions-popover {
    position: absolute; top: calc(100% + 6px); right: 0;
    min-width: 168px; padding: 4px;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-md); box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    z-index: 50;
  }
  .action-row {
    display: flex; align-items: center; gap: var(--sp-2); width: 100%;
    padding: 7px 9px; border-radius: var(--radius-sm);
    background: none; border: none; cursor: pointer;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .action-row:hover { background: var(--bg-raised); color: var(--text-primary); }
  .action-row-danger:hover { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }
  .action-divider { height: 1px; background: var(--border-dim); margin: 4px 0; }

  .bottombar {
    bottom: var(--sp-4); left: 50%; transform: translateX(-50%);
    width: min(1320px, calc(100vw - var(--sp-8)));
    gap: var(--sp-3); padding: var(--sp-2) var(--sp-3);
  }
  .bottombar.hidden { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px); }
  .nav-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; flex-shrink: 0;
    border-radius: var(--radius-md); border: none;
    color: var(--text-muted); background: none; cursor: pointer;
    transition: background var(--t-base), color var(--t-base);
  }
  .nav-btn:hover:not(:disabled) { background: var(--bg-raised); color: var(--text-primary); }
  .nav-btn:disabled { opacity: 0.25; cursor: default; }
  .slider-wrap { flex: 1; position: relative; display: flex; align-items: center; height: 34px; }
</style>
