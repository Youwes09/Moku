<script lang="ts">
  import {
    X, CaretLeft, CaretRight, CaretUp, CaretDown,
    MagnifyingGlassMinus, MagnifyingGlassPlus,
    Bookmark, MapPin, Download, Check, GearSix, Sliders,
  } from "phosphor-svelte";
  import { store, updateSettings }  from "@store/state.svelte";
  import { openReader, closeReader } from "@store/state.svelte";
  import { readerState, MARKER_COLORS, MARKER_COLOR_HEX, ZOOM_STEP, ZOOM_MIN, ZOOM_MAX } from "../store/readerState.svelte";
  import { fly } from "svelte/transition";
  import { cubicOut, cubicIn } from "svelte/easing";
  import type { Chapter } from "@types";

  import type { Snippet } from "svelte";

  interface Props {
    displayChapter:      Chapter | null;
    adjacent:            { prev: Chapter | null; next: Chapter | null };
    visibleChunkLastPage: number;
    zoom:                number;
    zoomPct:             number;
    isFullscreen:        boolean;
    isBookmarked:        boolean;
    hasMarkerOnPage:     boolean;
    currentPageMarkers:  { id: string; color: import("@store/state.svelte").MarkerColor; note: string }[];
    uiVisible:           boolean;
    hideTimer:           ReturnType<typeof setTimeout> | null;
    barPosition:         "top" | "left" | "right";
    progressBar?:        Snippet;
    onCaptureZoomAnchor: () => void;
    onRestoreZoomAnchor: () => void;
    onMaybeMarkRead:     () => void;
    onToggleBookmark:    () => void;
    onCommitMarker:      () => void;
    onDeleteMarker:      () => void;
    onClampZoom:         (z: number) => number;
    onApplySettings:     (patch: Parameters<typeof updateSettings>[0]) => void;
    onDlOpen:            () => void;
    onSettingsOpen:      () => void;
    hasMangaOverride:    boolean;
    win:                 import("@tauri-apps/api/window").Window;
  }

  const {
    displayChapter, adjacent, visibleChunkLastPage,
    zoom, zoomPct, isFullscreen,
    isBookmarked, hasMarkerOnPage, currentPageMarkers,
    uiVisible, hideTimer,
    barPosition, progressBar,
    onCaptureZoomAnchor, onRestoreZoomAnchor,
    onMaybeMarkRead, onToggleBookmark, onCommitMarker, onDeleteMarker,
    onClampZoom, onApplySettings, onDlOpen, onSettingsOpen,
    hasMangaOverride, win,
  }: Props = $props();

  const isVertical = $derived(barPosition === "left" || barPosition === "right");
  const popoverSide = $derived(
    barPosition === "left" ? "right" :
    barPosition === "right" ? "left" :
    "bottom"
  );

  function adjustZoom(delta: number) {
    onCaptureZoomAnchor();
    onApplySettings({ readerZoom: onClampZoom(zoom + delta) });
    onRestoreZoomAnchor();
  }

  function resetZoom() {
    onCaptureZoomAnchor();
    onApplySettings({ readerZoom: 1.0 });
    onRestoreZoomAnchor();
  }

  function keepUiAlive() {
    readerState.uiVisible = true;
    if (hideTimer) clearTimeout(hideTimer);
  }

  let wcTimer: ReturnType<typeof setTimeout> | null = null;

  function wcResetTimer() {
    if (wcTimer) clearTimeout(wcTimer);
    wcTimer = setTimeout(() => { readerState.winOpen = false; }, 1500);
  }

  $effect(() => {
    if (readerState.winOpen) wcResetTimer();
    else if (wcTimer) { clearTimeout(wcTimer); wcTimer = null; }
    return () => { if (wcTimer) clearTimeout(wcTimer); };
  });

  function openMarkerPopover() {
    if (currentPageMarkers.length > 0) {
      const first = currentPageMarkers[0];
      readerState.openMarker(first.id, first.note, first.color);
    } else {
      readerState.openMarker("", "", "yellow");
    }
  }

  let chapterHover = $state(false);
  let chapterHoverTimer: ReturnType<typeof setTimeout> | null = null;

  function showChapterPopover() {
    if (chapterHoverTimer) clearTimeout(chapterHoverTimer);
    chapterHover = true;
  }

  function hideChapterPopover() {
    chapterHoverTimer = setTimeout(() => { chapterHover = false; }, 120);
  }
