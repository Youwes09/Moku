<script lang="ts">
  import { ArrowLeft, ArrowRight } from "phosphor-svelte";
  import { readerState, MARKER_COLOR_HEX } from "../store/readerState.svelte";
  import type { BookmarkEntry, MarkerEntry } from "@store/state.svelte";
  import type { Chapter } from "@types";

  interface Props {
    style:                string;
    loading:              boolean;
    rtl:                  boolean;
    sliderPage:           number;
    sliderMax:            number;
    sliderPct:            number;
    lastPage:             number;
    displayChapter:       Chapter | null;
    currentBookmark:      BookmarkEntry | undefined;
    activeChapterMarkers: MarkerEntry[];
    adjacent:             { prev: Chapter | null; next: Chapter | null };
    uiVisible:            boolean;
    barPosition:          "top" | "left" | "right";
    onGoPrev:             () => void;
    onGoNext:             () => void;
    onJumpToPage:         (page: number) => void;
  }

  const {
    style, loading, rtl, sliderPage, sliderMax, sliderPct, lastPage,
    displayChapter, currentBookmark, activeChapterMarkers, adjacent, uiVisible,
    barPosition,
    onGoPrev, onGoNext, onJumpToPage,
  }: Props = $props();

  const isVertical = $derived(barPosition === "left" || barPosition === "right");

  const hValue = $derived(rtl ? sliderMax - sliderPage + 1 : sliderPage);
  const hPct   = $derived(`--pct:${sliderPct}%`);
  const vPct   = $derived(`--pct:${sliderPct}%`);

  function handleH(e: Event) {
    const raw = Number((e.target as HTMLInputElement).value);
    onJumpToPage(rtl ? sliderMax - raw + 1 : raw);
  }

  function handleV(e: Event) {
    onJumpToPage(Number((e.target as HTMLInputElement).value));
  }

  function markerPct(pageNumber: number, forRtl = false): number {
    if (sliderMax <= 1) return 0;
    const ord = forRtl ? sliderMax - pageNumber + 1 : pageNumber;
    return ((ord - 1) / (sliderMax - 1)) * 100;
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
          value={hValue}
          oninput={handleH}
          onmousedown={() => readerState.sliderDragging = true}
          onmouseup={() => readerState.sliderDragging = false}
        />

        <div class="slider-markers" aria-hidden="true">
          {#if currentBookmark && currentBookmark.chapterId === displayChapter?.id}
            <div class="slider-checkpoint bookmark-checkpoint"
              style="left:{markerPct(currentBookmark.pageNumber, rtl)}%"
              title="Bookmark: Page {currentBookmark.pageNumber}">
            </div>
          {/if}
          {#each activeChapterMarkers as m (m.id)}
            <div class="slider-checkpoint marker-checkpoint"
              style="left:{markerPct(m.pageNumber, rtl)}%;background:{MARKER_COLOR_HEX[m.color]}"
              title="{m.note ? m.note : 'Marker'} · Page {m.pageNumber}">
            </div>
          {/each}
        </div>

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
  <div class="vbar-progress" class:hidden={!uiVisible} class:vbar-right={barPosition === "right"}>
    {#if sliderMax > 1}
      <div
        class="vslider-wrap"
        onmouseenter={() => readerState.sliderHover = true}
        onmouseleave={() => readerState.sliderHover = false}
      >
        <input
          type="range"
          class="v-range"
          style={vPct}
          min={1}
          max={sliderMax}
          value={sliderPage}
          oninput={handleV}
          onmousedown={() => readerState.sliderDragging = true}
          onmouseup={() => readerState.sliderDragging = false}
        />

        <div class="vslider-markers" aria-hidden="true">
          {#if currentBookmark && currentBookmark.chapterId === displayChapter?.id}
            {@const bPct = sliderMax > 1 ? ((currentBookmark.pageNumber - 1) / (sliderMax - 1)) * 100 : 0}
            <div class="vslider-checkpoint bookmark-checkpoint"
              style="top:{bPct}%"
              title="Bookmark: Page {currentBookmark.pageNumber}">
            </div>
          {/if}
          {#each activeChapterMarkers as m (m.id)}
            {@const mPct = sliderMax > 1 ? ((m.pageNumber - 1) / (sliderMax - 1)) * 100 : 0}
            <div class="vslider-checkpoint marker-checkpoint"
              style="top:{mPct}%;background:{MARKER_COLOR_HEX[m.color]}"
              title="{m.note ? m.note : 'Marker'} · Page {m.pageNumber}">
            </div>
          {/each}
        </div>

        {#if readerState.sliderHover || readerState.sliderDragging}
          <div class="vslider-tooltip" style="top:{sliderPct}%" class:tooltip-right={barPosition === "right"}>
            {sliderPage} / {sliderMax}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .bottombar { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); border-top: 1px solid var(--border-dim); background: var(--bg-void); flex-shrink: 0; transition: opacity 0.25s ease; }
  .bottombar.hidden { opacity: 0; pointer-events: none; }

  .nav-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex-shrink: 0; border-radius: var(--radius-md); border: 1px solid var(--border-strong); color: var(--text-muted); transition: background var(--t-base), color var(--t-base); }
  .nav-btn:hover:not(:disabled) { background: var(--bg-raised); color: var(--text-primary); }
  .nav-btn:disabled { opacity: 0.25; cursor: default; }

  .slider-wrap { flex: 1; position: relative; display: flex; align-items: center; height: 34px; }

  .h-range {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 34px;
    background: transparent;
    cursor: pointer;
    position: relative;
    z-index: 2;
    margin: 0;
    padding: 0;
  }
  .h-range::-webkit-slider-runnable-track {
    height: 3px;
    background: linear-gradient(to right, var(--accent-fg) var(--pct, 0%), var(--border-strong) var(--pct, 0%));
    border-radius: 2px;
    transition: height 0.15s ease, background 0.05s linear;
  }
  .h-range:hover::-webkit-slider-runnable-track,
  .h-range:active::-webkit-slider-runnable-track { height: 5px; }
  .h-range::-moz-range-track { height: 3px; background: var(--border-strong); border-radius: 2px; transition: height 0.15s ease; }
  .h-range::-moz-range-progress { height: 3px; background: var(--accent-fg); border-radius: 2px; transition: height 0.15s ease; }
  .h-range:hover::-moz-range-track, .h-range:active::-moz-range-track { height: 5px; }
  .h-range:hover::-moz-range-progress, .h-range:active::-moz-range-progress { height: 5px; }
  .h-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-fg);
    box-shadow: 0 0 0 2px rgba(0,0,0,0.5);
    margin-top: -4.5px;
    transition: transform var(--t-fast);
  }
  .h-range:hover::-webkit-slider-thumb,
  .h-range:active::-webkit-slider-thumb { transform: scale(1.3); }
  .h-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-fg);
    box-shadow: 0 0 0 2px rgba(0,0,0,0.5);
    border: none;
    transition: transform var(--t-fast);
  }
  .h-range:hover::-moz-range-thumb,
  .h-range:active::-moz-range-thumb { transform: scale(1.3); }

  .slider-markers { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
  .slider-checkpoint { position: absolute; top: 50%; width: 4px; height: 10px; border-radius: 2px; transform: translate(-50%, -50%); }
  .bookmark-checkpoint { background: #ffffff; opacity: 0.8; }
  .marker-checkpoint { opacity: 0.85; }
  .slider-tooltip { position: absolute; bottom: calc(100% + 2px); transform: translateX(-50%); background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-sm); padding: 2px 6px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-secondary); white-space: nowrap; pointer-events: none; z-index: 10; letter-spacing: var(--tracking-wide); }

  .vbar-progress { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; width: 100%; padding: var(--sp-2) 0; transition: opacity 0.25s ease; pointer-events: none; }
  .vbar-progress.hidden { opacity: 0; }

  .vslider-wrap { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; width: 36px; pointer-events: all; margin: var(--sp-1) 0; }

  .v-range {
    -webkit-appearance: slider-vertical;
    appearance: slider-vertical;
    writing-mode: vertical-lr;
    direction: rtl;
    width: 34px;
    height: 100%;
    background: transparent;
    cursor: pointer;
    position: relative;
    z-index: 2;
    margin: 0;
    padding: 0;
  }
  .v-range::-webkit-slider-runnable-track { width: 5px; background: linear-gradient(to bottom, var(--accent-fg) var(--pct, 0%), var(--border-strong) var(--pct, 0%)); border-radius: 3px; transition: width 0.15s ease, background 0.05s linear; }
  .v-range:hover::-webkit-slider-runnable-track,
  .v-range:active::-webkit-slider-runnable-track { width: 7px; }
  .v-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent-fg);
    box-shadow: 0 0 0 2px rgba(0,0,0,0.5);
    margin-left: -4.5px;
    transition: transform var(--t-fast);
  }
  .v-range:hover::-webkit-slider-thumb,
  .v-range:active::-webkit-slider-thumb { transform: scale(1.3); }

  .vslider-markers { position: absolute; inset: 0; pointer-events: none; }
  .vslider-checkpoint { position: absolute; left: 50%; transform: translate(-50%, -50%); width: 12px; height: 5px; border-radius: 2px; }
  .vslider-tooltip { position: absolute; left: calc(100% + 6px); transform: translateY(-50%); background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-sm); padding: 2px 6px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-secondary); white-space: nowrap; pointer-events: none; z-index: 10; letter-spacing: var(--tracking-wide); }
  .vslider-tooltip.tooltip-right { left: auto; right: calc(100% + 6px); }
</style>