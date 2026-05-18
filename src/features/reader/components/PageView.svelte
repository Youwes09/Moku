<script lang="ts">
  import { store }       from "@store/state.svelte";
  import { readerState } from "../store/readerState.svelte";
  import type { StripChapter } from "../lib/scrollHandler";
  import { createPinchTracker } from "../lib/pinchZoom";
  import type { PinchTracker }  from "../lib/pinchZoom";

  interface Props {
    style:           string;
    imgCls:          string;
    effectiveWidth:  number | undefined;
    loading:         boolean;
    error:           string | null;
    pageReady:       boolean;
    pageGroups:      number[][];
    currentGroup:    number[];
    stripToRender:   StripChapter[];
    fadingOut:       boolean;
    tapToToggleBar:  boolean;
    pinchZoomEnabled: boolean;
    chapterEpoch:    number;
    barPosition:     "top" | "left" | "right";
    onGetZoom:       () => number;
    onSetZoom:       (z: number) => void;
    resolveUrl:      (url: string, priority?: number) => Promise<string>;
    onTap:           (e: MouseEvent) => void;
    onWheel:         (e: WheelEvent) => void;
    onToggleUi:      () => void;
    bindContainer:   (el: HTMLDivElement) => void;
  }

  const {
    style, imgCls, effectiveWidth, loading, error, pageReady,
    pageGroups, currentGroup, stripToRender, fadingOut,
    tapToToggleBar, pinchZoomEnabled, chapterEpoch, barPosition, onGetZoom, onSetZoom,
    resolveUrl, onTap, onWheel, onToggleUi, bindContainer,
  }: Props = $props();

  const LOAD_RADIUS   = 5;
  const UNLOAD_RADIUS = 10;

  type FlatPage = { chapterId: number; chapterName: string; localIndex: number; url: string; total: number };

  const flatPages = $derived.by<FlatPage[]>(() => {
    const out: FlatPage[] = [];
    for (const chunk of stripToRender) {
      for (let i = 0; i < chunk.urls.length; i++) {
        out.push({ chapterId: chunk.chapterId, chapterName: chunk.chapterName, localIndex: i, url: chunk.urls[i], total: chunk.urls.length });
      }
    }
    return out;
  });

  let loadedSet   = $state(new Set<number>());
  let resolvedSrc = $state<Record<number, string>>({});
  let revokeQueue: string[] = [];

  let observer: IntersectionObserver | null = null;
  const elementIndex = new Map<Element, number>();

  let viewportCenter = $state(0);

  function scheduleRevoke(src: string) {
    if (!src || !src.startsWith("blob:")) return;
    revokeQueue.push(src);
    requestAnimationFrame(() => {
      const url = revokeQueue.shift();
      if (url) {
        try { URL.revokeObjectURL(url); } catch { }
      }
    });
  }

  function loadPage(idx: number) {
    if (loadedSet.has(idx)) return;
    const page = flatPages[idx];
    if (!page) return;
    const newSet = new Set(loadedSet);
    newSet.add(idx);
    loadedSet = newSet;
    const priority = (page.localIndex < 8 && page.chapterId === flatPages[0]?.chapterId) ? 8 - page.localIndex : 0;
    resolveUrl(page.url, priority).then(src => {
      if (loadedSet.has(idx)) {
        resolvedSrc = { ...resolvedSrc, [idx]: src };
      } else {
        scheduleRevoke(src);
      }
    });
  }

  function unloadPage(idx: number) {
    if (!loadedSet.has(idx)) return;
    const newSet = new Set(loadedSet);
    newSet.delete(idx);
    loadedSet = newSet;
    const oldSrc = resolvedSrc[idx];
    if (oldSrc) {
      const next = { ...resolvedSrc };
      delete next[idx];
      resolvedSrc = next;
      scheduleRevoke(oldSrc);
    }
  }

  function recalcWindow() {
    const center = viewportCenter;
    const lo = center - LOAD_RADIUS;
    const hi = center + LOAD_RADIUS;
    const evictLo = center - UNLOAD_RADIUS;
    const evictHi = center + UNLOAD_RADIUS;

    for (let i = 0; i < flatPages.length; i++) {
      if (i >= lo && i <= hi) {
        loadPage(i);
      } else if (i < evictLo || i > evictHi) {
        unloadPage(i);
      }
    }
  }

  $effect(() => {
    void viewportCenter;
    recalcWindow();
  });

  $effect(() => {
    void flatPages.length;
    recalcWindow();
  });

  function setupObserver(containerEl: HTMLElement) {
    observer?.disconnect();
    elementIndex.clear();

    observer = new IntersectionObserver(
      (entries) => {
        let best = -1;
        let bestRatio = -1;
        for (const entry of entries) {
          const idx = elementIndex.get(entry.target);
          if (idx === undefined) continue;
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            best = idx;
          }
        }
        if (best >= 0 && best !== viewportCenter) {
          viewportCenter = best;
        }
      },
      {
        root: containerEl,
        rootMargin: "0px",
        threshold: [0, 0.1, 0.5, 1.0],
      }
    );
  }

  function observePage(el: HTMLDivElement, idx: number) {
    elementIndex.set(el, idx);
    observer?.observe(el);
    return {
      update(newIdx: number) {
        elementIndex.set(el, newIdx);
      },
      destroy() {
        observer?.unobserve(el);
        elementIndex.delete(el);
      }
    };
  }

  $effect(() => {
    void chapterEpoch;
    loadedSet   = new Set<number>();
    resolvedSrc = {};
    const resume = readerState.resumePage;
    viewportCenter = resume > 1 ? resume - 1 : 0;
  });

  const INSPECT_ZOOM_STEP = 0.15;
  const INSPECT_ZOOM_MAX  = 8;

  let containerEl: HTMLDivElement;

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

  let stripDragging    = $state(false);
  let stripDragMoved   = false;
  let stripDragStartY  = 0;
  let stripScrollStart = 0;

  let autoScrollPaused      = false;
  let autoScrollPauseTimer: ReturnType<typeof setTimeout> | null = null;

  let midScrollActive  = $state(false);
  let midScrollOriginY = $state(0);
  let midScrollOriginX = $state(0);
  let midScrollCurrentY = 0;
  let midScrollRaf: number | null = null;

  // Speed level 0-5 for the indicator bar
  const midScrollSpeedLevel = $derived.by(() => {
    if (!midScrollActive) return 0;
    // recomputes when midScrollOriginY changes; actual dy read in RAF so this is just for display
    return 0; // will be updated imperatively
  });
  let midScrollDisplayLevel = $state(0);

  function startMidScroll(originY: number, originX: number) {
    midScrollActive  = true;
    midScrollOriginY = originY;
    midScrollOriginX = originX;
    midScrollDisplayLevel = 0;
    if (midScrollRaf) cancelAnimationFrame(midScrollRaf);
    const tick = () => {
      if (!midScrollActive || !containerEl) return;
      const dy       = midScrollCurrentY - midScrollOriginY;
      const deadZone = 24;
      const excess   = Math.max(0, Math.abs(dy) - deadZone);
      const speed    = Math.sign(dy) * excess * 0.12;
      containerEl.scrollTop += speed;
      midScrollDisplayLevel = Math.sign(dy) * Math.min(5, Math.floor(excess / 30));
      midScrollRaf = requestAnimationFrame(tick);
    };
    midScrollRaf = requestAnimationFrame(tick);
  }

  function stopMidScroll() {
    midScrollActive = false;
    midScrollDisplayLevel = 0;
    if (midScrollRaf) { cancelAnimationFrame(midScrollRaf); midScrollRaf = null; }
  }

  function pauseAutoScroll() {
    autoScrollPaused = true;
    if (autoScrollPauseTimer) clearTimeout(autoScrollPauseTimer);
    autoScrollPauseTimer = setTimeout(() => { autoScrollPaused = false; }, 2500);
  }

  $effect(() => {
    if (style !== "longstrip" || !store.settings.autoScroll) return;
    let rafId: number;
    const tick = () => {
      if (!autoScrollPaused && containerEl) containerEl.scrollTop += (store.settings.autoScrollSpeed ?? 5) * 0.5;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  });

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

  export function onInspectMouseDown(e: MouseEvent) {
    if ((e.target as Element).closest(".bar")) return;
    if (e.button === 1 && style === "longstrip") {
      e.preventDefault();
      if (midScrollActive) { stopMidScroll(); } else {
        // pause regular auto-scroll while mid-scroll is active
        store.settings.autoScroll = false;
        startMidScroll(e.clientY, e.clientX);
      }
      return;
    }
    if (style === "longstrip") {
      stripDragging    = true;
      stripDragMoved   = false;
      stripDragStartY  = e.clientY;
      stripScrollStart = containerEl?.scrollTop ?? 0;
      pauseAutoScroll();
      e.preventDefault();
      return;
    }
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
    midScrollCurrentY = e.clientY;
    if (stripDragging) {
      const dy = e.clientY - stripDragStartY;
      if (!stripDragMoved && Math.abs(dy) > 4) stripDragMoved = true;
      if (containerEl) containerEl.scrollTop = stripScrollStart - dy;
      return;
    }
    if (!inspectDragging) return;
    if (!inspectDragMoved && Math.abs(e.clientX - inspectDragStartX) + Math.abs(e.clientY - inspectDragStartY) > 4) inspectDragMoved = true;
    const rawX = inspectPanStartX + (e.clientX - inspectDragStartX);
    const rawY = inspectPanStartY + (e.clientY - inspectDragStartY);
    const [cx, cy] = clampInspectPan(readerState.inspectScale, rawX, rawY);
    readerState.inspectPanX = cx;
    readerState.inspectPanY = cy;
  }

  export function onInspectMouseUp() {
    stripDragging   = false;
    inspectDragging = false;
  }

  export function onPointerDown(e: PointerEvent) {
    if ((e.target as Element).closest(".bar")) return;
    pinch?.onPointerDown(e);
  }

  export function onPointerMove(e: PointerEvent) {
    if (pinch?.isPinching()) {
      pinch.onPointerMove(e);
      return;
    }
    if (stripDragging) {
      const dy = e.clientY - stripDragStartY;
      if (!stripDragMoved && Math.abs(dy) > 4) stripDragMoved = true;
      if (containerEl) containerEl.scrollTop = stripScrollStart - dy;
    }
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
      stripDragging   = false;
      inspectDragging = false;
    }
  }

  export function handleWheel(e: WheelEvent) {
    if (style === "longstrip") {
      if (e.ctrlKey) { onWheel(e); }
      else pauseAutoScroll();
      return;
    }
    if (!e.ctrlKey) { onWheel(e); return; }
    e.preventDefault();
    const delta = e.deltaY < 0 ? INSPECT_ZOOM_STEP : -INSPECT_ZOOM_STEP;
    const next  = Math.max(1, Math.min(INSPECT_ZOOM_MAX, readerState.inspectScale + delta));
    if (next === readerState.inspectScale) return;
    if (next === 1) { readerState.inspectScale = 1; readerState.inspectPanX = 0; readerState.inspectPanY = 0; return; }
    const img    = getInspectImageEl();
    const anchor = img ?? containerEl;
    const rect   = anchor?.getBoundingClientRect();
    const cx     = rect ? e.clientX - rect.left - rect.width  / 2 : 0;
    const cy     = rect ? e.clientY - rect.top  - rect.height / 2 : 0;
    const ratio  = next / readerState.inspectScale;
    const rawPanX = cx + (readerState.inspectPanX - cx) * ratio;
    const rawPanY = cy + (readerState.inspectPanY - cy) * ratio;
    const [clampedX, clampedY] = clampInspectPan(next, rawPanX, rawPanY);
    readerState.inspectScale = next;
    readerState.inspectPanX  = clampedX;
    readerState.inspectPanY  = clampedY;
  }

  function handleTap(e: MouseEvent) {
    if (style === "longstrip") {
      if (stripDragMoved) { stripDragMoved = false; return; }
      return;
    }
    if (inspectDragMoved) { inspectDragMoved = false; return; }
    if (stripDragMoved)   { stripDragMoved   = false; return; }
    onTap(e);
  }

  function setContainer(el: HTMLDivElement) {
    containerEl = el;
    bindContainer(el);
    if (style === "longstrip") setupObserver(el);
  }

  $effect(() => {
    if (style === "longstrip" && containerEl) {
      setupObserver(containerEl);
    } else if (style !== "longstrip") {
      observer?.disconnect();
      observer = null;
      stopMidScroll();
    }
  });
