import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  X, CaretLeft, CaretRight, ArrowLeft, ArrowRight,
  Square, Rows, Download, ArrowsLeftRight,
  ArrowsIn, ArrowsOut, ArrowsVertical, CircleNotch,
} from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import {
  FETCH_CHAPTER_PAGES, MARK_CHAPTER_READ,
  ENQUEUE_DOWNLOAD, ENQUEUE_CHAPTERS_DOWNLOAD,
} from "../../lib/queries";
import { useStore, type FitMode } from "../../store";
import { matchesKeybind } from "../../lib/keybinds";
import s from "./Reader.module.css";

function preloadImage(url: string) {
  const img = new Image(); img.src = url;
}

function measureAspect(url: string): Promise<number> {
  return new Promise((res) => {
    const img = new Image();
    img.onload  = () => res(img.naturalWidth / img.naturalHeight);
    img.onerror = () => res(0.67);
    img.src = url;
  });
}

// ── Download modal ────────────────────────────────────────────────────────────
function DownloadModal({
  chapter,
  remaining,
  onClose,
}: {
  chapter: { id: number; name: string };
  remaining: { id: number }[];
  onClose: () => void;
}) {
  const [nextN, setNextN] = useState(5);
  const [busy, setBusy]   = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn().catch(console.error);
    setBusy(false);
    onClose();
  };

  return (
    <div className={s.dlBackdrop} onClick={onClose}>
      <div className={s.dlModal} onClick={(e) => e.stopPropagation()}>
        <p className={s.dlTitle}>Download</p>
        <button className={s.dlOption} disabled={busy}
          onClick={() => run(() => gql(ENQUEUE_DOWNLOAD, { chapterId: chapter.id }))}>
          This chapter
          <span className={s.dlSub}>{chapter.name}</span>
        </button>
        <div className={s.dlRow}>
          <button className={s.dlOption} disabled={busy || !remaining.length}
            onClick={() => run(() => gql(ENQUEUE_CHAPTERS_DOWNLOAD, {
              chapterIds: remaining.slice(0, nextN).map((c) => c.id),
            }))}>
            Next chapters
            <span className={s.dlSub}>{Math.min(nextN, remaining.length)} queued</span>
          </button>
          <div className={s.dlStepper} onClick={(e) => e.stopPropagation()}>
            <button className={s.dlStepBtn}
              onClick={() => setNextN((n) => Math.max(1, n - 1))}
              disabled={nextN <= 1}>−</button>
            <span className={s.dlStepVal}>{nextN}</span>
            <button className={s.dlStepBtn}
              onClick={() => setNextN((n) => Math.min(remaining.length || 1, n + 1))}
              disabled={nextN >= remaining.length}>+</button>
          </div>
        </div>
        <button className={s.dlOption} disabled={busy || !remaining.length}
          onClick={() => run(() => gql(ENQUEUE_CHAPTERS_DOWNLOAD, {
            chapterIds: remaining.map((c) => c.id),
          }))}>
          All remaining
          <span className={s.dlSub}>{remaining.length} chapters</span>
        </button>
      </div>
    </div>
  );
}

