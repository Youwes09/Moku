<script lang="ts">
  import { tick }              from "svelte";
  import { readerState }       from "$lib/state/mangaReader.svelte";
  import { settingsState }     from "$lib/state/settings.svelte";
  import { getCachedAspect }   from "$lib/components/media/manga/lib/pageLoader";

  export interface StripPage {
    chapterId:   string;
    chapterName: string;
    localIndex:  number;
    url:         string;
    total:       number;
  }

  interface Props {
    containerEl:    HTMLDivElement | undefined;
    flatPages:      StripPage[];
    imgCls:         string;
    effectiveWidth: number | undefined;
    resolveUrl:     (url: string, priority?: number) => Promise<string>;
    barPosition:    "top" | "left" | "right";
  }

  const { containerEl, flatPages, imgCls, effectiveWidth, resolveUrl, barPosition }: Props = $props();

  const LOAD_RADIUS   = 5;
  const UNLOAD_RADIUS = 10;

  let _loadedSet:   Set<number>            = new Set();
  let _resolvedSrc: Record<number, string> = {};
  let _version      = $state(0);

  const loadedSet   = { has: (i: number) => _loadedSet.has(i) };
  const resolvedSrc = { get: (i: number) => _resolvedSrc[i] as string | undefined };
  let revokeQueue: string[] = [];

  let centerIdx   = $state(0);
  const aspectMap = new Map<number, number>();

  function scheduleRevoke(src: string) {
    if (!src || !src.startsWith("blob:")) return;
    revokeQueue.push(src);
    requestAnimationFrame(() => {
      const url = revokeQueue.shift();
      if (url) { try { URL.revokeObjectURL(url); } catch {} }
    });
  }

  function loadPage(idx: number) {
    if (_loadedSet.has(idx)) return;
    const page = flatPages[idx];
    if (!page) return;
    _loadedSet.add(idx);
    const priority = (page.localIndex < 8 && page.chapterId === flatPages[0]?.chapterId) ? 8 - page.localIndex : 0;
    resolveUrl(page.url, priority).then(src => {
      if (_loadedSet.has(idx)) {
        _resolvedSrc[idx] = src;
        _version++;
      } else {
        scheduleRevoke(src);
      }
    });
  }

  function unloadPage(idx: number) {
    if (!_loadedSet.has(idx)) return;
    _loadedSet.delete(idx);
    const aspect = aspectMap.get(idx);
    if (aspect !== undefined && containerEl) {
      const slot = containerEl.querySelectorAll<HTMLElement>(".strip-slot")[idx];
      slot?.style.setProperty("--aspect", String(aspect));
    }
    const oldSrc = _resolvedSrc[idx];
    if (oldSrc) {
      delete _resolvedSrc[idx];
      scheduleRevoke(oldSrc);
    }
    _version++;
  }

  let recalcTimer: ReturnType<typeof setTimeout> | null = null;

  function recalcWindow(center: number) {
    const lo      = center - LOAD_RADIUS;
    const hi      = center + LOAD_RADIUS;
    const evictLo = center - UNLOAD_RADIUS;
    const evictHi = center + UNLOAD_RADIUS;
    for (let i = 0; i < flatPages.length; i++) {
      if (i >= lo && i <= hi)              loadPage(i);
      else if (i < evictLo || i > evictHi) unloadPage(i);
    }
  }

  function scheduleRecalc(center: number) {
    if (recalcTimer) return;
    recalcTimer = setTimeout(() => { recalcTimer = null; recalcWindow(center); }, 50);
  }

  $effect(() => { void _version; });
  $effect(() => { recalcWindow(centerIdx); });
  $effect(() => { void flatPages.length; tick().then(() => recalcWindow(centerIdx)); });

  let lastChapterId = "";
  $effect(() => {
    let chapterId: string;
    try { chapterId = readerState.activeChapter?.id ?? ""; } catch { return; }
    if (chapterId === lastChapterId) return;
    lastChapterId = chapterId;
    _loadedSet    = new Set<number>();
    _resolvedSrc  = {};
    centerIdx     = 0;
    _version++;
    aspectMap.clear();
  });


  export function notifyScrollCenter(idx: number) {
    centerIdx = idx;
    scheduleRecalc(idx);
  }

  export async function scrollToFlatIndex(idx: number) {
    if (!containerEl || !flatPages.length) return;
    centerIdx = idx;
    recalcWindow(idx);
    await tick();
    if (!containerEl) return;
    const slot = containerEl.querySelectorAll<HTMLElement>(".strip-slot")[idx];
    if (slot) slot.scrollIntoView({ block: "start", behavior: "instant" });
  }

  let anchorEl: HTMLElement | null = null;
  let anchorOffset                 = 0;

  export function captureAnchor() {
    if (!containerEl) return;
    const readY = containerEl.getBoundingClientRect().top + containerEl.clientHeight * 0.5;
    const imgs  = containerEl.querySelectorAll<HTMLElement>("img[data-local-page]");
    let best: HTMLElement | null = null;
    let bestTop = -Infinity;
    for (const img of imgs) {
      const top = img.getBoundingClientRect().top;
      if (top <= readY && top > bestTop) { bestTop = top; best = img; }
    }
    anchorEl     = best;
    anchorOffset = best ? readY - best.getBoundingClientRect().top : 0;
  }

  export function restoreAnchor() {
    if (!containerEl || !anchorEl) return;
    requestAnimationFrame(() => {
      if (!anchorEl || !containerEl) return;
      const readY = containerEl.getBoundingClientRect().top + containerEl.clientHeight * 0.5;
      const delta = (readY - anchorEl.getBoundingClientRect().top) - anchorOffset;
      containerEl.scrollTop -= delta;
      anchorEl = null;
    });
  }


  let autoScrollPaused     = false;
  let autoScrollPauseTimer: ReturnType<typeof setTimeout> | null = null;

  export function pauseAutoScroll() {
    autoScrollPaused = true;
    if (autoScrollPauseTimer) clearTimeout(autoScrollPauseTimer);
    autoScrollPauseTimer = setTimeout(() => { autoScrollPaused = false; }, 2500);
  }

  $effect(() => {
    if (!settingsState.settings.autoScroll || !containerEl) return;
    let rafId: number;
    const tick = () => {
      if (!autoScrollPaused && containerEl) containerEl.scrollTop += (settingsState.settings.autoScrollSpeed ?? 5) * 0.5;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  });


  const HIDE_AFTER_MS = 5_000;

  $effect(() => {
    if (!containerEl) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      containerEl.style.cursor = "";
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (containerEl) containerEl.style.cursor = "none"; }, HIDE_AFTER_MS);
    };
    show();
    window.addEventListener("mousemove", show, { passive: true });
    return () => {
      if (containerEl) containerEl.style.cursor = "";
      window.removeEventListener("mousemove", show);
      if (timer) clearTimeout(timer);
    };
  });

  let midScrollActive       = $state(false);
  let midScrollOriginY      = $state(0);
  let midScrollCurrentY     = 0;
  let midScrollDisplayLevel = $state(0);
  let midScrollRaf: number | null = null;

  function startMidScroll(originY: number) {
    midScrollActive       = true;
    midScrollOriginY      = originY;
    midScrollDisplayLevel = 0;
    if (midScrollRaf) cancelAnimationFrame(midScrollRaf);
    const frame = () => {
      if (!midScrollActive || !containerEl) return;
      const dy     = midScrollCurrentY - midScrollOriginY;
      const excess = Math.max(0, Math.abs(dy) - 24);
      containerEl.scrollTop += Math.sign(dy) * excess * 0.12;
      midScrollDisplayLevel  = Math.sign(dy) * Math.min(5, Math.floor(excess / 30));
      midScrollRaf = requestAnimationFrame(frame);
    };
    midScrollRaf = requestAnimationFrame(frame);
  }

  export function stopMidScroll() {
    midScrollActive       = false;
    midScrollDisplayLevel = 0;
    if (midScrollRaf) { cancelAnimationFrame(midScrollRaf); midScrollRaf = null; }
  }


  let stripDragging    = false;
  let stripDragMoved   = false;
  let stripDragStartY  = 0;
  let stripScrollStart = 0;

  function setDragCursor(dragging: boolean) {
    if (containerEl) containerEl.style.cursor = dragging ? "grabbing" : "";
  }

  export function onMouseDown(e: MouseEvent) {
    if ((e.target as Element).closest(".bar")) return;
    if (e.button === 1) {
      e.preventDefault();
      if (midScrollActive) stopMidScroll();
      else { settingsState.settings.autoScroll = false; startMidScroll(e.clientY); }
      return;
    }
    stripDragging    = true;
    stripDragMoved   = false;
    stripDragStartY  = e.clientY;
    stripScrollStart = containerEl?.scrollTop ?? 0;
    setDragCursor(true);
    pauseAutoScroll();
    e.preventDefault();
  }

  export function onMouseMove(e: MouseEvent) {
    midScrollCurrentY = e.clientY;
    if (!stripDragging) return;
    const dy = e.clientY - stripDragStartY;
    if (!stripDragMoved && Math.abs(dy) > 4) stripDragMoved = true;
    if (containerEl) containerEl.scrollTop = stripScrollStart - dy;
  }

  export function onMouseUp() {
    stripDragging = false;
    setDragCursor(false);
  }

  export function onPointerDown(e: PointerEvent) {
    if ((e.target as Element).closest(".bar")) return;
    stripDragging    = true;
    stripDragMoved   = false;
    stripDragStartY  = e.clientY;
    stripScrollStart = containerEl?.scrollTop ?? 0;
    setDragCursor(true);
    pauseAutoScroll();
  }

  export function onPointerMove(e: PointerEvent) {
    if (!stripDragging) return;
    const dy = e.clientY - stripDragStartY;
    if (!stripDragMoved && Math.abs(dy) > 4) stripDragMoved = true;
    if (containerEl) containerEl.scrollTop = stripScrollStart - dy;
  }

  export function onPointerUp() {
    stripDragging = false;
    setDragCursor(false);
  }

  export function consumeTap(): boolean {
    if (stripDragMoved) { stripDragMoved = false; return true; }
    return false;
  }

  export function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) pauseAutoScroll();
  }
