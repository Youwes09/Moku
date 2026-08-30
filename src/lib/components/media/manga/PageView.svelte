<script lang="ts">
  import { readerState }        from "$lib/state/mangaReader.svelte";
  import { createPinchTracker } from "$lib/components/media/manga/lib/pinchZoom";
  import type { PinchTracker }  from "$lib/components/media/manga/lib/pinchZoom";
  import { READ_LINE_PCT }      from "$lib/components/media/manga/lib/scrollHandler";
  import { settingsState }      from "$lib/state/settings.svelte";
  import LongstripViewer        from "$lib/components/media/manga/viewer/LongstripViewer.svelte";
  import SingleViewer           from "$lib/components/media/manga/viewer/SingleViewer.svelte";
  import DoubleViewer           from "$lib/components/media/manga/viewer/DoubleViewer.svelte";

  export interface StripChapter {
    chapterId:   string;
    chapterName: string;
    urls:        string[];
  }

  type FlatPage = {
    chapterId:   string;
    chapterName: string;
    localIndex:  number;
    url:         string;
    total:       number;
  };

  interface Props {
    style:            string;
    imgCls:           string;
    effectiveWidth:   number | undefined;
    loading:          boolean;
    error:            string | null;
    pageReady:        boolean;
    pageGroups:       number[][];
    currentGroup:     number[];
    fadingOut:        boolean;
    tapToToggleBar:   boolean;
    pinchZoomEnabled: boolean;
    useBlob:          boolean;
    barPosition:      "top" | "left" | "right";
    onGetZoom:        () => number;
    onSetZoom:        (z: number) => void;
    resolveUrl:       (url: string, priority?: number) => Promise<string>;
    onTap:            (e: MouseEvent) => void;
    onWheel:          (e: WheelEvent) => void;
    onToggleUi:       () => void;
    bindContainer:    (el: HTMLDivElement) => void;
    onPageChange:     (page: number) => void;
    onChapterChange:  (chapterId: string) => void;
    onCenterIdxChange:(flatIdx: number) => void;
    onMarkRead:       (chapterId: string) => void;
    onAppend:         () => void;
  }

  const {
    style, imgCls, effectiveWidth, loading, error, pageReady,
    pageGroups, currentGroup, fadingOut,
    tapToToggleBar, pinchZoomEnabled, useBlob, barPosition,
    onGetZoom, onSetZoom, resolveUrl, onTap, onWheel, onToggleUi, bindContainer,
    onPageChange, onChapterChange, onCenterIdxChange, onMarkRead, onAppend,
  }: Props = $props();

  let stripChunks = $state<StripChapter[]>([]);

  export function loadStrip(chapterId: string, chapterName: string, urls: string[], resumeTo = 0) {
    stripChunks = [{ chapterId, chapterName, urls }];
    if (resumeTo > 1) {
      setTimeout(() => scrollToFlatIndex(resumeTo - 1), 0);
    }
  }

  export async function appendStripChunk(chapterId: string, chapterName: string, urls: string[]) {
    if (stripChunks.some(c => c.chapterId === chapterId)) return;
    stripChunks = [...stripChunks, { chapterId, chapterName, urls }];
  }

  export function getStripChunks(): StripChapter[] {
    return stripChunks;
  }

  const flatPages = $derived.by<FlatPage[]>(() => {
    const out: FlatPage[] = [];
    for (const chunk of stripChunks) {
      for (let i = 0; i < chunk.urls.length; i++) {
        out.push({
          chapterId:   chunk.chapterId,
          chapterName: chunk.chapterName,
          localIndex:  i,
          url:         chunk.urls[i],
          total:       chunk.urls.length,
        });
      }
    }
    return out;
  });

  let currentSrc       = $state<string | null>(null);
  let currentGroupSrcs = $state<(string | null)[]>([]);

  $effect(() => {
    if (style === "longstrip" || !pageReady) return;
    const pageNum = readerState.pageNumber;
    const urls    = readerState.pageUrls;
    const group   = currentGroup;
    currentSrc       = null;
    currentGroupSrcs = group.map(() => null);
    let cancelled = false;
    if (style === "double") {
      group.forEach((pg, i) => {
        const url = urls[pg - 1];
        if (!url) return;
        resolveUrl(url, 999).then(src => {
          if (cancelled) return;
          currentGroupSrcs = currentGroupSrcs.map((s, j) => j === i ? src : s);
        });
      });
    } else {
      const url = urls[pageNum - 1];
      if (url) resolveUrl(url, 999).then(src => { if (!cancelled) currentSrc = src; });
    }
    return () => { cancelled = true; };
  });

  $effect(() => {
    void readerState.pageNumber;
    if (style !== "longstrip" && containerEl) containerEl.scrollTo(0, 0);
  });

  let lastTrackedPage    = 0;
  let lastTrackedChapter = "";

  function handleScroll() {
    if (style !== "longstrip" || !containerEl || !flatPages.length) return;

    const containerRect = containerEl.getBoundingClientRect();
    const readY         = containerRect.top + containerEl.clientHeight * READ_LINE_PCT;

    const slots = containerEl.querySelectorAll<HTMLElement>(".strip-slot");
    let centerFlatIdx = 0;
    let bestDist      = Infinity;

    slots.forEach((slot, idx) => {
      const rect = slot.getBoundingClientRect();
      const mid  = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(mid - readY);
      if (dist < bestDist) { bestDist = dist; centerFlatIdx = idx; }
    });

    onCenterIdxChange(centerFlatIdx);

    const page = flatPages[centerFlatIdx];
    if (!page) return;

    const localPage = page.localIndex + 1;
    if (localPage !== lastTrackedPage || page.chapterId !== lastTrackedChapter) {
      lastTrackedPage    = localPage;
      lastTrackedChapter = page.chapterId;
      onPageChange(localPage);
      onChapterChange(page.chapterId);
    }

    for (const chunk of stripChunks) {
      const lastLocalIdx = chunk.urls.length - 1;
      let flatLastIdx = -1;
      for (let i = 0; i < flatPages.length; i++) {
        if (flatPages[i].chapterId === chunk.chapterId && flatPages[i].localIndex === lastLocalIdx) {
          flatLastIdx = i;
          break;
        }
      }
      if (flatLastIdx < 0) continue;
      const lastSlot = slots[flatLastIdx];
      if (!lastSlot) continue;
      const lastRect = lastSlot.getBoundingClientRect();
      if (lastRect.bottom < readY) onMarkRead(chunk.chapterId);
    }

    const scrollBottom = containerEl.scrollTop + containerEl.clientHeight;
    const scrollTotal  = containerEl.scrollHeight;
    if (scrollTotal - scrollBottom < containerEl.clientHeight * 1.5) onAppend();
  }

  const INSPECT_ZOOM_STEP = 0.15;
  const INSPECT_ZOOM_MAX  = 8;

  let containerEl = $state<HTMLDivElement | undefined>();
  let stripRef: LongstripViewer | undefined = $state();

  export function captureAnchor()              { stripRef?.captureAnchor(); }
  export function restoreAnchor()              { stripRef?.restoreAnchor(); }
  export function notifyScrollCenter(idx: number)        { stripRef?.notifyScrollCenter(idx); }
  export async function scrollToFlatIndex(idx: number)   { await stripRef?.scrollToFlatIndex(idx); }

  function getInspectImageEl(): HTMLElement | null {
    if (!containerEl) return null;
    return (
      containerEl.querySelector<HTMLElement>(".inspect-wrap .double-wrap") ??
      containerEl.querySelector<HTMLElement>(".inspect-wrap img")
    );
  }

  function clampInspectPan(scale: number, px: number, py: number): [number, number] {
    const img = getInspectImageEl();
    if (!img) return [px, py];
    const maxX = Math.max(0, (img.offsetWidth  * (scale - 1)) / 2);
    const maxY = Math.max(0, (img.offsetHeight * (scale - 1)) / 2);
    return [Math.max(-maxX, Math.min(maxX, px)), Math.max(-maxY, Math.min(maxY, py))];
  }

  let inspectDragging   = false;
  let inspectDragMoved  = false;
  let inspectDragStartX = 0;
  let inspectDragStartY = 0;
  let inspectPanStartX  = 0;
  let inspectPanStartY  = 0;

  let pinch: PinchTracker | null = null;

  $effect(() => {
    if (pinchZoomEnabled) {
      pinch = createPinchTracker({
        getZoom:         onGetZoom,
        setZoom:         onSetZoom,
        getInspectScale: () => readerState.inspectScale,
        setInspectScale: (s) => { readerState.inspectScale = s; },
        resetInspectPan: () => { readerState.inspectPanX = 0; readerState.inspectPanY = 0; },
        isLongstrip:     () => style === "longstrip",
      });
    } else {
      pinch = null;
    }
  });

  $effect(() => { if (style !== "longstrip") readerState.resetInspect(); });

  export function onInspectMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest(".bar")) return;
    if (style === "longstrip") { stripRef?.onMouseDown(e); return; }
    if (readerState.inspectScale <= 1) return;
    inspectDragging   = true;
    inspectDragMoved  = false;
    inspectDragStartX = e.clientX;
    inspectDragStartY = e.clientY;
    inspectPanStartX  = readerState.inspectPanX;
    inspectPanStartY  = readerState.inspectPanY;
    e.preventDefault();
  }

  export function onInspectMouseMove(e: MouseEvent) {
    if (style === "longstrip") { stripRef?.onMouseMove(e); return; }
    if (!inspectDragging) return;
    if (!inspectDragMoved && Math.abs(e.clientX - inspectDragStartX) + Math.abs(e.clientY - inspectDragStartY) > 4) inspectDragMoved = true;
    const rawX = inspectPanStartX + (e.clientX - inspectDragStartX);
    const rawY = inspectPanStartY + (e.clientY - inspectDragStartY);
    const [cx, cy] = clampInspectPan(readerState.inspectScale, rawX, rawY);
    readerState.inspectPanX = cx;
    readerState.inspectPanY = cy;
  }

  export function onInspectMouseUp() {
    if (style === "longstrip") { stripRef?.onMouseUp(); return; }
    inspectDragging = false;
  }

  export function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest(".bar")) return;
    pinch?.onPointerDown(e);
    if (style === "longstrip") stripRef?.onPointerDown(e);
  }

  export function onPointerMove(e: PointerEvent) {
    if (pinch?.isPinching()) { pinch.onPointerMove(e); return; }
    if (style === "longstrip") { stripRef?.onPointerMove(e); return; }
    if (inspectDragging) {
      if (!inspectDragMoved && Math.abs(e.clientX - inspectDragStartX) + Math.abs(e.clientY - inspectDragStartY) > 4) inspectDragMoved = true;
      const rawX = inspectPanStartX + (e.clientX - inspectDragStartX);
      const rawY = inspectPanStartY + (e.clientY - inspectDragStartY);
      const [cx, cy] = clampInspectPan(readerState.inspectScale, rawX, rawY);
      readerState.inspectPanX = cx;
      readerState.inspectPanY = cy;
    }
  }

  export function onPointerUp(e: PointerEvent) {
    pinch?.onPointerUp(e);
    if (!pinch?.isPinching()) {
      if (style === "longstrip") stripRef?.onPointerUp();
      else inspectDragging = false;
    }
  }

  export function handleWheel(e: WheelEvent) {
    if (style === "longstrip") {
      if (e.ctrlKey) onWheel(e);
      else stripRef?.onWheel(e);
      return;
    }
    if (!e.ctrlKey) { onWheel(e); return; }
    e.preventDefault();
    const delta = e.deltaY < 0 ? INSPECT_ZOOM_STEP : -INSPECT_ZOOM_STEP;
    const next  = Math.max(1, Math.min(INSPECT_ZOOM_MAX, readerState.inspectScale + delta));
    if (next === readerState.inspectScale) return;
    if (next === 1) { readerState.inspectScale = 1; readerState.inspectPanX = 0; readerState.inspectPanY = 0; return; }
    const img    = getInspectImageEl();
    const anchor = img ?? containerEl ?? null;
    const rect   = anchor?.getBoundingClientRect();
    const cx     = rect ? e.clientX - rect.left - rect.width  / 2 : 0;
    const cy     = rect ? e.clientY - rect.top  - rect.height / 2 : 0;
    const ratio  = next / readerState.inspectScale;
    const [clampedX, clampedY] = clampInspectPan(next, cx + (readerState.inspectPanX - cx) * ratio, cy + (readerState.inspectPanY - cy) * ratio);
    readerState.inspectScale = next;
    readerState.inspectPanX  = clampedX;
    readerState.inspectPanY  = clampedY;
  }

  let tapTimer: ReturnType<typeof setTimeout> | null = null;

  function handleTap(e: MouseEvent) {
    if (style === "longstrip") {
      if (stripRef?.consumeTap()) return;
      return;
    }
    if (inspectDragMoved) { inspectDragMoved = false; return; }
    if (tapToToggleBar) {
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; return; }
      tapTimer = setTimeout(() => { tapTimer = null; onTap(e); }, 220);
    } else {
      onTap(e);
    }
  }

  function handleDblClick() {
    if (tapToToggleBar) {
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      onToggleUi();
    }
  }

  function setContainer(el: HTMLDivElement) {
    containerEl = el;
    bindContainer(el);
  }
