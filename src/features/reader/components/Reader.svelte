<script lang="ts">
  import { onMount, untrack, tick }  from "svelte";
  import { getCurrentWindow }         from "@tauri-apps/api/window";
  import { gql }                      from "@api/client";
  import { ENQUEUE_CHAPTERS_DOWNLOAD } from "@api/mutations/downloads";
  import { store, updateSettings, openReader, closeReader, addHistory,
           addBookmark, removeBookmark, addMarker, updateMarker, removeMarker,
           setSettingsOpen, setMangaReaderSettings, clearMangaReaderSettings,
           saveReaderPreset, updateReaderPreset, deleteReaderPreset }           from "@store/state.svelte";
  import { setReading }               from "@store/discord";
  import { DEFAULT_KEYBINDS }         from "@core/keybinds/defaultBinds";
  import { readerState, PAGE_STYLES } from "../store/readerState.svelte";
  import { fetchPages, resolveUrl, preloadImage, measureAspect, buildPageGroups } from "../lib/pageLoader";
  import { setupScrollTracking, appendNextChapter } from "../lib/scrollHandler";
  import { createReaderKeyHandler }   from "../lib/readerKeybinds";
  import { markChapterRead, getMangaPrefs, toggleBookmark } from "../lib/chapterActions";
  import { goForward, goBack, jumpToPage }                  from "../lib/navigation";
  import { clampZoom, captureZoomAnchor, restoreZoomAnchor } from "../lib/zoomHelpers";
  import { loadChapter, scheduleResumeDismiss }              from "../lib/chapterLoader";
  import type { FitMode }             from "@store/state.svelte";
  import ReaderControls               from "./ReaderControls.svelte";
  import PageView                     from "./PageView.svelte";
  import ReaderProgressBar            from "./ReaderProgressBar.svelte";
  import ReaderOverlay                from "./ReaderOverlay.svelte";
  import ReaderPresetPanel            from "./ReaderPresetPanel.svelte";

  const win       = getCurrentWindow();
  const useBlob   = $derived((store.settings.serverAuthMode ?? "NONE") !== "NONE");

  const effectiveReaderSettings = $derived.by(() => {
    const mangaId  = store.activeManga?.id;
    const override = mangaId != null ? (store.settings.mangaReaderSettings ?? {})[mangaId] : undefined;
    return override ? { ...store.settings, ...override } : store.settings;
  });

  const rtl       = $derived(effectiveReaderSettings.readingDirection === "rtl");
  const fit       = $derived((effectiveReaderSettings.fitMode ?? "width") as FitMode);
  const style     = $derived((effectiveReaderSettings.pageStyle ?? "single") as typeof PAGE_STYLES[number]);
  const zoom      = $derived(effectiveReaderSettings.readerZoom ?? 1.0);
  const autoNext  = $derived(store.settings.autoNextChapter ?? false);
  const markOnNext = $derived(store.settings.markReadOnNext ?? true);
  const overlayBars    = $derived(store.settings.overlayBars ?? false);
  const tapToToggleBar = $derived(store.settings.tapToToggleBar ?? false);
  const barPosition    = $derived((store.settings.barPosition ?? "top") as "top" | "left" | "right");
  const isVerticalBar  = $derived(barPosition === "left" || barPosition === "right");
  const lastPage       = $derived(store.pageUrls.length);
  const effectiveWidth = $derived(readerState.containerWidth > 0 ? Math.round(readerState.containerWidth * zoom) : undefined);
  const zoomPct        = $derived(Math.round(zoom * 100));
  const pinchZoomEnabled = $derived(store.settings.pinchZoom ?? false);

  const displayChapter = $derived(
    style === "longstrip" && readerState.visibleChapterId
      ? (store.activeChapterList.find(c => c.id === readerState.visibleChapterId) ?? store.activeChapter)
      : store.activeChapter
  );

  const currentBookmark = $derived(
    store.activeManga ? store.bookmarks.find(b => b.mangaId === store.activeManga!.id) : undefined
  );
  const isBookmarked = $derived(
    !!currentBookmark &&
    currentBookmark.chapterId === displayChapter?.id &&
    currentBookmark.pageNumber === store.pageNumber
  );

  const currentPageMarkers   = $derived(displayChapter ? store.getMarkersForPage(displayChapter.id, store.pageNumber) : []);
  const activeChapterMarkers = $derived(displayChapter ? store.getMarkersForChapter(displayChapter.id) : []);
  const hasMarkerOnPage      = $derived(currentPageMarkers.length > 0);

  const showResumeBanner = $derived(
    readerState.resumeVisible && readerState.resumePage > 1 &&
    (style === "longstrip" ? readerState.stripResumeReady : store.pageNumber === readerState.resumePage)
  );

  const adjacent = $derived.by(() => {
    const ref = displayChapter ?? store.activeChapter;
    if (!ref || !store.activeChapterList.length) return { prev: null, next: null, remaining: [] };
    const idx = store.activeChapterList.findIndex(c => c.id === ref.id);
    return {
      prev:      idx > 0                                   ? store.activeChapterList[idx - 1] : null,
      next:      idx < store.activeChapterList.length - 1 ? store.activeChapterList[idx + 1] : null,
      remaining: store.activeChapterList.slice(idx + 1),
    };
  });

  const visibleChunkLastPage = $derived.by(() => {
    if (style !== "longstrip") return lastPage;
    const chId  = readerState.visibleChapterId ?? store.activeChapter?.id;
    const chunk = readerState.stripChapters.find(c => c.chapterId === chId);
    return chunk?.urls.length ?? lastPage;
  });

  const imgCls = $derived([
    "img",
    fit === "width"    && "fit-width",
    fit === "height"   && "fit-height",
    fit === "screen"   && "fit-screen",
    fit === "original" && "fit-original",
    effectiveReaderSettings.optimizeContrast && "optimize-contrast",
  ].filter(Boolean).join(" "));

  const fitLabel = $derived({ width: "Fit W", height: "Fit H", screen: "Fit Screen", original: "1:1" }[fit]);

  const stripToRender = $derived(
    style === "longstrip"
      ? (readerState.stripChapters.length > 0
          ? readerState.stripChapters
          : [{ chapterId: store.activeChapter?.id ?? 0, chapterName: store.activeChapter?.name ?? "", urls: store.pageUrls }])
      : []
  );

  const currentGroup = $derived.by(() => {
    const group = style === "double" && readerState.pageGroups.length
      ? (readerState.pageGroups.find(g => g.includes(store.pageNumber)) ?? [store.pageNumber])
      : [store.pageNumber];
    return rtl ? [...group].reverse() : group;
  });

  const sliderPage = $derived.by(() => {
    if (style === "double" && readerState.pageGroups.length)
      return readerState.pageGroups.findIndex(g => g.includes(store.pageNumber)) + 1;
    return store.pageNumber;
  });

  const sliderMax = $derived.by(() => {
    if (style === "double" && readerState.pageGroups.length) return readerState.pageGroups.length;
    if (style === "longstrip") return visibleChunkLastPage || 1;
    return lastPage || 1;
  });

  const sliderPctRaw = $derived(sliderMax > 1 ? ((sliderPage - 1) / (sliderMax - 1)) * 100 : 0);
  const sliderPct    = $derived(rtl ? 100 - sliderPctRaw : sliderPctRaw);

  const perMangaEnabled = $derived(
    store.activeManga?.id != null &&
    !!(store.settings.mangaReaderSettings ?? {})[store.activeManga.id]
  );

  let containerEl: HTMLDivElement | null = null;
  let pageViewRef: PageView;
  let zoomAnchor = { el: null as HTMLElement | null, offset: 0 };
  let hideTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  let markedRead  = new Set<number>();
  let appending   = false;
  let abortCtrl   = { current: null as AbortController | null };
  let hasNavigated    = false;
  let startAtLastPageRef = { current: false };
  let cleanupScroll: () => void = () => {};
  let stripChaptersRef = readerState.stripChapters;

  $effect(() => { stripChaptersRef = readerState.stripChapters; });

  function maybeMarkCurrentRead() {
    const ch = displayChapter ?? store.activeChapter;
    if (ch && markOnNext) markChapterRead(ch.id, markedRead);
  }

  function commitMarker() {
    const ch    = displayChapter;
    const manga = store.activeManga;
    if (!ch || !manga) return;
    if (readerState.markerEditId) {
      updateMarker(readerState.markerEditId, { note: readerState.markerNote.trim(), color: readerState.markerColor });
    } else {
      addMarker({ mangaId: manga.id, mangaTitle: manga.title, thumbnailUrl: manga.thumbnailUrl, chapterId: ch.id, chapterName: ch.name, pageNumber: store.pageNumber, note: readerState.markerNote.trim(), color: readerState.markerColor });
    }
    readerState.clearMarkerPopover();
  }

  function deleteCurrentMarker() {
    if (readerState.markerEditId) removeMarker(readerState.markerEditId);
    readerState.clearMarkerPopover();
  }

  function showUi() {
    readerState.uiVisible = true;
    if (hideTimer) clearTimeout(hideTimer);
    if (!tapToToggleBar) {
      hideTimer = setTimeout(() => {
        if (!readerState.markerOpen && !readerState.winOpen) readerState.uiVisible = false;
      }, 3000);
    }
  }

  function toggleUiVisibility() {
    if (readerState.uiVisible) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      readerState.uiVisible = false;
    } else {
      readerState.uiVisible = true;
    }
  }

  function handleTap(e: MouseEvent) {
    const x = e.clientX / window.innerWidth;
    if (x > 0.6) goNext(); else if (x < 0.4) goPrev();
  }

  function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    captureZoomAnchor(containerEl, style, zoomAnchor);
    const ZOOM_STEP = 0.05;
    applySettings({ readerZoom: clampZoom(zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)) });
    restoreZoomAnchor(containerEl, zoomAnchor);
  }

  const startAtLast = () => { startAtLastPageRef.current = true; };
  const goNext = $derived(rtl
    ? () => goBack(style, adjacent, startAtLast)
    : () => goForward(style, adjacent, lastPage, maybeMarkCurrentRead, startAtLast));
  const goPrev = $derived(rtl
    ? () => goForward(style, adjacent, lastPage, maybeMarkCurrentRead, startAtLast)
    : () => goBack(style, adjacent, startAtLast));

  const onKey = createReaderKeyHandler({
    goNext:          () => goNext(),
    goPrev:          () => goPrev(),
    closeReader,
    goToPage:        (p) => jumpToPage(p, style, lastPage, containerEl),
    lastPage:        () => lastPage,
    adjustZoom:      (d) => { captureZoomAnchor(containerEl, style, zoomAnchor); applySettings({ readerZoom: clampZoom(zoom + d) }); restoreZoomAnchor(containerEl, zoomAnchor); },
    resetZoom:       () => { captureZoomAnchor(containerEl, style, zoomAnchor); applySettings({ readerZoom: 1.0 }); restoreZoomAnchor(containerEl, zoomAnchor); },
    cycleStyle:      () => { const idx = PAGE_STYLES.indexOf(style); applySettings({ pageStyle: PAGE_STYLES[(idx + 1) % PAGE_STYLES.length] }); },
    toggleDirection: () => applySettings({ readingDirection: rtl ? "ltr" : "rtl" }),
    openSettings:    () => setSettingsOpen(true),
    toggleBookmark:  () => toggleBookmark(displayChapter, store.pageNumber),
    toggleAutoScroll: () => { if (style === "longstrip") updateSettings({ autoScroll: !(store.settings.autoScroll ?? false) }); },
    toggleMarker:    () => {
      if (currentPageMarkers.length > 0) {
        const first = currentPageMarkers[0];
        readerState.openMarker(first.id, first.note, first.color);
      } else {
        readerState.openMarker("", "", "yellow");
      }
    },
    chapterNext: () => {
      const ch = rtl ? adjacent.prev : adjacent.next;
      if (ch) { maybeMarkCurrentRead(); openReader(ch, store.activeChapterList); }
    },
    chapterPrev: () => {
      const ch = rtl ? adjacent.next : adjacent.prev;
      if (ch) openReader(ch, store.activeChapterList);
    },
    closePopovers: () => readerState.closeAllPopovers(),
    getKeybinds:   () => store.settings.keybinds ?? DEFAULT_KEYBINDS,
  });

  function bindContainer(el: HTMLDivElement) { containerEl = el; }

  function captureCurrentReaderSettings() {
    return {
      pageStyle:           style,
      fitMode:             fit,
      readingDirection:    (store.settings.readingDirection ?? "ltr") as import("@store/state.svelte").ReadingDirection,
      readerZoom:          zoom,
      pageGap:             effectiveReaderSettings.pageGap ?? true,
      optimizeContrast:    effectiveReaderSettings.optimizeContrast ?? false,
      offsetDoubleSpreads: effectiveReaderSettings.offsetDoubleSpreads ?? false,
    } satisfies import("@store/state.svelte").ReaderSettings;
  }

  function applySettings(patch: Parameters<typeof updateSettings>[0]) {
    const mangaId = store.activeManga?.id;
    if (mangaId != null && (store.settings.mangaReaderSettings ?? {})[mangaId]) {
      setMangaReaderSettings(mangaId, { ...(store.settings.mangaReaderSettings ?? {})[mangaId]!, ...patch });
    } else {
      updateSettings(patch);
    }
  }

  function handleTogglePerManga() {
    const mangaId = store.activeManga?.id;
    if (mangaId == null) return;
    if ((store.settings.mangaReaderSettings ?? {})[mangaId]) {
      clearMangaReaderSettings(mangaId);
    } else {
      setMangaReaderSettings(mangaId, captureCurrentReaderSettings());
    }
  }

  function handleSavePreset(name: string) {
    saveReaderPreset(name, captureCurrentReaderSettings());
  }

  function handleApplyPreset(settings: import("@store/state.svelte").ReaderSettings) {
    const mangaId = store.activeManga?.id;
    if (mangaId != null && (store.settings.mangaReaderSettings ?? {})[mangaId]) {
      setMangaReaderSettings(mangaId, settings);
    } else {
      updateSettings(settings);
    }
  }

  function handleBarPositionChange(pos: "top" | "left" | "right") {
    updateSettings({ barPosition: pos });
  }

  $effect(() => {
    const chapter = displayChapter;
    const manga   = store.activeManga;
    if (store.settings.discordRpc && chapter && manga) setReading(manga, chapter);
  });

  $effect(() => {
    const ch = store.activeChapter;
    if (ch) untrack(() => loadChapter(ch.id, useBlob, abortCtrl, startAtLastPageRef, markedRead, adjacent));
  });

  $effect(() => {
    if (style === "longstrip" && store.pageUrls.length && store.activeChapter) {
      const ch       = store.activeChapter;
      const urls     = store.pageUrls;
      const targetPg = untrack(() => readerState.resumePage);
      appending                 = false;
      readerState.stripChapters = [{ chapterId: ch.id, chapterName: ch.name, urls }];
      readerState.visibleChapterId = ch.id;
      tick().then(() => {
        if (!containerEl) return;
        if (targetPg > 1) {
          const chId = ch.id;
          const scrollToResumePage = () => {
            const target = containerEl!.querySelector<HTMLImageElement>(`img[data-local-page="${targetPg}"][data-chapter="${chId}"]`);
            if (!target) { requestAnimationFrame(scrollToResumePage); return; }
            containerEl!.querySelectorAll<HTMLImageElement>(`img[data-chapter="${chId}"]`).forEach((img, i) => { if (i < targetPg) img.loading = "eager"; });
            const doScroll = () => { target.scrollIntoView({ block: "start" }); readerState.stripResumeReady = true; };
            if (target.complete && target.naturalHeight > 0) doScroll();
            else { target.loading = "eager"; target.addEventListener("load", doScroll, { once: true }); }
          };
          scrollToResumePage();
          return;
        }
        containerEl!.scrollTop = 0;
      });
    }
  });

  $effect(() => { if (style !== "longstrip") readerState.resetInspect(); });

  $effect(() => {
    const chId = readerState.visibleChapterId;
    if (!chId || style !== "longstrip") return;
    if (chId === store.activeChapter?.id) return;
    const wasAppended = untrack(() => readerState.stripChapters.findIndex(c => c.chapterId === chId)) > 0;
    if (wasAppended) {
      untrack(() => {
        readerState.resumePage = 0; readerState.resumeVisible = false;
        const prefs = getMangaPrefs();
        if (prefs.downloadAhead > 0) {
          const list = store.activeChapterList;
          const idx  = list.findIndex(c => c.id === chId);
          if (idx >= 0) {
            const toQueue = list.slice(idx + 1, idx + 1 + prefs.downloadAhead).filter(c => !c.isDownloaded && !c.isRead).map(c => c.id);
            if (toQueue.length) gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: toQueue }).catch(console.error);
          }
        }
      });
      return;
    }
    const bookmark = store.bookmarks.find(b => b.chapterId === chId);
    if (bookmark && bookmark.pageNumber > 1) {
      untrack(() => {
        readerState.resumePage = bookmark.pageNumber; readerState.resumeDismissed = false;
        readerState.resumeVisible = true; readerState.stripResumeReady = true;
        scheduleResumeDismiss();
      });
    } else {
      untrack(() => readerState.resetResume());
    }
  });

  $effect(() => {
    void style;
    if (!containerEl) return;
    untrack(() => { cleanupScroll(); cleanupScroll = setupScrollTracking(containerEl!, {
      onPageChange:    (p) => { store.pageNumber = p; },
      onChapterChange: (id) => { readerState.visibleChapterId = id; },
      onMarkRead:      (id) => markChapterRead(id, markedRead),
      onAppend:        () => {
        if (appending || !readerState.stripChapters.length) return;
        appending = true;
        appendNextChapter(
          stripChaptersRef,
          store.activeChapterList,
          (id) => fetchPages(id, useBlob),
          (url) => preloadImage(url, useBlob),
          (next) => { readerState.stripChapters = [...readerState.stripChapters, next]; appending = false; },
          () => { appending = false; },
        );
      },
      getStripChapters: () => stripChaptersRef,
      getPageUrls:      () => store.pageUrls,
      shouldAutoMark:   () => store.settings.autoMarkRead ?? true,
    }); });
  });

  $effect(() => {
    if (store.activeChapter && store.activeChapterList.length) {
      const idx = store.activeChapterList.findIndex(c => c.id === store.activeChapter!.id);
      if (idx >= 0) {
        const next = store.activeChapterList[idx + 1];
        const prev = store.activeChapterList[idx - 1];
        if (next) fetchPages(next.id, useBlob).then(urls => urls.slice(0, 8).forEach(u => preloadImage(u, useBlob))).catch(() => {});
        if (prev) fetchPages(prev.id, useBlob).then(urls => urls.slice(0, 2).forEach(u => preloadImage(u, useBlob))).catch(() => {});
      }
    }
  });

  $effect(() => {
    if (style === "double" && store.pageUrls.length) {
      let cancelled = false;
      const snap = store.pageUrls;
      Promise.all(snap.map(url => measureAspect(url, useBlob))).then(aspects => {
        if (cancelled || snap !== store.pageUrls) return;
        readerState.pageGroups = buildPageGroups(snap, aspects, effectiveReaderSettings.offsetDoubleSpreads ?? false);
      });
      return () => { cancelled = true; };
    } else { readerState.pageGroups = []; }
  });

  $effect(() => {
    const ahead   = store.settings.preloadPages ?? 3;
    const current = store.pageUrls[store.pageNumber - 1];
    const pageNum = store.pageNumber;
    const urls    = store.pageUrls;
    if (!current) return;
    const t = setTimeout(() => {
      if (useBlob) {
        import("@core/cache/imageCache").then(({ getBlobUrl, preloadBlobUrls }) => {
          getBlobUrl(current, 999);
          const upcoming = Array.from({ length: ahead }, (_, i) => urls[pageNum + i]).filter(Boolean) as string[];
          const behind   = urls[pageNum - 2];
          preloadBlobUrls(upcoming, ahead);
          if (behind) preloadBlobUrls([behind], 0);
        });
      } else {
        for (let i = 1; i <= ahead; i++) {
          const url = urls[pageNum - 1 + i];
          if (url) preloadImage(url, useBlob);
        }
        const behind = urls[pageNum - 2];
        if (behind) preloadImage(behind, useBlob);
      }
    }, 150);
    return () => clearTimeout(t);
  });

  $effect(() => {
    if (readerState.markerOpen || readerState.winOpen) {
      readerState.uiVisible = true;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    }
  });

  $effect(() => {
    if (tapToToggleBar) {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      readerState.uiVisible = true;
    }
  });

  $effect(() => {
    const ch = displayChapter ?? store.activeChapter;
    if (ch && lastPage && store.activeManga) {
      const { id: chapterId, name: chapterName } = ch;
      const { id: mangaId, title: mangaTitle, thumbnailUrl: thumb } = store.activeManga;
      const pageNum = store.pageNumber;
      const atLast  = pageNum === lastPage;
      if (pageNum > 1) hasNavigated = true;
      untrack(() => {
        if (!hasNavigated) return;
        if (style === "longstrip" && readerState.visibleChapterId && chapterId !== readerState.visibleChapterId) return;
        addHistory({ mangaId, mangaTitle, thumbnailUrl: thumb, chapterId, chapterName, readAt: Date.now() });
        if (store.settings.autoBookmark ?? true) {
          const existing = store.bookmarks.find(b => b.mangaId === mangaId && b.chapterId !== chapterId);
          if (existing) removeBookmark(existing.chapterId);
          addBookmark({ mangaId, mangaTitle, thumbnailUrl: thumb, chapterId, chapterName, pageNumber: pageNum });
        }
        if (style !== "longstrip" && (store.settings.autoMarkRead ?? true) && atLast) markChapterRead(chapterId, markedRead);
      });
    }
  });

  onMount(async () => {
    showUi();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", pageViewRef.onInspectMouseMove);
    window.addEventListener("mouseup",  pageViewRef.onInspectMouseUp);
    window.addEventListener("pointermove", pageViewRef.onPointerMove);
    window.addEventListener("pointerup",   pageViewRef.onPointerUp);

    readerState.isFullscreen = await win.isFullscreen();
    const unlistenFs = await win.onResized(async () => {
      readerState.isFullscreen = await win.isFullscreen();
    });

    let roTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (roTimer) clearTimeout(roTimer);
      roTimer = setTimeout(() => { readerState.containerWidth = w; roTimer = null; }, 50);
    });
    if (containerEl) ro.observe(containerEl);

    return () => {
      abortCtrl.current?.abort();
      if (hideTimer) clearTimeout(hideTimer);
      if (roTimer) clearTimeout(roTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", pageViewRef.onInspectMouseMove);
      window.removeEventListener("mouseup",  pageViewRef.onInspectMouseUp);
      window.removeEventListener("pointermove", pageViewRef.onPointerMove);
      window.removeEventListener("pointerup",   pageViewRef.onPointerUp);
      cleanupScroll();
      unlistenFs();
      ro.disconnect();
    };
  });