// ── Zoom slider popover ───────────────────────────────────────────────────────
function ZoomPopover({
  value,
  onChange,
  onReset,
  onClose,
}: {
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className={s.zoomPopover} ref={ref}>
      <input
        type="range"
        className={s.zoomSlider}
        min={200}
        max={2400}
        step={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button className={s.zoomResetBtn} onClick={onReset}>
        {Math.round((value / 900) * 100)}%
      </button>
    </div>
  );
}

// ── Reader ────────────────────────────────────────────────────────────────────
export default function Reader() {
  const containerRef    = useRef<HTMLDivElement>(null);
  const rafRef          = useRef(0);
  const pageNumRef      = useRef(1);
  const pageCache       = useRef<Map<number, string[]>>(new Map());
  const aspectCache     = useRef<Map<string, number>>(new Map());
  const hideTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiRef           = useRef<HTMLDivElement>(null);

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [dlOpen, setDlOpen]         = useState(false);
  const [zoomOpen, setZoomOpen]     = useState(false);
  const [uiVisible, setUiVisible]   = useState(true);
  const [markedRead, setMarkedRead] = useState<Set<number>>(new Set());
  const [pageGroups, setPageGroups] = useState<number[][]>([]);

  const {
    activeManga, activeChapter, activeChapterList,
    pageUrls, pageNumber, settings,
    setPageUrls, setPageNumber, closeReader, openReader, openSettings,
    updateSettings, addHistory,
  } = useStore();

  const kb         = settings.keybinds;
  const rtl        = settings.readingDirection === "rtl";
  const fit        = settings.fitMode ?? "width";
  const style      = settings.pageStyle ?? "single";
  const maxW       = settings.maxPageWidth ?? 900;
  const autoNext   = settings.autoNextChapter ?? false;

  useEffect(() => { pageNumRef.current = pageNumber; }, [pageNumber]);

  // ── UI autohide ──────────────────────────────────────────────────────────────
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 3000);
  }, []);

  const showUi = useCallback(() => {
    setUiVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);



  // ── Auto-focus viewer so spacebar/arrows work ───────────────────────────────
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true });
  }, [activeChapter?.id]);

  // ── Load pages ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChapter) return;
    setLoading(true); setError(null); setPageGroups([]);
    const cached = pageCache.current.get(activeChapter.id);
    if (cached) { setPageUrls(cached); setLoading(false); return; }
    gql<{ fetchChapterPages: { pages: string[] } }>(FETCH_CHAPTER_PAGES, { chapterId: activeChapter.id })
      .then((d) => {
        const urls = d.fetchChapterPages.pages.map(thumbUrl);
        pageCache.current.set(activeChapter.id, urls);
        setPageUrls(urls);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeChapter?.id]);

  // ── Double-page grouping ─────────────────────────────────────────────────────
  // Page 1 (cover) always solo. Wide pages (aspect > 1.2) always solo.
  // Remaining portrait pages pair left-to-right: [2,3], [4,5], ...
  useEffect(() => {
    if (style !== "double" || !pageUrls.length) { setPageGroups([]); return; }
    let cancelled = false;
    (async () => {
      const aspects: number[] = [];
      for (const url of pageUrls) {
        if (aspectCache.current.has(url)) {
          aspects.push(aspectCache.current.get(url)!);
        } else {
          const a = await measureAspect(url);
          aspectCache.current.set(url, a);
          aspects.push(a);
        }
      }
      if (cancelled) return;
      const groups: number[][] = [];
      groups.push([1]);
      let i = 2;
      while (i <= pageUrls.length) {
        const a = aspects[i - 1];
        if (a > 1.2) {
          groups.push([i]); i++;
        } else if (i === pageUrls.length) {
          groups.push([i]); i++;
        } else {
          const nextA = aspects[i];
          if (nextA !== undefined && nextA <= 1.2) {
            // Book order: left page is i, right page is i+1
            groups.push(rtl ? [i + 1, i] : [i, i + 1]);
            i += 2;
          } else {
            groups.push([i]); i++;
          }
        }
      }
      setPageGroups(groups);
    })();
    return () => { cancelled = true; };
  }, [pageUrls, style, settings.offsetDoubleSpreads, rtl]);

  // ── Preload ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    for (let i = 1; i <= (settings.preloadPages ?? 3); i++) {
      const url = pageUrls[pageNumber - 1 + i];
      if (url) preloadImage(url);
    }
  }, [pageNumber, pageUrls, settings.preloadPages]);

  // ── Adjacent chapters ────────────────────────────────────────────────────────
  const adjacent = useMemo(() => {
    if (!activeChapter || !activeChapterList.length)
      return { prev: null, next: null, remaining: [] };
    const idx = activeChapterList.findIndex((c) => c.id === activeChapter.id);
    return {
      prev: idx > 0 ? activeChapterList[idx - 1] : null,
      next: idx < activeChapterList.length - 1 ? activeChapterList[idx + 1] : null,
      remaining: activeChapterList.slice(idx + 1),
    };
  }, [activeChapter, activeChapterList]);

  useEffect(() => {
    const preload = (id: number) => {
      if (pageCache.current.has(id)) return;
      gql<{ fetchChapterPages: { pages: string[] } }>(FETCH_CHAPTER_PAGES, { chapterId: id })
        .then((d) => {
          const urls = d.fetchChapterPages.pages.map(thumbUrl);
          pageCache.current.set(id, urls);
          urls.slice(0, 2).forEach(preloadImage);
        }).catch(() => {});
    };
    if (adjacent.next) preload(adjacent.next.id);
    if (adjacent.prev) preload(adjacent.prev.id);
  }, [adjacent.next?.id, adjacent.prev?.id]);

  const lastPage = pageUrls.length;

  // ── Auto-mark read + history ─────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChapter || !lastPage) return;
    if (activeManga) {
      addHistory({
        mangaId: activeManga.id, mangaTitle: activeManga.title,
        thumbnailUrl: activeManga.thumbnailUrl, chapterId: activeChapter.id,
        chapterName: activeChapter.name, pageNumber, readAt: Date.now(),
      });
    }
    if (settings.autoMarkRead && pageNumber === lastPage && !markedRead.has(activeChapter.id)) {
      setMarkedRead((p) => new Set(p).add(activeChapter.id));
      gql(MARK_CHAPTER_READ, { id: activeChapter.id, isRead: true }).catch(console.error);
    }
  }, [pageNumber, lastPage, activeChapter?.id]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const advanceGroup = useCallback((forward: boolean) => {
    if (!pageGroups.length) return;
    const gi = pageGroups.findIndex((g) => g.includes(pageNumber));
    if (forward) {
      if (gi < pageGroups.length - 1) setPageNumber(pageGroups[gi + 1][0]);
      else if (adjacent.next) { setPageNumber(1); openReader(adjacent.next, activeChapterList); }
      else closeReader();
    } else {
      if (gi > 0) setPageNumber(pageGroups[gi - 1][0]);
      else if (adjacent.prev) openReader(adjacent.prev, activeChapterList);
    }
  }, [pageGroups, pageNumber, adjacent, activeChapterList]);

  const goForward = useCallback(() => {
    if (style === "double" && pageGroups.length) { advanceGroup(true); return; }
    if (pageNumber < lastPage) {
      setPageNumber(pageNumber + 1);
    } else if (adjacent.next) {
      setPageNumber(1);
      openReader(adjacent.next, activeChapterList);
    } else {
      closeReader();
    }
  }, [pageNumber, lastPage, adjacent, activeChapterList, style, pageGroups, advanceGroup]);

  const goBack = useCallback(() => {
    if (style === "double" && pageGroups.length) { advanceGroup(false); return; }
    if (pageNumber > 1) setPageNumber(pageNumber - 1);
    else if (adjacent.prev) openReader(adjacent.prev, activeChapterList);
  }, [pageNumber, adjacent, activeChapterList, style, pageGroups, advanceGroup]);

  const goNext = rtl ? goBack  : goForward;
  const goPrev = rtl ? goForward : goBack;

  function cycleStyle() {
    const cycle = ["single", "longstrip"] as const;
    const cur = style === "double" ? "single" : style;
    const next = cycle[(cycle.indexOf(cur as any) + 1) % cycle.length];
    updateSettings({ pageStyle: next });
  }

  function cycleFit() {
    const cycle: FitMode[] = ["width", "height", "screen", "original"];
    updateSettings({ fitMode: cycle[(cycle.indexOf(fit) + 1) % cycle.length] });
  }

  // ── Ctrl+scroll → zoom ───────────────────────────────────────────────────────
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 50 : -50;
      updateSettings({ maxPageWidth: Math.min(2400, Math.max(200, maxW + delta)) });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [maxW]);

  // ── Keybinds ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "Escape") {
        if (zoomOpen) { e.preventDefault(); setZoomOpen(false); return; }
        if (dlOpen)   { e.preventDefault(); setDlOpen(false); return; }
      }
      if (matchesKeybind(e, kb.pageRight))                   { e.preventDefault(); goForward(); }
      else if (matchesKeybind(e, kb.pageLeft))               { e.preventDefault(); goBack(); }
      else if (matchesKeybind(e, kb.firstPage))              { e.preventDefault(); setPageNumber(1); }
      else if (matchesKeybind(e, kb.lastPage))               { e.preventDefault(); setPageNumber(lastPage); }
      else if (matchesKeybind(e, kb.chapterRight))           { e.preventDefault(); if (adjacent.next) openReader(adjacent.next, activeChapterList); }
      else if (matchesKeybind(e, kb.chapterLeft))            { e.preventDefault(); if (adjacent.prev) openReader(adjacent.prev, activeChapterList); }
      else if (matchesKeybind(e, kb.exitReader))             { e.preventDefault(); closeReader(); }
      else if (matchesKeybind(e, kb.togglePageStyle))        { e.preventDefault(); cycleStyle(); }
      else if (matchesKeybind(e, kb.toggleReadingDirection)) { e.preventDefault(); updateSettings({ readingDirection: rtl ? "ltr" : "rtl" }); }
      else if (matchesKeybind(e, kb.openSettings))           { e.preventDefault(); openSettings(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goForward, goBack, kb, style, rtl, lastPage, adjacent, activeChapterList, zoomOpen, dlOpen]);

  // ── Longstrip scroll tracker ─────────────────────────────────────────────────
  // Tracks current page number and auto-advances to next chapter at end of scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el || style !== "longstrip") return;

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!el) return;
        const imgs = Array.from(el.querySelectorAll("img[data-page]")) as HTMLElement[];

        // Find the image whose center is closest to the viewport center
        const viewMid = el.scrollTop + el.clientHeight * 0.5;
        let closest = 0;
        let closestDist = Infinity;
        for (let i = 0; i < imgs.length; i++) {
          const imgMid = imgs[i].offsetTop + imgs[i].offsetHeight * 0.5;
          const dist = Math.abs(imgMid - viewMid);
          if (dist < closestDist) { closestDist = dist; closest = i; }
        }
        const n = closest + 1;
        if (n !== pageNumRef.current) setPageNumber(n);

        // Auto-advance: within 80px of bottom and next chapter exists
        if (autoNext && adjacent.next) {
          const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
          if (nearBottom) openReader(adjacent.next, activeChapterList);
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [style, autoNext, adjacent.next?.id, activeChapterList]);

  // Reset scroll position when switching chapters in non-longstrip modes
  useEffect(() => {
    if (style !== "longstrip" && containerRef.current) containerRef.current.scrollTop = 0;
  }, [pageNumber, style]);

  // When switching to longstrip, reset scroll to top
  useEffect(() => {
    if (style === "longstrip" && containerRef.current) containerRef.current.scrollTop = 0;
  }, [activeChapter?.id, style]);

  function handleTap(e: React.MouseEvent) {
    if (style === "longstrip") return;
    const x = e.clientX / window.innerWidth;
    if (!rtl) { if (x > 0.6) goForward(); else if (x < 0.4) goBack(); }
    else       { if (x < 0.4) goForward(); else if (x > 0.6) goBack(); }
  }

  // ── CSS vars ─────────────────────────────────────────────────────────────────
  const cssVars = { "--max-page-width": `${maxW}px` } as React.CSSProperties;

  const imgCls = [
    s.img,
    fit === "width"    && s.fitWidth,
    fit === "height"   && s.fitHeight,
    fit === "screen"   && s.fitScreen,
    fit === "original" && s.fitOriginal,
    settings.optimizeContrast && s.optimizeContrast,
  ].filter(Boolean).join(" ");

  // ── Icons ────────────────────────────────────────────────────────────────────
  const fitIcon =
    fit === "width"    ? <ArrowsLeftRight size={14} weight="light" /> :
    fit === "height"   ? <ArrowsVertical size={14} weight="light" /> :
    fit === "screen"   ? <ArrowsIn size={14} weight="light" /> :
                         <ArrowsOut size={14} weight="light" />;

  const fitLabel = { width: "Fit W", height: "Fit H", screen: "Fit Screen", original: "1:1" }[fit];

  const styleIcon = style === "single" ? <Square size={14} weight="light" /> : <Rows size={14} weight="light" />;

  if (loading) return (
    <div className={s.center}>
      <CircleNotch size={20} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
    </div>
  );

  if (error) return (
    <div className={s.center}><p className={s.errorMsg}>{error}</p></div>
  );

  return (
    <div
      className={s.root}
      onMouseMove={(e) => {
        const fromTop    = e.clientY;
        const fromBottom = window.innerHeight - e.clientY;
        if (fromTop < 60 || fromBottom < 60) showUi();
      }}
    >
      {/* ── Topbar ── */}
      <div
        ref={uiRef}
        className={[s.topbar, uiVisible ? "" : s.uiHidden].join(" ")}
      >
        <button className={s.iconBtn} onClick={closeReader} title="Close reader">
          <X size={15} weight="light" />
        </button>
        <button
          className={s.iconBtn}
          onClick={() => adjacent.prev && openReader(adjacent.prev, activeChapterList)}
          disabled={!adjacent.prev}
          title="Previous chapter"
        >
          <CaretLeft size={14} weight="light" />
        </button>
        <span className={s.chLabel}>
          <span className={s.chTitle}>{activeManga?.title}</span>
          <span className={s.chSep}>/</span>
          <span>{activeChapter?.name}</span>
        </span>
        <span className={s.pageLabel}>{pageNumber} / {lastPage || "…"}</span>
        <button
          className={s.iconBtn}
          onClick={() => adjacent.next && openReader(adjacent.next, activeChapterList)}
          disabled={!adjacent.next}
          title="Next chapter"
        >
          <CaretRight size={14} weight="light" />
        </button>

        <div className={s.topSep} />

        {/* Fit mode */}
        <button className={s.modeBtn} onClick={cycleFit} title={`Fit mode: ${fitLabel}\nCtrl+scroll to zoom`}>
          {fitIcon}
          <span className={s.modeBtnLabel}>{fitLabel}</span>
        </button>

        {/* Zoom */}
        <div className={s.zoomWrap}>
          <button
            className={s.zoomBtn}
            onClick={() => setZoomOpen((o) => !o)}
            title="Zoom (click for slider, Ctrl+scroll)"
          >
            {Math.round((maxW / 900) * 100)}%
          </button>
          {zoomOpen && (
            <ZoomPopover
              value={maxW}
              onChange={(v) => updateSettings({ maxPageWidth: v })}
              onReset={() => updateSettings({ maxPageWidth: 900 })}
              onClose={() => setZoomOpen(false)}
            />
          )}
        </div>

        {/* RTL */}
        <button
          className={[s.modeBtn, rtl ? s.modeBtnActive : ""].join(" ")}
          onClick={() => updateSettings({ readingDirection: rtl ? "ltr" : "rtl" })}
          title={`Direction: ${rtl ? "RTL" : "LTR"}`}
        >
          <ArrowsLeftRight size={14} weight="light" />
          <span className={s.modeBtnLabel}>{rtl ? "RTL" : "LTR"}</span>
        </button>

        {/* Page style */}
        <button className={s.modeBtn} onClick={cycleStyle} title={`Layout: ${style}`}>
          {styleIcon}
          <span className={s.modeBtnLabel}>{style}</span>
        </button>

        {/* Page gap toggle */}
        {style !== "single" && (
          <button
            className={[s.modeBtn, settings.pageGap ? s.modeBtnActive : ""].join(" ")}
            onClick={() => updateSettings({ pageGap: !settings.pageGap })}
            title="Toggle page gap"
          >
            <span className={s.modeBtnLabel}>Gap</span>
          </button>
        )}

        {/* Auto-next chapter */}
        {style === "longstrip" && (
          <button
            className={[s.modeBtn, autoNext ? s.modeBtnActive : ""].join(" ")}
            onClick={() => updateSettings({ autoNextChapter: !autoNext })}
            title="Auto-advance to next chapter"
          >
            <span className={s.modeBtnLabel}>Auto</span>
          </button>
        )}

        {/* Download */}
        <button className={s.modeBtn} onClick={() => setDlOpen(true)} title="Download options">
          <Download size={14} weight="light" />
        </button>
      </div>

      {/* ── Viewer ── */}
      <div
        ref={containerRef}
        className={[s.viewer, style === "longstrip" ? s.viewerStrip : ""].join(" ")}
        style={cssVars}
        tabIndex={-1}
        onClick={handleTap}
        onKeyDown={(e) => {
          if (e.key === " " && style === "longstrip") {
            e.preventDefault();
            containerRef.current?.scrollBy({ top: containerRef.current.clientHeight * 0.85, behavior: "smooth" });
          }
        }}
      >
        {style === "longstrip" ? (
          pageUrls.map((url, i) => (
            <img
              key={`${activeChapter?.id}-${i}`}
              src={url}
              alt={`Page ${i + 1}`}
              data-page={i + 1}
              className={[imgCls, settings.pageGap ? s.stripGap : ""].join(" ")}
              loading={i < 3 ? "eager" : "lazy"}
              decoding="async"
            />
          ))
        ) : (
          <img
            key={pageNumber}
            src={pageUrls[pageNumber - 1]}
            alt={`Page ${pageNumber}`}
            className={imgCls}
            decoding="async"
          />
        )}
      </div>

      {/* ── Bottom nav ── */}
      <div className={[s.bottombar, uiVisible ? "" : s.uiHidden].join(" ")}>
        <button className={s.navBtn} onClick={goPrev} disabled={pageNumber === 1 && !adjacent.prev}>
          <ArrowLeft size={13} weight="light" />
        </button>
        <button className={s.navBtn} onClick={goNext} disabled={pageNumber === lastPage && !adjacent.next}>
          <ArrowRight size={13} weight="light" />
        </button>
      </div>

      {dlOpen && activeChapter && (
        <DownloadModal
          chapter={activeChapter}
          remaining={adjacent.remaining}
          onClose={() => setDlOpen(false)}
        />
      )}
    </div>
  );
}