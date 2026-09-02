<script lang="ts">
  import { onMount, untrack, tick }        from "svelte";
  import { readerState, PAGE_STYLES }      from "$lib/state/mangaReader.svelte";
  import type { PageStyle }                              from "$lib/state/mangaReader.svelte";
  import { settingsState, updateSettings } from "$lib/state/settings.svelte";
  import { app, appState }                 from "$lib/state/app.svelte";
  import { DEFAULT_KEYBINDS }              from "$lib/core/keybinds/defaultBinds";
  import { fetchPages, resolveUrl, preloadImage, measureAspect, buildPageGroups } from "$lib/components/media/manga/lib/pageLoader";
  import { createReaderKeyHandler }                          from "$lib/components/media/manga/lib/readerKeybinds";
  import { markChapterRead, getMangaPrefs, toggleBookmark }  from "$lib/components/media/manga/lib/chapterActions";
  import { goForward, goBack, jumpToPage }                   from "$lib/components/media/manga/lib/navigation";
  import { clampZoom, captureZoomAnchor, restoreZoomAnchor } from "$lib/components/media/manga/lib/zoomHelpers";
  import { loadChapter, scheduleResumeDismiss }              from "$lib/components/media/manga/lib/chapterLoader";
  import { historyState }                                    from "$lib/state/history.svelte";
  import { setPreviewManga, seriesState }                   from "$lib/state/series.svelte";
  import { tsunagu }                                         from "$lib/server-adapters/tsunagu";
  import { setReading }                                      from "$lib/core/discord";
  import { revokeBlobUrl, cancelQueuedFetches, preloadBlobUrls } from "$lib/core/cache/imageCache";
  import type { ReaderSettings }                             from "$lib/state/mangaReader.svelte";
  import ReaderControls                                      from "$lib/components/media/manga/ReaderControls.svelte";
  import PageView                                            from "$lib/components/media/manga/PageView.svelte";
  import ReaderProgressBar                                   from "$lib/components/media/manga/ReaderProgressBar.svelte";
  import ReaderOverlay                                       from "$lib/components/media/manga/ReaderOverlay.svelte";
  import ReaderPresetPanel                                   from "$lib/components/media/manga/ReaderPresetPanel.svelte";

  const useBlob = false;

  const effectiveReaderSettings = $derived.by(() => {
    const mangaId  = readerState.activeManga?.id;
    const override = mangaId != null ? (settingsState.settings.mangaReaderSettings ?? {})[mangaId] : undefined;
    return override ? { ...settingsState.settings, ...override } : settingsState.settings;
  });

  const rtl            = $derived(effectiveReaderSettings.readingDirection === "rtl");
  const fit            = $derived((effectiveReaderSettings.fitMode ?? "width") as ReaderSettings["fitMode"]);
  const style          = $derived((effectiveReaderSettings.pageStyle ?? "single") as typeof PAGE_STYLES[number]);
  const zoom           = $derived(effectiveReaderSettings.readerZoom ?? 1.0);
  const markOnNext     = $derived(settingsState.settings.markReadOnNext ?? true);
  const tapToToggleBar = $derived(settingsState.settings.tapToToggleBar ?? false);
  const barPosition    = $derived((settingsState.settings.barPosition ?? "top") as "top" | "left" | "right");
  const isVerticalBar  = $derived(barPosition === "left" || barPosition === "right");
  const lastPage       = $derived(readerState.pageUrls.length);
  const effectiveWidth = $derived(readerState.containerWidth > 0 ? Math.round(readerState.containerWidth * zoom) : undefined);
  const zoomPct        = $derived(Math.round(zoom * 100));
  const pinchZoomEnabled = $derived(settingsState.settings.pinchZoom ?? false);
  const containerized  = $derived(settingsState.settings.readerContainerized ?? false);

  let visibleChapterId = $state<string | null>(null);

  const displayChapter = $derived(
    style === "longstrip" && visibleChapterId
      ? (readerState.activeChapterList.find(c => c.id === visibleChapterId) ?? readerState.activeChapter)
      : readerState.activeChapter
  );

  const currentBookmark = $derived(
    readerState.activeManga
      ? seriesState.bookmarks.find(b => b.mangaId === readerState.activeManga!.id)
      : undefined
  );
  const currentGroup = $derived.by(() => {
    const group = style === "double" && readerState.pageGroups.length
      ? (readerState.pageGroups.find(g => g.includes(readerState.pageNumber)) ?? [readerState.pageNumber])
      : [readerState.pageNumber];
    return rtl ? [...group].reverse() : group;
  });

  const isBookmarked = $derived(
    !!currentBookmark &&
    currentBookmark.chapterId === displayChapter?.id &&
    (style === "double"
      ? currentGroup.includes(currentBookmark.pageNumber)
      : currentBookmark.pageNumber === readerState.pageNumber)
  );


  const showResumeBanner = $derived(
    readerState.resumeVisible && readerState.resumePage > 1 &&
    readerState.pageNumber === readerState.resumePage
  );

  const adjacent = $derived.by(() => {
    const ref = displayChapter ?? readerState.activeChapter;
    if (!ref || !readerState.activeChapterList.length) return { prev: null, next: null, remaining: [] };
    const idx = readerState.activeChapterList.findIndex(c => c.id === ref.id);
    if (idx === -1) return { prev: null, next: null, remaining: [] };
    return {
      prev:      idx > 0                                        ? readerState.activeChapterList[idx - 1] : null,
      next:      idx < readerState.activeChapterList.length - 1 ? readerState.activeChapterList[idx + 1] : null,
      remaining: readerState.activeChapterList.slice(idx + 1),
    };
  });

  const visibleChunkLastPage = $derived.by(() => {
    if (style !== "longstrip") return lastPage;
    const chunks = pageViewRef?.getStripChunks() ?? [];
    const chId   = visibleChapterId ?? readerState.activeChapter?.id;
    return chunks.find(c => c.chapterId === chId)?.urls.length ?? lastPage;
  });

  const imgCls = $derived([
    "img",
    fit === "width"    && "fit-width",
    fit === "height"   && "fit-height",
    fit === "screen"   && "fit-screen",
    fit === "original" && "fit-original",
    effectiveReaderSettings.optimizeContrast && "optimize-contrast",
  ].filter(Boolean).join(" "));

  const sliderPage = $derived.by(() => {
    if (style === "double" && readerState.pageGroups.length)
      return readerState.pageGroups.findIndex(g => g.includes(readerState.pageNumber)) + 1;
    return readerState.pageNumber;
  });

  const sliderMax = $derived.by(() => {
    if (style === "double" && readerState.pageGroups.length) return readerState.pageGroups.length;
    if (style === "longstrip") return visibleChunkLastPage || 1;
    return lastPage || 1;
  });

  const sliderPctRaw = $derived(sliderMax > 1 ? ((sliderPage - 1) / (sliderMax - 1)) * 100 : 0);
  const sliderPct    = $derived(rtl ? 100 - sliderPctRaw : sliderPctRaw);

  const perMangaEnabled = $derived(
    readerState.activeManga?.id != null &&
    !!(settingsState.settings.mangaReaderSettings ?? {})[readerState.activeManga.id]
  );

  let containerEl: HTMLDivElement | null = null;
  let pageViewRef: PageView;
  let zoomAnchor         = { el: null as HTMLElement | null, offset: 0 };
  let hideTimer          = $state<ReturnType<typeof setTimeout> | null>(null);
  let markedRead         = new Set<string>();
  let appending          = false;
  let abortCtrl          = { current: null as AbortController | null };
  let hasNavigated       = false;
  let startAtLastPageRef = { current: false };
  let tickTimer:     ReturnType<typeof setTimeout> | null = null;
  let progressTimer: ReturnType<typeof setTimeout> | null = null;

  function maybeMarkCurrentRead() {
    const ch = displayChapter ?? readerState.activeChapter;
    if (ch && markOnNext) markChapterRead(ch.id, markedRead);
  }

  function showUi() {
    readerState.uiVisible = true;
    if (hideTimer) clearTimeout(hideTimer);
    if (!tapToToggleBar) {
      hideTimer = setTimeout(() => {
        if (!readerState.winOpen) readerState.uiVisible = false;
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
    applySettings({ readerZoom: clampZoom(zoom + (e.deltaY < 0 ? 0.05 : -0.05)) });
    restoreZoomAnchor(containerEl, zoomAnchor);
  }

  const startAtLast = () => { startAtLastPageRef.current = true; };

  function primedJump(page: number, commit = true) {
    if (useBlob && commit && style !== "longstrip") {
      cancelQueuedFetches();
      const urls = readerState.pageUrls;
      const lo   = Math.max(0, page - 2);
      const hi   = Math.min(urls.length, page + 4);
      preloadBlobUrls(urls.slice(lo, hi), 999);
    }
    jumpToPage(
      page,
      style,
      lastPage,
      style === "longstrip" ? (idx) => pageViewRef.scrollToFlatIndex(idx) : null,
      visibleChapterId ?? readerState.activeChapter?.id ?? "",
      pageViewRef?.getStripChunks() ?? [],
    );
  }

  const goNext = $derived(rtl
    ? () => goBack(style, adjacent, startAtLast)
    : () => goForward(style, adjacent, lastPage, maybeMarkCurrentRead, startAtLast));
  const goPrev = $derived(rtl
    ? () => goForward(style, adjacent, lastPage, maybeMarkCurrentRead, startAtLast)
    : () => goBack(style, adjacent, startAtLast));

  function handleCloseReader() {
    for (const url of readerState.pageUrls) revokeBlobUrl(url);
    readerState.closeReader();
  }

  const onKey = createReaderKeyHandler({
    goNext:           () => goNext(),
    goPrev:           () => goPrev(),
    closeReader:      () => handleCloseReader(),
    goToPage:         (p) => primedJump(p),
    lastPage:         () => lastPage,
    adjustZoom:       (d) => { captureZoomAnchor(containerEl, style, zoomAnchor); applySettings({ readerZoom: clampZoom(zoom + d) }); restoreZoomAnchor(containerEl, zoomAnchor); },
    resetZoom:        () => { captureZoomAnchor(containerEl, style, zoomAnchor); applySettings({ readerZoom: 1.0 }); restoreZoomAnchor(containerEl, zoomAnchor); },
    cycleStyle:       () => { const idx = PAGE_STYLES.indexOf(style); applySettings({ pageStyle: PAGE_STYLES[(idx + 1) % PAGE_STYLES.length] as PageStyle }); },
    toggleDirection:  () => applySettings({ readingDirection: rtl ? "ltr" : "rtl" }),
    openSettings:     () => { app.setSettingsOpen(true); },
    toggleBookmark:   () => toggleBookmark(displayChapter, readerState.pageNumber),
    toggleAutoScroll: () => { if (style === "longstrip") updateSettings({ autoScroll: !(settingsState.settings.autoScroll ?? false) }); },
    chapterNext: () => {
      const ch = rtl ? adjacent.prev : adjacent.next;
      if (ch) { maybeMarkCurrentRead(); readerState.openReader(ch, readerState.activeManga); }
    },
    chapterPrev: () => {
      const ch = rtl ? adjacent.next : adjacent.prev;
      if (ch) readerState.openReader(ch, readerState.activeManga);
    },
    closePopovers: () => readerState.closeAllPopovers(),
    getKeybinds:   () => settingsState.settings.keybinds ?? DEFAULT_KEYBINDS,
  });

  function bindContainer(el: HTMLDivElement) { containerEl = el; }

  function captureCurrentReaderSettings(): ReaderSettings {
    return {
      pageStyle:           style as PageStyle,
      fitMode:             fit,
      readingDirection:    (settingsState.settings.readingDirection ?? "ltr") as ReaderSettings["readingDirection"],
      readerZoom:          zoom,
      pageGap:             effectiveReaderSettings.pageGap ?? true,
      optimizeContrast:    effectiveReaderSettings.optimizeContrast ?? false,
      offsetDoubleSpreads: effectiveReaderSettings.offsetDoubleSpreads ?? false,
    };
  }

  function applySettings(patch: Partial<ReaderSettings>) {
    const mangaId = readerState.activeManga?.id;
    if (mangaId != null && (settingsState.settings.mangaReaderSettings ?? {})[mangaId]) {
      readerState.setMangaReaderSettings(mangaId, { ...(settingsState.settings.mangaReaderSettings ?? {})[mangaId]!, ...patch });
    } else {
      updateSettings(patch);
    }
  }

  function handleTogglePerManga() {
    const mangaId = readerState.activeManga?.id;
    if (mangaId == null) return;
    if ((settingsState.settings.mangaReaderSettings ?? {})[mangaId]) {
      readerState.clearMangaReaderSettings(mangaId);
    } else {
      readerState.setMangaReaderSettings(mangaId, captureCurrentReaderSettings());
    }
  }

  function handleSavePreset(name: string) {
    readerState.saveReaderPreset(name, captureCurrentReaderSettings());
  }

  function handleApplyPreset(settings: ReaderSettings) {
    const mangaId = readerState.activeManga?.id;
    if (mangaId != null && (settingsState.settings.mangaReaderSettings ?? {})[mangaId]) {
      readerState.setMangaReaderSettings(mangaId, settings);
    } else {
      updateSettings(settings);
    }
  }


  $effect(() => {
    const ch = readerState.activeChapter;
    if (ch) {
      untrack(() => {
        const manga = readerState.activeManga;
        if (!manga) return;
        historyState.openSession(
          manga.id, manga.title, manga.thumbnailUrl,
          ch.id, ch.name, readerState.pageNumber,
        );
        loadChapter(manga.id, ch.id, useBlob, abortCtrl, startAtLastPageRef, markedRead, adjacent);
      });
    }
  });

  $effect(() => {
    const ch    = displayChapter;
    const manga = readerState.activeManga;
    const idle  = appState.idleSplash;
    if (ch && manga && !idle) {
      untrack(() => setReading(manga, ch).catch(() => {}));
    }
  });

  $effect(() => {
    const page   = readerState.pageNumber;
    const chId   = style === "longstrip"
      ? (visibleChapterId ?? readerState.activeChapter?.id)
      : readerState.activeChapter?.id;
    const chName = style === "longstrip"
      ? (readerState.activeChapterList.find(c => c.id === chId)?.name ?? readerState.activeChapter?.name ?? "")
      : (readerState.activeChapter?.name ?? "");

    if (!chId || !readerState.activeManga) return;

    if (tickTimer) clearTimeout(tickTimer);
    tickTimer = setTimeout(() => {
      historyState.tickSession(chId, chName, page);
      tickTimer = null;
    }, 2_000);

    return () => {
      if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
    };
  });

  $effect(() => {
    if (style === "longstrip" && readerState.pageUrls.length && readerState.activeChapter) {
      const ch       = readerState.activeChapter;
      const urls     = readerState.pageUrls;
      const resumeTo = untrack(() => readerState.resumePage);
      visibleChapterId = ch.id;
      appending        = false;
      pageViewRef.loadStrip(ch.id, ch.name, urls, resumeTo);
    }
  });

  $effect(() => { if (style !== "longstrip") readerState.resetInspect(); });

  $effect(() => {
    const chId = visibleChapterId;
    if (!chId || style !== "longstrip") return;
    if (chId === readerState.activeChapter?.id) return;
    untrack(() => {
      readerState.resumePage    = 0;
      readerState.resumeVisible = false;
      const prefs = getMangaPrefs(readerState.activeManga?.id);
      if (prefs.downloadAhead > 0) {
        const list = readerState.activeChapterList;
        const idx  = list.findIndex(c => c.id === chId);
        if (idx >= 0) {
          const toQueue = list.slice(idx + 1, idx + 1 + prefs.downloadAhead)
            .filter(c => !c.downloaded && !c.read)
            .map(c => c.id);
          const realMediaId = readerState.activeManga?.mediaId ?? readerState.activeManga?.libraryEntryId ?? '';
          if (toQueue.length && realMediaId) tsunagu.enqueueDownloads(realMediaId, toQueue).catch(console.error);
        }
      }
    });
  });

  $effect(() => {
    if (style === "double" && readerState.pageUrls.length) {
      let cancelled = false;
      const snap = readerState.pageUrls;
      Promise.all(snap.map(url => measureAspect(url, useBlob))).then(aspects => {
        if (cancelled || snap !== readerState.pageUrls) return;
        readerState.pageGroups = buildPageGroups(snap, aspects, effectiveReaderSettings.offsetDoubleSpreads ?? false);
      });
      return () => { cancelled = true; };
    } else {
      readerState.pageGroups = [];
    }
  });

  $effect(() => {
    const ahead   = settingsState.settings.preloadPages ?? 3;
    const current = readerState.pageUrls[readerState.pageNumber - 1];
    const pageNum = readerState.pageNumber;
    const urls    = readerState.pageUrls;
    if (!current) return;
    const t = setTimeout(() => {
      if (useBlob) {
        import("$lib/core/cache/imageCache").then(({ getBlobUrl, preloadBlobUrls }) => {
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
    if (readerState.winOpen) {
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
    const ch    = displayChapter ?? readerState.activeChapter;
    const manga = readerState.activeManga;
    if (ch && lastPage && manga) {
      const { id: chapterId, name: chapterName } = ch;
      const { id: mangaId, title: mangaTitle, thumbnailUrl: thumb } = manga;
      const pageNum = readerState.pageNumber;
      const atLast  = pageNum === lastPage;
      if (pageNum > 1) hasNavigated = true;
      untrack(() => {
        if (!hasNavigated) return;
        if (style === "longstrip" && visibleChapterId && chapterId !== visibleChapterId) return;
        if (settingsState.settings.autoBookmark ?? true) {
          seriesState.setBookmark({ mangaId, mangaTitle, thumbnailUrl: thumb, chapterId, chapterName, pageNumber: pageNum });
        }
        if (style !== "longstrip" && (settingsState.settings.autoMarkRead ?? true) && atLast) markChapterRead(chapterId, markedRead);

        if (pageNum > 1 && !markedRead.has(chapterId)) {
          if (progressTimer) clearTimeout(progressTimer);
          progressTimer = setTimeout(() => {
            tsunagu.updateReadingProgress({
              libraryEntryId: mangaId,
              chapterId,
              progress: lastPage > 0 ? pageNum / lastPage : 0,
              completed: atLast,
            }).catch(console.error);
            progressTimer = null;
          }, 2_000);
        }
      });
    }
  });

  $effect(() => {
    function onFsChange() { readerState.isFullscreen = !!document.fullscreenElement; }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  });

  onMount(() => {
    showUi();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", pageViewRef.onInspectMouseMove);
    window.addEventListener("mouseup",  pageViewRef.onInspectMouseUp);
    window.addEventListener("pointermove", pageViewRef.onPointerMove);
    window.addEventListener("pointerup",   pageViewRef.onPointerUp);

    readerState.isFullscreen = !!document.fullscreenElement;

    let roTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (roTimer) clearTimeout(roTimer);
      roTimer = setTimeout(() => { readerState.containerWidth = w; roTimer = null; }, 50);
    });
    if (containerEl) ro.observe(containerEl);

    return () => {
      historyState.closeSession();
      abortCtrl.current?.abort();
      if (hideTimer) clearTimeout(hideTimer);
      if (roTimer) clearTimeout(roTimer);
      if (progressTimer) clearTimeout(progressTimer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", pageViewRef.onInspectMouseMove);
      window.removeEventListener("mouseup",  pageViewRef.onInspectMouseUp);
      window.removeEventListener("pointermove", pageViewRef.onPointerMove);
      window.removeEventListener("pointerup",   pageViewRef.onPointerUp);
      ro.disconnect();
    };
  });
</script>

<div
  class="root"
  class:containerized
  class:ui-unzoom={!containerized}
  class:bar-left={barPosition === "left"}
  class:bar-right={barPosition === "right"}
  class:pinch-active={pinchZoomEnabled}
  role="presentation"
  onmousemove={(e) => {
    if (!tapToToggleBar) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      if (barPosition === "top" && (y < 60 || h - y < 60)) showUi();
      if (barPosition === "left" && x < 60) showUi();
      if (barPosition === "right" && w - x < 60) showUi();
    }
  }}
>
  <ReaderControls
    {displayChapter} {adjacent} {visibleChunkLastPage}
    {zoom} {zoomPct}
    isFullscreen={readerState.isFullscreen}
    {isBookmarked}
    uiVisible={readerState.uiVisible}
    {barPosition}
    progressBar={isVerticalBar ? progressBarSnippet : undefined}
    onCaptureZoomAnchor={() => captureZoomAnchor(containerEl, style, zoomAnchor)}
    onRestoreZoomAnchor={() => restoreZoomAnchor(containerEl, zoomAnchor)}
    onMaybeMarkRead={maybeMarkCurrentRead}
    onToggleBookmark={() => toggleBookmark(displayChapter, readerState.pageNumber)}
    onClampZoom={clampZoom}
    onApplySettings={applySettings}
    onSettingsOpen={() => { app.setSettingsOpen(true); }}
    onOpenPreview={() => { if (readerState.activeManga) setPreviewManga(readerState.activeManga); }}
    {perMangaEnabled}
  />

  {#if readerState.presetOpen}
    <ReaderPresetPanel
      {fit} {style} {rtl} {zoom} {zoomPct}
      {perMangaEnabled}
      {barPosition}
      onTogglePerManga={handleTogglePerManga}
      onApplySettings={applySettings}
      onSavePreset={handleSavePreset}
      onApplyPreset={handleApplyPreset}
      onUpdatePreset={(id, patch) => readerState.updateReaderPreset(id, patch)}
      onDeletePreset={(id) => readerState.deleteReaderPreset(id)}
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
    {barPosition}
    onDismissResume={() => { readerState.resumeVisible = false; readerState.resumeFading = false; }}
  />

  <PageView
    bind:this={pageViewRef}
    {style} {imgCls} {effectiveWidth}
    loading={readerState.loading}
    error={readerState.error}
    pageReady={readerState.pageReady}
    pageGroups={readerState.pageGroups}
    {currentGroup}
    fadingOut={readerState.fadingOut}
    {tapToToggleBar}
    {pinchZoomEnabled}
    {useBlob}
    {barPosition}
    onGetZoom={() => zoom}
    onSetZoom={(z) => { captureZoomAnchor(containerEl, style, zoomAnchor); applySettings({ readerZoom: z }); restoreZoomAnchor(containerEl, zoomAnchor); }}
    resolveUrl={(url, priority) => resolveUrl(url, useBlob, priority)}
    onTap={handleTap}
    onWheel={handleWheel}
    onToggleUi={toggleUiVisibility}
    {bindContainer}
    onPageChange={(p) => { readerState.pageNumber = p; }}
    onChapterChange={(id) => { visibleChapterId = id; }}
    onCenterIdxChange={(idx) => { pageViewRef?.notifyScrollCenter(idx); }}
    onMarkRead={(id) => { if (settingsState.settings.autoMarkRead ?? true) markChapterRead(id, markedRead) }}
    onAppend={() => {
      if (appending) return;
      const chunks    = pageViewRef?.getStripChunks() ?? [];
      if (!chunks.length) return;
      const lastChunk = chunks[chunks.length - 1];
      const list      = readerState.activeChapterList;
      const lastIdx   = list.findIndex(c => c.id === lastChunk.chapterId);
      if (lastIdx < 0 || lastIdx >= list.length - 1) return;
      const next = list[lastIdx + 1];
      if (!next || chunks.some(c => c.chapterId === next.id)) return;
      appending = true;
      const nextMediaId = readerState.activeManga?.mediaId ?? readerState.activeManga?.libraryEntryId ?? next.mangaId;
      const nextContentUrls = (count: number) =>
        Array.from({ length: count }, (_, i) =>
          `${settingsState.settings.serverUrl ?? ''}/content/${nextMediaId}/${next.id}/pages/${i + 1}`);
      const nextUrls =
        next.downloaded && next.pageCount && next.pageCount > 0
          ? Promise.resolve(nextContentUrls(next.pageCount))
          : next.pages && next.pages.length > 0
            ? Promise.resolve(next.pages)
            : next.pageCount && next.pageCount > 0
              ? Promise.resolve(nextContentUrls(next.pageCount))
              : fetchPages(nextMediaId, next.id, useBlob);
      nextUrls
        .then(urls => {
          urls.slice(0, 6).forEach(url => preloadImage(url, useBlob));
          return pageViewRef.appendStripChunk(next.id, next.name, urls);
        })
        .finally(() => { appending = false; });
    }}
  />

  {#snippet progressBarSnippet()}
    <ReaderProgressBar
      {style}
      loading={readerState.loading}
      {rtl} {sliderPage} {sliderMax} {sliderPct} {lastPage}
      {displayChapter} {adjacent}
      uiVisible={readerState.uiVisible}
      {barPosition}
      onGoPrev={goPrev}
      onGoNext={goNext}
      onJumpToPage={(p, commit) => primedJump(p, commit)}
    />
  {/snippet}

  {#if !isVerticalBar}
    <ReaderProgressBar
      {style}
      loading={readerState.loading}
      {rtl} {sliderPage} {sliderMax} {sliderPct} {lastPage}
      {displayChapter} {adjacent}
      uiVisible={readerState.uiVisible}
      {barPosition}
      onGoPrev={goPrev}
      onGoNext={goNext}
      onJumpToPage={(p, commit) => primedJump(p, commit)}
    />
  {/if}
</div>

<style>
  .root { position: fixed; inset: 0; background: var(--bg-void); display: flex; flex-direction: column; z-index: var(--z-reader); transform: translateZ(0); will-change: transform; }
  .root.containerized { position: relative; inset: auto; flex: 1; height: 100%; z-index: 0; transform: none; will-change: auto; }

  .root :global(.viewer) { height: 100%; }

  .root.bar-left  :global(.viewer) { margin-left: 64px; }
  .root.bar-right :global(.viewer) { margin-right: 64px; }

  .root.pinch-active :global(.viewer) { touch-action: none; }
</style>
