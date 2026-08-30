<script lang="ts">
  import { ArrowLeft, ArrowRight }           from "phosphor-svelte";
  import { readerState }                     from "$lib/state/mangaReader.svelte";
  import type { Chapter }                    from "$lib/types";

  interface Props {
    style:                string;
    loading:              boolean;
    rtl:                  boolean;
    sliderPage:           number;
    sliderMax:            number;
    sliderPct:            number;
    lastPage:             number;
    displayChapter:       Chapter | null;
    adjacent:             { prev: Chapter | null; next: Chapter | null };
    uiVisible:            boolean;
    barPosition:          "top" | "left" | "right";
    onGoPrev:             () => void;
    onGoNext:             () => void;
    onJumpToPage:         (page: number, commit?: boolean) => void;
  }

  const {
    style, loading, rtl, sliderPage, sliderMax, sliderPct, lastPage,
    displayChapter, adjacent, uiVisible,
    barPosition,
    onGoPrev, onGoNext, onJumpToPage,
  }: Props = $props();

  const isVertical = $derived(barPosition === "left" || barPosition === "right");

  const hPct = $derived(`--pct:${sliderPct}%`);

  function sliderValToPage(raw: number): number {
    return rtl ? sliderMax - raw + 1 : raw;
  }

  function pageToSliderVal(page: number): number {
    return rtl ? sliderMax - page + 1 : page;
  }

  function handleH(e: Event) {
    onJumpToPage(sliderValToPage(Number((e.target as HTMLInputElement).value)), false);
  }

  function handleHCommit(e: Event) {
    onJumpToPage(sliderValToPage(Number((e.target as HTMLInputElement).value)), true);
  }

  let trackEl = $state<HTMLDivElement | null>(null);
  let dragging = $state(false);
  let pendingPage = 0;

  function pctFromPointer(clientY: number): number {
    if (!trackEl) return 0;
    const rect = trackEl.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  }

  function pageFromPct(pct: number): number {
    return Math.round(1 + pct * (sliderMax - 1));
  }

  function handleTrackPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging    = true;
    readerState.sliderDragging = true;
    pendingPage = pageFromPct(pctFromPointer(e.clientY));
    onJumpToPage(pendingPage, false);
  }

  function handleTrackPointerMove(e: PointerEvent) {
    if (!dragging) return;
    pendingPage = pageFromPct(pctFromPointer(e.clientY));
    onJumpToPage(pendingPage, false);
  }

  function handleTrackPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    readerState.sliderDragging = false;
    readerState.sliderHover    = false;
    onJumpToPage(pendingPage, true);
  }
</script>