</script>

<div
  use:setContainer
  class="viewer"
  class:strip={style === "longstrip"}
  class:inspect-active={readerState.inspectScale > 1}
  style={effectiveWidth != null ? `--effective-width:${effectiveWidth}px` : ""}
  role="presentation"
  tabindex="-1"
  onclick={handleTap}
  onauxclick={(e) => { if (e.button === 1 && style === "longstrip") e.preventDefault(); }}
  ondblclick={handleDblClick}
  onscroll={style === "longstrip" ? handleScroll : undefined}
  onmousedown={onInspectMouseDown}
  onpointerdown={pinchZoomEnabled ? onPointerDown : undefined}
  onwheel={(e) => { if (e.ctrlKey || style !== "longstrip") e.preventDefault(); }}
  onkeydown={(e) => {
    if (e.key === " " && style === "longstrip") {
      e.preventDefault();
      settingsState.settings.autoScroll = !settingsState.settings.autoScroll;
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") && style !== "longstrip") e.preventDefault();
  }}
>
  {#if loading}
    <div class="center-overlay">
      <div class="page-loader page-loader-single" aria-hidden="true">{@render skeleton()}</div>
    </div>
  {/if}

  {#if error}
    <div class="center-overlay"><p class="error-msg">{error}</p></div>
  {/if}

  {#if style === "longstrip"}
    <LongstripViewer
      bind:this={stripRef}
      {containerEl}
      {flatPages}
      {imgCls}
      {effectiveWidth}
      {resolveUrl}
      {barPosition}
    />

  {:else if style === "double" && pageReady}
    <DoubleViewer {imgCls} {currentGroup} srcs={currentGroupSrcs} {pageGroups} />

  {:else if pageReady}
    <SingleViewer {imgCls} src={currentSrc} {fadingOut} isFade={style === "fade"} />
  {/if}
</div>

{#snippet skeleton()}
  <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect class="ps-r ps-r1" x="2"  y="2"  width="62" height="88" rx="1"/>
    <rect class="ps-r ps-r2" x="68" y="2"  width="30" height="42" rx="1"/>
    <rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/>
    <rect class="ps-r ps-r4" x="2"  y="94" width="44" height="54" rx="1"/>
    <rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/>
  </svg>
{/snippet}

<style>
  .viewer { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; -webkit-overflow-scrolling: touch; position: relative; touch-action: pan-x pan-y; zoom: calc(1 / var(--ui-zoom, 1)); }
  .viewer.strip { justify-content: flex-start; padding: var(--sp-4) 0; }
  .viewer:focus { outline: none; }
  .viewer.inspect-active { cursor: grab; overflow: hidden; }
  .viewer.inspect-active:active { cursor: grabbing; }

  :global(.pinch-active) .viewer { touch-action: none; }

  .page-loader { border-radius: var(--radius-sm); display: flex; align-items: stretch; }
  .page-loader-single {
    width: min(100%, var(--effective-width, 100%));
    max-width: var(--effective-width, 100%);
    max-height: calc(var(--visual-vh, 100vh) - 80px);
    aspect-ratio: 2 / 3;
  }

  .panel-skeleton { width: 100%; height: 100%; }
  .panel-skeleton :global(.ps-r) {
    stroke: var(--border-strong);
    stroke-width: 0.8;
    fill: none;
    stroke-dasharray: 400;
    stroke-dashoffset: 400;
    animation: ps-shimmer 2s ease-in-out infinite;
  }
  .panel-skeleton :global(.ps-r1) { animation-delay: 0s; }
  .panel-skeleton :global(.ps-r2) { animation-delay: 0.15s; }
  .panel-skeleton :global(.ps-r3) { animation-delay: 0.3s; }
  .panel-skeleton :global(.ps-r4) { animation-delay: 0.1s; }
  .panel-skeleton :global(.ps-r5) { animation-delay: 0.25s; }

  @keyframes ps-shimmer {
    0%   { stroke-dashoffset: 400;  opacity: 0.25; }
    40%  { stroke-dashoffset: 0;    opacity: 0.55; }
    70%  { stroke-dashoffset: 0;    opacity: 0.55; }
    100% { stroke-dashoffset: -400; opacity: 0.25; }
  }

  :global(.img) { display: block; user-select: none; image-rendering: auto; }
  :global(.img.optimize-contrast) { image-rendering: -webkit-optimize-contrast; }
  :global(.fit-width)    { max-width: var(--effective-width, 100%); width: 100%; height: auto; }
  :global(.fit-height)   { max-height: calc(var(--visual-vh, 100vh) - 80px); width: auto; max-width: var(--effective-width, 100%); height: auto; }
  :global(.fit-screen)   { max-width: var(--effective-width, 100%); max-height: calc(var(--visual-vh, 100vh) - 80px); object-fit: contain; height: auto; }
  :global(.fit-original) { max-width: 100%; width: auto; height: auto; }
  :global(.strip-gap)    { margin-bottom: 8px; }

  .center-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .error-msg      { color: var(--color-error); font-size: var(--text-base); }
</style>