</script>

<div
  class="root"
  class:overlay-bars={overlayBars}
  class:bar-left={barPosition === "left"}
  class:bar-right={barPosition === "right"}
  class:pinch-active={pinchZoomEnabled}
  role="presentation"
  onmousemove={(e) => {
    if (!tapToToggleBar) {
      if (barPosition === "top" && (e.clientY < 60 || window.innerHeight - e.clientY < 60)) showUi();
      if (barPosition === "left" && e.clientX < 60) showUi();
      if (barPosition === "right" && window.innerWidth - e.clientX < 60) showUi();
    }
  }}
>
  <ReaderControls
    {displayChapter} {adjacent} {visibleChunkLastPage}
    {zoom} {zoomPct}
    isFullscreen={readerState.isFullscreen}
    {isBookmarked} {hasMarkerOnPage} {currentPageMarkers}
    uiVisible={readerState.uiVisible}
    {hideTimer}
    {barPosition}
    progressBar={isVerticalBar ? progressBarSnippet : undefined}
    onCaptureZoomAnchor={() => captureZoomAnchor(containerEl, style, zoomAnchor)}
    onRestoreZoomAnchor={() => restoreZoomAnchor(containerEl, zoomAnchor)}
    onMaybeMarkRead={maybeMarkCurrentRead}
    onToggleBookmark={() => toggleBookmark(displayChapter, store.pageNumber)}
    onCommitMarker={commitMarker}
    onDeleteMarker={deleteCurrentMarker}
    onClampZoom={clampZoom}
    onApplySettings={applySettings}
    onDlOpen={() => readerState.dlOpen = true}
    onSettingsOpen={() => setSettingsOpen(true)}
    {perMangaEnabled}
    {win}
  />

  {#if readerState.presetOpen}
    <ReaderPresetPanel
      {fit} {style} {rtl} {zoom} {zoomPct}
      {perMangaEnabled}
      {barPosition}
      onBarPositionChange={handleBarPositionChange}
      onTogglePerManga={handleTogglePerManga}
      onApplySettings={applySettings}
      onSavePreset={handleSavePreset}
      onApplyPreset={handleApplyPreset}
      onUpdatePreset={updateReaderPreset}
      onDeletePreset={deleteReaderPreset}
      onCaptureZoomAnchor={() => captureZoomAnchor(containerEl, style, zoomAnchor)}
      onRestoreZoomAnchor={() => restoreZoomAnchor(containerEl, zoomAnchor)}
      onClampZoom={clampZoom}
    />
  {/if}

  <ReaderOverlay
    {showResumeBanner}
    resumePage={readerState.resumePage}
    resumeFading={readerState.resumeFading}
    {adjacent}
    onDismissResume={() => { readerState.resumeVisible = false; readerState.resumeFading = false; }}
  />

  <PageView
    bind:this={pageViewRef}
    {style} {imgCls} {effectiveWidth}
    loading={readerState.loading}
    error={readerState.error}
    pageReady={readerState.pageReady}
    pageGroups={readerState.pageGroups}
    {currentGroup} {stripToRender}
    fadingOut={readerState.fadingOut}
    {tapToToggleBar}
    {pinchZoomEnabled}
    {barPosition}
    onGetZoom={() => zoom}
    onSetZoom={(z) => { captureZoomAnchor(containerEl, style, zoomAnchor); applySettings({ readerZoom: z }); restoreZoomAnchor(containerEl, zoomAnchor); }}
    resolveUrl={(url, priority) => resolveUrl(url, useBlob, priority)}
    onTap={handleTap}
    onWheel={handleWheel}
    onToggleUi={toggleUiVisibility}
    {bindContainer}
  />

  {#snippet progressBarSnippet()}
    <ReaderProgressBar
      {style}
      loading={readerState.loading}
      {rtl} {sliderPage} {sliderMax} {sliderPct} {lastPage}
      {displayChapter} {currentBookmark} {activeChapterMarkers} {adjacent}
      uiVisible={readerState.uiVisible}
      {barPosition}
      onGoPrev={goPrev}
      onGoNext={goNext}
      onJumpToPage={(p) => jumpToPage(p, style, lastPage, containerEl)}
    />
  {/snippet}

  {#if !isVerticalBar}
    <ReaderProgressBar
      {style}
      loading={readerState.loading}
      {rtl} {sliderPage} {sliderMax} {sliderPct} {lastPage}
      {displayChapter} {currentBookmark} {activeChapterMarkers} {adjacent}
      uiVisible={readerState.uiVisible}
      {barPosition}
      onGoPrev={goPrev}
      onGoNext={goNext}
      onJumpToPage={(p) => jumpToPage(p, style, lastPage, containerEl)}
    />
  {/if}
</div>

<style>
  .root { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; z-index: var(--z-reader); transform: translateZ(0); will-change: transform; }

  .root.overlay-bars :global(.topbar)    { position: absolute; top: 0; left: 0; right: 0; z-index: 10; }
  .root.overlay-bars :global(.bottombar) { position: absolute; bottom: 0; left: 0; right: 0; z-index: 10; }
  .root.overlay-bars :global(.viewer)    { height: 100%; }

  .root.bar-left  :global(.viewer) { margin-left: 40px; }
  .root.bar-right :global(.viewer) { margin-right: 40px; }

  .root.pinch-active :global(.viewer) { touch-action: none; }
</style>