</script>

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

{#each flatPages as page, gi (page.chapterId + ":" + page.localIndex)}
  {@const src      = _version >= 0 ? resolvedSrc.get(gi) : undefined}
  {@const isLoaded = _version >= 0 ? loadedSet.has(gi) : false}
  <div class="strip-slot" data-local-page={page.localIndex + 1} data-chapter={page.chapterId} style={getCachedAspect(page.url) != null ? `--aspect:${getCachedAspect(page.url)}` : undefined}>
    {#if isLoaded && src}
      <img
        {src}
        alt="{page.chapterName} – Page {page.localIndex + 1}"
        data-local-page={page.localIndex + 1}
        data-chapter={page.chapterId}
        data-total={page.total}
        class="{imgCls}{settingsState.settings.pageGap ? ' strip-gap' : ''}"
        loading="lazy"
        decoding="async"
        draggable="false"
        onload={(e) => {
          const img  = e.currentTarget as HTMLImageElement;
          const slot = img.closest<HTMLElement>(".strip-slot");
          if (slot && img.naturalWidth > 0) {
            const aspect = img.naturalWidth / img.naturalHeight;
            slot.style.setProperty("--aspect", String(aspect));
            aspectMap.set(gi, aspect);
          }
        }}
      />
    {:else}
      <div class="strip-placeholder" aria-hidden="true">{@render skeleton()}</div>
    {/if}
  </div>
{/each}
<div style="height:1px;flex-shrink:0"></div>

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
  .strip-slot { width: 100%; display: flex; flex-direction: column; align-items: center; }

  .strip-placeholder {
    width: var(--effective-width, 100%);
    max-width: var(--effective-width, 100%);
    aspect-ratio: var(--aspect, 0.667);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: stretch;
  }

  .panel-skeleton { width: 100%; height: 100%; }
  .panel-skeleton :global(.ps-r) {
    stroke: var(--border-strong); stroke-width: 0.8; fill: none;
    stroke-dasharray: 400; stroke-dashoffset: 400;
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

  .midscroll-bar {
    position: fixed; top: 50%; transform: translateY(-50%);
    z-index: 200; display: flex; flex-direction: column; align-items: center;
    gap: 8px; padding: 10px 6px;
    background: color-mix(in srgb, var(--bg-raised) 92%, transparent);
    border: 1px solid var(--border-base); border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.45);
    pointer-events: auto; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  }
  .midscroll-bar-right { right: 8px; }
  .midscroll-bar-left  { left: 8px; }

  .midscroll-segments   { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .midscroll-origin-dot { width: 6px; height: 6px; border-radius: 50%; border: 1.5px solid var(--accent-fg); opacity: 0.6; flex-shrink: 0; margin: 2px 0; }
  .midscroll-seg        { width: 4px; height: 14px; border-radius: 2px; background: var(--border-strong); transition: background 0.06s ease; flex-shrink: 0; }
  .midscroll-seg-lit    { background: var(--accent-fg); }
  .midscroll-stop       { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast); flex-shrink: 0; }
  .midscroll-stop:hover { color: var(--text-primary); background: var(--bg-overlay); border-color: var(--border-strong); }
</style>