</script>

<div
  use:setContainer
  class="viewer"
  class:strip={style === "longstrip"}
  class:inspect-active={readerState.inspectScale > 1}
  class:midscroll-active={midScrollActive}
  style={effectiveWidth != null ? `--effective-width:${effectiveWidth}px` : ""}
  role="presentation"
  tabindex="-1"
  onclick={handleTap}
  onauxclick={(e) => { if (e.button === 1 && style === "longstrip") e.preventDefault(); }}
  ondblclick={() => { if (tapToToggleBar) onToggleUi(); }}
  onmousedown={onInspectMouseDown}
  onpointerdown={pinchZoomEnabled ? onPointerDown : undefined}
  onwheel={(e) => { if (e.ctrlKey || style !== "longstrip") e.preventDefault(); }}
  style:cursor={style === "longstrip" ? (stripDragging ? "grabbing" : "grab") : undefined}
  onkeydown={(e) => {
    if (e.key === " " && style === "longstrip") { e.preventDefault(); store.settings.autoScroll = !store.settings.autoScroll; return; }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") && style !== "longstrip") e.preventDefault();
  }}
>
  {#if midScrollActive}
    <div class="midscroll-bar" class:midscroll-bar-right={barPosition !== "right"} class:midscroll-bar-left={barPosition === "right"}>
      <div class="midscroll-segments">
        {#each [5,4,3,2,1] as n}
          <div class="midscroll-seg" class:midscroll-seg-lit={midScrollDisplayLevel < 0 && -midScrollDisplayLevel >= n}></div>
        {/each}
        <div class="midscroll-origin-dot"></div>
        {#each [1,2,3,4,5] as n}
          <div class="midscroll-seg" class:midscroll-seg-lit={midScrollDisplayLevel > 0 && midScrollDisplayLevel >= n}></div>
        {/each}
      </div>
      <button class="midscroll-stop" onclick={stopMidScroll} title="Stop (middle click)">
        <svg width="8" height="8" viewBox="0 0 8 8"><rect x="0" y="0" width="8" height="8" rx="1" fill="currentColor"/></svg>
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="center-overlay">
      <div class="page-loader page-loader-single" aria-hidden="true"><svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><rect class="ps-r ps-r1" x="2" y="2" width="62" height="88" rx="1"/><rect class="ps-r ps-r2" x="68" y="2" width="30" height="42" rx="1"/><rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/><rect class="ps-r ps-r4" x="2" y="94" width="44" height="54" rx="1"/><rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/></svg></div>
    </div>
  {/if}
  {#if error}
    <div class="center-overlay"><p class="error-msg">{error}</p></div>
  {/if}

  {#key chapterEpoch}
    {#if style === "longstrip"}
      {#each flatPages as page, gi (page.chapterId + ":" + page.localIndex)}
        {@const src = resolvedSrc[gi]}
        {@const isLoaded = loadedSet.has(gi)}
        <div
          class="strip-slot"
          use:observePage={gi}
          data-gi={gi}
        >
          {#if isLoaded && src}
            <img
              src={src}
              alt="{page.chapterName} – Page {page.localIndex + 1}"
              data-local-page={page.localIndex + 1}
              data-chapter={page.chapterId}
              data-total={page.total}
              class="{imgCls}{store.settings.pageGap ? ' strip-gap' : ''}"
              loading="eager"
              decoding="async"
              draggable="false"
              onload={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                const slot = img.closest<HTMLElement>(".strip-slot");
                if (slot && img.naturalWidth > 0) {
                  slot.style.setProperty("--aspect", String(img.naturalWidth / img.naturalHeight));
                }
              }}
            />
          {:else}
            <div class="strip-placeholder" aria-hidden="true">
              <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><rect class="ps-r ps-r1" x="2" y="2" width="62" height="88" rx="1"/><rect class="ps-r ps-r2" x="68" y="2" width="30" height="42" rx="1"/><rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/><rect class="ps-r ps-r4" x="2" y="94" width="44" height="54" rx="1"/><rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/></svg>
            </div>
          {/if}
        </div>
      {/each}
      <div style="height:1px;flex-shrink:0"></div>

    {:else if style === "fade" && pageReady}
      <div class="inspect-wrap" style="transform:scale({readerState.inspectScale}) translate({readerState.inspectPanX / readerState.inspectScale}px,{readerState.inspectPanY / readerState.inspectScale}px)">
        {#await resolveUrl(store.pageUrls[store.pageNumber - 1], 999)}
          <div class="page-loader page-loader-single" aria-hidden="true">
            <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><rect class="ps-r ps-r1" x="2" y="2" width="62" height="88" rx="1"/><rect class="ps-r ps-r2" x="68" y="2" width="30" height="42" rx="1"/><rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/><rect class="ps-r ps-r4" x="2" y="94" width="44" height="54" rx="1"/><rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/></svg>
          </div>
        {:then src}
          <img {src} alt="Page {store.pageNumber}" class={imgCls} decoding="async" style="opacity: {fadingOut ? 0 : 1}; transition: opacity 0.1s ease;" draggable="false" />
        {/await}
      </div>

    {:else if style === "double" && pageReady}
      <div class="inspect-wrap" style="transform:scale({readerState.inspectScale}) translate({readerState.inspectPanX / readerState.inspectScale}px,{readerState.inspectPanY / readerState.inspectScale}px)">
        {#if pageGroups.length}
          <div class="double-wrap">
            {#each currentGroup as pg, i (pg)}
              {#await resolveUrl(store.pageUrls[pg - 1], 999)}
                <div class="page-loader page-half {i === 0 ? 'gap-left' : 'gap-right'}" aria-hidden="true">
                  <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><rect class="ps-r ps-r1" x="2" y="2" width="62" height="88" rx="1"/><rect class="ps-r ps-r2" x="68" y="2" width="30" height="42" rx="1"/><rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/><rect class="ps-r ps-r4" x="2" y="94" width="44" height="54" rx="1"/><rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/></svg>
                </div>
              {:then src}
                <img {src} alt="Page {pg}" class="{imgCls} page-half {i === 0 ? 'gap-left' : 'gap-right'}" decoding="async" draggable="false" />
              {/await}
            {/each}
          </div>
        {:else}
          <div class="center-overlay">
            <div class="page-loader page-loader-single" aria-hidden="true">
              <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><rect class="ps-r ps-r1" x="2" y="2" width="62" height="88" rx="1"/><rect class="ps-r ps-r2" x="68" y="2" width="30" height="42" rx="1"/><rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/><rect class="ps-r ps-r4" x="2" y="94" width="44" height="54" rx="1"/><rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/></svg>
            </div>
          </div>
        {/if}
      </div>

    {:else if pageReady}
      <div class="inspect-wrap" style="transform:scale({readerState.inspectScale}) translate({readerState.inspectPanX / readerState.inspectScale}px,{readerState.inspectPanY / readerState.inspectScale}px)">
        {#await resolveUrl(store.pageUrls[store.pageNumber - 1], 999)}
          <div class="page-loader page-loader-single" aria-hidden="true">
            <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><rect class="ps-r ps-r1" x="2" y="2" width="62" height="88" rx="1"/><rect class="ps-r ps-r2" x="68" y="2" width="30" height="42" rx="1"/><rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/><rect class="ps-r ps-r4" x="2" y="94" width="44" height="54" rx="1"/><rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/></svg>
          </div>
        {:then src}
          <img {src} alt="Page {store.pageNumber}" class={imgCls} decoding="async" draggable="false" />
        {/await}
      </div>
    {/if}
  {/key}

</div>

<style>
  .viewer { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; -webkit-overflow-scrolling: touch; position: relative; touch-action: pan-x pan-y; zoom: calc(1 / var(--ui-zoom, 1)); }
  .viewer.strip { justify-content: flex-start; padding: var(--sp-4) 0; }
  .viewer:focus { outline: none; }
  .viewer.inspect-active { cursor: grab; overflow: hidden; }
  .viewer.inspect-active:active { cursor: grabbing; }

  :global(.pinch-active) .viewer { touch-action: none; }

  .inspect-wrap { display: flex; align-items: center; justify-content: center; transform-origin: center center; will-change: transform; }

  .strip-slot {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .strip-placeholder {
    width: var(--effective-width, 100%);
    max-width: var(--effective-width, 100%);
    aspect-ratio: var(--aspect, 0.667);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: stretch;
  }

  .page-loader {
    border-radius: var(--radius-sm);
    display: flex;
    align-items: stretch;
  }

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
    0%   { stroke-dashoffset: 400; opacity: 0.25; }
    40%  { stroke-dashoffset: 0;   opacity: 0.55; }
    70%  { stroke-dashoffset: 0;   opacity: 0.55; }
    100% { stroke-dashoffset: -400; opacity: 0.25; }
  }

  .img { display: block; user-select: none; image-rendering: auto; }
  .img:global(.optimize-contrast) { image-rendering: -webkit-optimize-contrast; }
  :global(.fit-width)    { max-width: var(--effective-width, 100%); width: 100%; height: auto; }
  :global(.fit-height)   { max-height: calc(var(--visual-vh, 100vh) - 80px); width: auto; max-width: var(--effective-width, 100%); height: auto; }
  :global(.fit-screen)   { max-width: var(--effective-width, 100%); max-height: calc(var(--visual-vh, 100vh) - 80px); object-fit: contain; height: auto; }
  :global(.fit-original) { max-width: 100%; width: auto; height: auto; }
  :global(.strip-gap)    { margin-bottom: 8px; }

  .double-wrap { display: flex; align-items: flex-start; justify-content: center; max-width: calc(var(--effective-width, 100%) * 2); width: 100%; }
  .page-half   { flex: 1; min-width: 0; object-fit: contain; }
  .gap-left    { margin-right: 2px; }
  .gap-right   { margin-left: 2px; }

  .center-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .error-msg      { color: var(--color-error); font-size: var(--text-base); }

  .midscroll-bar {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 6px;
    background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
    border: 1px solid var(--border-base);
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.45);
    pointer-events: auto;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .midscroll-bar-right { right: 8px; }
  .midscroll-bar-left  { left: 8px; }

  .midscroll-segments {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .midscroll-origin-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1.5px solid var(--accent-fg);
    opacity: 0.6;
    flex-shrink: 0;
    margin: 2px 0;
  }

  .midscroll-seg {
    width: 4px;
    height: 14px;
    border-radius: 2px;
    background: var(--border-strong);
    transition: background 0.06s ease;
    flex-shrink: 0;
  }
  .midscroll-seg-lit {
    background: var(--accent-fg);
  }

  .midscroll-stop {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim);
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast);
    flex-shrink: 0;
  }
  .midscroll-stop:hover {
    color: var(--text-primary);
    background: var(--bg-overlay);
    border-color: var(--border-strong);
  }
</style>