{#if !isVertical}
  <div class="bottombar" class:hidden={!uiVisible}>
    <button class="nav-btn" onclick={onGoPrev}
      disabled={loading || (style === "longstrip" ? !adjacent.prev : (sliderPage === 1 && !adjacent.prev))}>
      <ArrowLeft size={13} weight="light" />
    </button>

    {#if sliderMax > 1}
      <div
        class="slider-wrap"
        onmouseenter={() => readerState.sliderHover = true}
        onmouseleave={() => readerState.sliderHover = false}
      >
        <input
          type="range"
          class="h-range"
          style={hPct}
          min={1}
          max={sliderMax}
          value={pageToSliderVal(sliderPage)}
          oninput={handleH}
          onchange={handleHCommit}
          onmousedown={() => readerState.sliderDragging = true}
          onmouseup={() => readerState.sliderDragging = false}
        />
        {#if readerState.sliderHover || readerState.sliderDragging}
          <div class="slider-tooltip" style="left:{sliderPct}%">
            {sliderPage} / {sliderMax}
          </div>
        {/if}
      </div>
    {/if}

    <button class="nav-btn" onclick={onGoNext}
      disabled={loading || (style === "longstrip" ? !adjacent.next : (sliderPage === sliderMax && !adjacent.next))}>
      <ArrowRight size={13} weight="light" />
    </button>
  </div>

{:else}
  <div class="vbar-progress" class:hidden={!uiVisible}>
    {#if sliderMax > 1}
      <div
        class="vslider-wrap"
        bind:this={trackEl}
        role="slider"
        aria-valuenow={sliderPage}
        aria-valuemin={1}
        aria-valuemax={sliderMax}
        tabindex="0"
        onmouseenter={() => readerState.sliderHover = true}
        onmouseleave={() => { if (!dragging) readerState.sliderHover = false; }}
        onpointerdown={handleTrackPointerDown}
        onpointermove={handleTrackPointerMove}
        onpointerup={handleTrackPointerUp}
        onpointercancel={handleTrackPointerUp}
      >
        <div class="vtrack">
          <div class="vtrack-fill" style="height:{sliderPct}%"></div>
        </div>

        <div class="vthumb" style="top:{sliderPct}%" class:dragging></div>

        {#if readerState.sliderHover || readerState.sliderDragging}
          <div
            class="vslider-tooltip"
            class:tooltip-right={barPosition === "right"}
            style="top:{sliderPct}%"
          >
            {sliderPage} / {sliderMax}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .bottombar {
    position: fixed; z-index: 40;
    bottom: var(--sp-4); left: 50%; transform: translateX(-50%);
    width: min(1320px, calc(100vw - var(--sp-8)));
    display: flex; align-items: center; gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-lg);
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
    transition: opacity 0.25s ease, transform 0.2s ease;
  }
  .bottombar.hidden { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px); }

  .nav-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex-shrink: 0; border-radius: var(--radius-md); border: none; color: var(--text-muted); transition: background var(--t-base), color var(--t-base); }
  .nav-btn:hover:not(:disabled) { background: var(--bg-raised); color: var(--text-primary); }
  .nav-btn:disabled { opacity: 0.25; cursor: default; }

  .slider-wrap { flex: 1; position: relative; display: flex; align-items: center; height: 34px; }

  .h-range { -webkit-appearance: none; appearance: none; width: 100%; height: 34px; background: transparent; cursor: pointer; position: relative; z-index: 2; margin: 0; padding: 0; }
  .h-range::-webkit-slider-runnable-track { height: 3px; background: linear-gradient(to right, var(--accent-fg) var(--pct, 0%), var(--border-strong) var(--pct, 0%)); border-radius: 2px; transition: height 0.15s ease, background 0.05s linear; }
  .h-range:hover::-webkit-slider-runnable-track,
  .h-range:active::-webkit-slider-runnable-track { height: 5px; }
  .h-range::-moz-range-track { height: 3px; background: var(--border-strong); border-radius: 2px; transition: height 0.15s ease; }
  .h-range::-moz-range-progress { height: 3px; background: var(--accent-fg); border-radius: 2px; transition: height 0.15s ease; }
  .h-range:hover::-moz-range-track, .h-range:active::-moz-range-track { height: 5px; }
  .h-range:hover::-moz-range-progress, .h-range:active::-moz-range-progress { height: 5px; }
  .h-range::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--accent-fg); box-shadow: 0 0 0 2px rgba(0,0,0,0.5); margin-top: -4.5px; transition: transform var(--t-fast); }
  .h-range:hover::-webkit-slider-thumb,
  .h-range:active::-webkit-slider-thumb { transform: scale(1.3); }
  .h-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--accent-fg); box-shadow: 0 0 0 2px rgba(0,0,0,0.5); border: none; transition: transform var(--t-fast); }
  .h-range:hover::-moz-range-thumb,
  .h-range:active::-moz-range-thumb { transform: scale(1.3); }

  .slider-tooltip { position: absolute; bottom: calc(100% + 2px); transform: translateX(-50%); background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-sm); padding: 2px 6px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-secondary); white-space: nowrap; pointer-events: none; z-index: 10; letter-spacing: var(--tracking-wide); }


  .vbar-progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    width: 100%;
    min-height: 0;
    padding: var(--sp-1) 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
  }
  .vbar-progress.hidden { opacity: 0; }

  .vslider-wrap {
    flex: 1;
    width: 100%;
    min-height: 0;
    position: relative;
    display: flex;
    justify-content: center;
    pointer-events: all;
    cursor: pointer;
    touch-action: none;
  }
  .vslider-wrap:focus { outline: none; }

  .vtrack {
    width: 5px;
    height: 100%;
    border-radius: 3px;
    background: var(--border-strong);
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    transition: width 0.15s ease;
  }
  .vslider-wrap:hover .vtrack { width: 7px; }

  .vtrack-fill {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    border-radius: 3px;
    background: var(--accent);
    transition: height 0.05s linear;
  }

  .vthumb {
    position: absolute;
    left: 50%;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px rgba(0,0,0,0.5);
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: transform var(--t-fast);
  }
  .vslider-wrap:hover .vthumb,
  .vthumb.dragging { transform: translate(-50%, -50%) scale(1.3); }

  .vslider-tooltip {
    position: absolute;
    left: calc(100% + 8px);
    transform: translateY(-50%);
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-secondary);
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
    letter-spacing: var(--tracking-wide);
  }
  .vslider-tooltip.tooltip-right { left: auto; right: calc(100% + 8px); }
</style>