</script>

<div
  class="bar"
  class:bar-top={barPosition === "top"}
  class:bar-left={barPosition === "left"}
  class:bar-right={barPosition === "right"}
  class:hidden={!uiVisible}
>
  <div class="bar-start">
    <button class="icon-btn" onclick={closeReader} title="Close reader"><X size={15} weight="light" /></button>

    <button class="icon-btn"
      onclick={() => { if (adjacent.prev) { onMaybeMarkRead(); openReader(adjacent.prev, store.activeChapterList); } }}
      disabled={!adjacent.prev}>
      {#if isVertical}
        <CaretUp size={14} weight="light" />
      {:else}
        <CaretLeft size={14} weight="light" />
      {/if}
    </button>

    <div
      class="ch-hover-wrap"
      onmouseenter={showChapterPopover}
      onmouseleave={hideChapterPopover}
      role="presentation"
    >
      <button class="ch-pill" title="{store.activeManga?.title} / {displayChapter?.name}">
        {#if isVertical}
          <span class="ch-info">&#xE2CE;</span>
        {:else}
          <span class="ch-marquee-track" onwheel={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).scrollLeft += e.deltaY; }}>
            <span class="ch-marquee-content">
              <span class="ch-title">{store.activeManga?.title}</span>
              <span class="ch-sep">/</span>
              <span class="ch-name">{displayChapter?.name}</span>
            </span>
          </span>
        {/if}
      </button>
      {#if !isVertical}
        <span class="ch-page">{store.pageNumber} / {visibleChunkLastPage || "…"}</span>
      {/if}

      {#if chapterHover && isVertical}
        <div class="ch-popover ch-popover-{popoverSide}">
          <span class="ch-pop-title">{store.activeManga?.title}</span>
          <span class="ch-pop-sep">/</span>
          <span class="ch-pop-name">{displayChapter?.name}</span>
          <span class="ch-pop-page">{store.pageNumber} / {visibleChunkLastPage || "…"}</span>
        </div>
      {/if}
    </div>

    <button class="icon-btn"
      onclick={() => { if (adjacent.next) { onMaybeMarkRead(); openReader(adjacent.next, store.activeChapterList); } }}
      disabled={!adjacent.next}>
      {#if isVertical}
        <CaretDown size={14} weight="light" />
      {:else}
        <CaretRight size={14} weight="light" />
      {/if}
    </button>

    {#if !isVertical}
      <span class="bar-sep" data-tauri-drag-region></span>
    {/if}
  </div>

  {#if isVertical && progressBar}
    <div class="bar-middle">
      {@render progressBar()}
    </div>
  {/if}

  {#if !isVertical}
    <div class="bar-drag-gap" data-tauri-drag-region></div>
  {/if}

  <div class="bar-end">
    <div class="zoom-wrap">
      <div class="zoom-inline">
        <button class="icon-btn zoom-icon-btn" onclick={() => adjustZoom(-ZOOM_STEP)} title="Zoom out" disabled={zoom <= ZOOM_MIN}>
          <MagnifyingGlassMinus size={13} weight="light" />
        </button>
        <div class="zoom-divider"></div>
        <button class="zoom-pct-btn" onclick={() => readerState.zoomOpen = !readerState.zoomOpen} title="Click to adjust zoom">
          {zoomPct}%
        </button>
        <div class="zoom-divider"></div>
        <button class="icon-btn zoom-icon-btn" onclick={() => adjustZoom(ZOOM_STEP)} title="Zoom in" disabled={zoom >= ZOOM_MAX}>
          <MagnifyingGlassPlus size={13} weight="light" />
        </button>
      </div>

      {#if readerState.zoomOpen}
        <div class="popover zoom-popover popover-{popoverSide}">
          <div class="zoom-slider-row">
            <input type="range" class="zoom-slider" min={10} max={100} step={5} value={zoomPct}
              oninput={(e) => { onCaptureZoomAnchor(); onApplySettings({ readerZoom: onClampZoom(Number(e.currentTarget.value) / 100) }); onRestoreZoomAnchor(); }} />
          </div>
          <button class="zoom-reset" onclick={resetZoom} disabled={zoom === 1.0}>Reset</button>
        </div>
      {/if}
    </div>

    <div class="marker-wrap">
      <button
        class="icon-btn"
        class:active={hasMarkerOnPage}
        class:marker-btn-has={hasMarkerOnPage}
        onclick={openMarkerPopover}
        title={hasMarkerOnPage ? "Edit marker" : "Add marker"}
        style={hasMarkerOnPage ? `--marker-color:${MARKER_COLOR_HEX[currentPageMarkers[0].color]}` : ""}
      >
        <MapPin size={14} weight={hasMarkerOnPage ? "fill" : "regular"} />
      </button>

      {#if readerState.markerOpen}
        <div class="popover marker-popover popover-{popoverSide}" role="presentation"
          onclick={(e) => e.stopPropagation()}
          onmouseenter={keepUiAlive}
        >
          <div class="marker-pop-header">
            <span class="marker-pop-title">
              {readerState.markerEditId ? "Edit marker" : "New marker"} · p.{store.pageNumber}
            </span>
            {#if readerState.markerEditId}
              <button class="marker-delete-btn" onclick={onDeleteMarker} title="Delete marker">
                <X size={12} weight="light" />
              </button>
            {/if}
          </div>
          <div class="marker-color-row">
            {#each MARKER_COLORS as c}
              <button
                class="marker-swatch"
                class:marker-swatch-active={readerState.markerColor === c}
                style="--swatch:{MARKER_COLOR_HEX[c]}"
                onclick={() => readerState.markerColor = c}
                title={c}
              >
                <span class="swatch-dot"></span>
                <span class="swatch-label">{c}</span>
              </button>
            {/each}
          </div>
          <textarea
            class="marker-textarea"
            style="--accent-marker:{MARKER_COLOR_HEX[readerState.markerColor]}"
            rows={3}
            placeholder="Note (optional)…"
            bind:value={readerState.markerNote}
            onmouseenter={keepUiAlive}
            onkeydown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onCommitMarker(); }
              if (e.key === "Escape") readerState.markerOpen = false;
            }}
          ></textarea>
          <div class="marker-pop-actions">
            <button class="marker-save-btn" style="--accent-marker:{MARKER_COLOR_HEX[readerState.markerColor]}" onclick={onCommitMarker}>
              <Check size={12} weight="bold" />
              {readerState.markerEditId ? "Update" : "Save"}
            </button>
            <button class="marker-cancel-btn" onclick={() => readerState.markerOpen = false}>Cancel</button>
          </div>
        </div>
      {/if}
    </div>

    <button class="icon-btn" class:active={isBookmarked} onclick={onToggleBookmark}
      title={isBookmarked ? "Remove bookmark" : "Bookmark this page"}>
      <Bookmark size={15} weight={isBookmarked ? "fill" : "regular"} />
    </button>

    <button class="icon-btn" onclick={onDlOpen}>
      <Download size={14} weight="light" />
    </button>

    <button class="icon-btn" class:active={hasMangaOverride}
      onclick={() => { readerState.presetOpen = true; readerState.markerOpen = false; readerState.zoomOpen = false; readerState.dlOpen = false; }}
      title="Reader settings">
      <Sliders size={13} weight="regular" />
    </button>

    <button class="icon-btn" onclick={onSettingsOpen} title="Settings">
      <GearSix size={13} weight="regular" />
    </button>

    <div class="wc-wrap">
      <button
        class="icon-btn"
        class:active={readerState.winOpen}
        onclick={() => { readerState.winOpen = !readerState.winOpen; readerState.markerOpen = false; readerState.zoomOpen = false; readerState.dlOpen = false; }}
        title="Window controls"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="1.5"  r="1.2" fill="currentColor"/>
          <circle cx="6" cy="6"    r="1.2" fill="currentColor"/>
          <circle cx="6" cy="10.5" r="1.2" fill="currentColor"/>
        </svg>
      </button>
      {#if readerState.winOpen}
        <div
          class="wc-clip wc-clip-{popoverSide}"
          role="presentation"
          onmouseenter={wcResetTimer}
          onmousemove={wcResetTimer}
        >
          <div
            class="wc-bar"
            role="presentation"
            onclick={(e) => e.stopPropagation()}
            in:fly={isVertical
              ? (barPosition === "left" ? { x: '-100%', duration: 200, easing: cubicOut } : { x: '100%', duration: 200, easing: cubicOut })
              : { y: '-100%', duration: 200, easing: cubicOut }}
            out:fly={isVertical
              ? (barPosition === "left" ? { x: '-100%', duration: 150, easing: cubicIn } : { x: '100%', duration: 150, easing: cubicIn })
              : { y: '-100%', duration: 150, easing: cubicIn }}
          >
            <button class="wc-icon-btn" onclick={() => { readerState.winOpen = false; win.minimize(); }} title="Minimize">
              <svg width="10" height="2" viewBox="0 0 10 2"><line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <button class="wc-icon-btn" onclick={() => { readerState.winOpen = false; win.toggleMaximize(); }} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {#if isFullscreen}
                <svg width="11" height="11" viewBox="0 0 11 11">
                  <polyline points="1,4 1,1 4,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <polyline points="7,1 10,1 10,4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <polyline points="10,7 10,10 7,10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  <polyline points="4,10 1,10 1,7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              {:else}
                <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
              {/if}
            </button>
            <button class="wc-icon-btn wc-icon-close" onclick={() => { readerState.winOpen = false; win.close(); }} title="Close">
              <svg width="10" height="10" viewBox="0 0 10 10">
                <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    background: var(--bg-void);
    flex-shrink: 0;
    position: relative;
    z-index: 2;
    transition: opacity 0.25s ease;
    overflow: visible;
    user-select: none;
  }
  .bar.hidden { opacity: 0; pointer-events: none; }

  .bar-top {
    flex-direction: row;
    justify-content: space-between;
    padding: 0 var(--sp-3);
    height: 40px;
    border-bottom: 1px solid var(--border-dim);
  }

  .bar-left, .bar-right {
    flex-direction: column;
    justify-content: space-between;
    padding: var(--sp-3) 0;
    width: 40px;
    position: fixed;
    top: 0;
    bottom: 0;
    z-index: 2;
    border-bottom: none;
  }
  .bar-left  { left: 0;  border-right: 1px solid var(--border-dim); }
  .bar-right { right: 0; border-left:  1px solid var(--border-dim); }

  .bar-drag-gap { flex: 1; height: 100%; cursor: grab; }
  .bar-drag-gap:active { cursor: grabbing; }

  .bar-start, .bar-end {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }
  .bar-top .bar-start { overflow: hidden; }
  .bar-left .bar-start,
  .bar-left .bar-end,
  .bar-right .bar-start,
  .bar-right .bar-end {
    flex-direction: column;
  }

  .icon-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-sm); color: var(--text-muted); flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .icon-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .icon-btn:disabled { opacity: 0.2; cursor: default; }
  .icon-btn.active { color: var(--accent-fg); }
  .marker-btn-has { color: var(--marker-color, var(--accent-fg)) !important; }

  .ch-hover-wrap { position: relative; min-width: 0; display: flex; align-items: center; gap: var(--sp-2); }

  .ch-pill {
    display: flex;
    align-items: center;
    font-size: var(--text-sm);
    color: var(--text-muted);
    overflow: hidden;
    white-space: nowrap;
    min-width: 0;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
    background: none;
    cursor: default;
    transition: background var(--t-fast);
  }
  .bar-left .ch-pill, .bar-right .ch-pill {
    width: 28px;
    height: 28px;
    justify-content: center;
    padding: 0;
  }
  .ch-info { font-size: 15px; line-height: 1; color: var(--text-faint); flex-shrink: 0; }

  .ch-marquee-track {
    overflow-x: auto;
    min-width: 0;
    flex: 1;
    scrollbar-width: none;
  }
  .ch-marquee-track::-webkit-scrollbar { display: none; }
  .ch-marquee-content {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    white-space: nowrap;
  }

  .ch-title { color: var(--text-secondary); font-weight: var(--weight-medium); }
  .ch-sep   { color: var(--text-faint); flex-shrink: 0; }
  .ch-name  { color: var(--text-muted); }
  .ch-page  { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); flex-shrink: 0; }

  .ch-popover {
    position: absolute;
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-lg);
    padding: var(--sp-2) var(--sp-3);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    white-space: nowrap;
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-size: var(--text-sm);
    pointer-events: none;
    animation: scaleIn 0.1s ease both;
  }
  .ch-popover-right { left: calc(100% + 8px); top: 50%; translate: 0 -50%; transform-origin: left center; }
  .ch-popover-left  { right: calc(100% + 8px); top: 50%; translate: 0 -50%; transform-origin: right center; }
  .ch-pop-title { color: var(--text-secondary); font-weight: var(--weight-medium); }
  .ch-pop-sep   { color: var(--text-faint); }
  .ch-pop-name  { color: var(--text-muted); }
  .ch-pop-page  { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .bar-sep { width: 1px; height: 16px; background: var(--border-dim); flex-shrink: 0; margin: 0 var(--sp-1); }

  .zoom-wrap { position: relative; flex-shrink: 0; }
  .zoom-inline { display: flex; align-items: center; }
  .bar-left .zoom-inline, .bar-right .zoom-inline { flex-direction: column; }

  .zoom-icon-btn { width: 28px; height: 28px; }
  .zoom-divider {
    background: var(--border-dim);
    flex-shrink: 0;
  }
  .bar-top .zoom-divider  { width: 1px; height: 16px; }
  .bar-left .zoom-divider,
  .bar-right .zoom-divider { height: 1px; width: 16px; }

  .zoom-pct-btn {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    color: var(--text-secondary);
    height: 28px;
    min-width: 38px;
    text-align: center;
    transition: color var(--t-base), background var(--t-base);
    padding: 0 var(--sp-1);
    border-radius: 0;
  }
  .bar-left .zoom-pct-btn,
  .bar-right .zoom-pct-btn { height: 24px; min-width: unset; width: 28px; writing-mode: vertical-rl; font-size: 9px; padding: var(--sp-1) 0; }
  .zoom-pct-btn:hover { color: var(--text-primary); background: var(--bg-raised); }

  .popover {
    position: absolute;
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 100;
    animation: scaleIn 0.1s ease both;
  }
  .popover-bottom { top: calc(100% + 6px); left: 50%; translate: -50% 0; transform-origin: top center; }
  .popover-right  { left: calc(100% + 8px); top: 50%; translate: 0 -50%; transform-origin: left center; }
  .popover-left   { right: calc(100% + 8px); top: 50%; translate: 0 -50%; transform-origin: right center; }

  .zoom-popover { padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); min-width: 180px; }
  .zoom-slider-row { display: flex; align-items: center; gap: var(--sp-2); }
  .zoom-slider   { flex: 1; height: 3px; appearance: none; -webkit-appearance: none; background: var(--border-strong); border-radius: 2px; outline: none; cursor: pointer; }
  .zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--accent-fg); cursor: pointer; }
  .zoom-reset    { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); padding: 3px var(--sp-2); border-radius: var(--radius-sm); border: 1px solid var(--border-dim); transition: color var(--t-base), background var(--t-base), border-color var(--t-base); }
  .zoom-reset:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-overlay); border-color: var(--border-strong); }
  .zoom-reset:disabled { opacity: 0.3; cursor: default; }

  .marker-wrap     { position: relative; flex-shrink: 0; }
  .marker-popover  { width: 240px; padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-3); }
  .marker-pop-header { display: flex; align-items: center; justify-content: space-between; }
  .marker-pop-title  { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .marker-delete-btn { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-fast), background var(--t-fast); }
  .marker-delete-btn:hover { color: var(--color-error); background: var(--color-error-bg); }
  .marker-color-row  { display: flex; align-items: center; gap: var(--sp-2); }
  .marker-swatch     { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px; border-radius: var(--radius-sm); background: none; border: none; cursor: pointer; flex: 1; transition: background var(--t-fast); }
  .marker-swatch:hover { background: var(--bg-overlay); }
  .swatch-dot        { width: 14px; height: 14px; border-radius: 50%; background: var(--swatch); box-shadow: 0 0 0 0 var(--swatch); transition: box-shadow var(--t-fast), transform var(--t-fast); flex-shrink: 0; }
  .marker-swatch:hover .swatch-dot { transform: scale(1.15); }
  .marker-swatch-active .swatch-dot { box-shadow: 0 0 0 3px color-mix(in srgb, var(--swatch) 30%, transparent); transform: scale(1.1); }
  .swatch-label      { font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide); color: var(--text-faint); text-transform: capitalize; line-height: 1; }
  .marker-swatch-active .swatch-label { color: var(--text-muted); }
  .marker-textarea   { width: 100%; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 7px 9px; font-size: var(--text-xs); color: var(--text-secondary); outline: none; resize: none; font-family: inherit; line-height: var(--leading-snug); transition: border-color var(--t-base), box-shadow var(--t-base); }
  .marker-textarea:focus { border-color: var(--accent-marker, var(--border-focus)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-marker, var(--accent)) 18%, transparent); }
  .marker-pop-actions { display: flex; align-items: center; gap: var(--sp-2); }
  .marker-save-btn   { display: flex; align-items: center; gap: 5px; padding: 6px 14px; border-radius: var(--radius-sm); border: 1px solid color-mix(in srgb, var(--accent-marker, var(--accent)) 50%, transparent); background: color-mix(in srgb, var(--accent-marker, var(--accent)) 15%, transparent); color: var(--accent-marker, var(--accent-fg)); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); cursor: pointer; transition: filter var(--t-fast); }
  .marker-save-btn:hover { filter: brightness(1.2); }
  .marker-cancel-btn { flex: 1; padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); cursor: pointer; transition: color var(--t-base), border-color var(--t-base); text-align: center; }
  .marker-cancel-btn:hover { color: var(--text-muted); border-color: var(--border-strong); }

  .wc-wrap { position: static; flex-shrink: 0; }
  .wc-clip {
    position: absolute;
    z-index: 100;
  }
  .wc-clip-bottom {
    top: 100%;
    right: var(--sp-3);
    clip-path: inset(0 -20px -20px -20px);
  }
  .wc-clip-right {
    left: calc(100% + 1px);
    top: auto;
    bottom: var(--sp-3);
    clip-path: inset(-20px -20px -20px 0);
  }
  .wc-clip-left {
    right: calc(100% + 1px);
    top: auto;
    bottom: var(--sp-3);
    clip-path: inset(-20px 0 -20px -20px);
  }
  .wc-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 3px 10px 4px;
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    box-shadow: 0 6px 16px rgba(0,0,0,0.45);
  }
  .wc-clip-bottom .wc-bar { border-top: none; border-radius: 0 0 8px 8px; flex-direction: row; }
  .wc-clip-right  .wc-bar { border-left: none; border-radius: 0 8px 8px 0; flex-direction: column; padding: 10px 4px; }
  .wc-clip-left   .wc-bar { border-right: none; border-radius: 8px 0 0 8px; flex-direction: column; padding: 10px 4px; }

  .wc-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    border-radius: var(--radius-sm);
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    transition: color var(--t-base), background var(--t-base);
    flex-shrink: 0;
  }
  .wc-icon-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }
  .wc-icon-close:hover { color: #fff; background: #c0392b; }

  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }

  .bar-middle {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    min-height: 0;
    padding: var(--sp-1) 0;
    overflow: hidden;
  }
</style>