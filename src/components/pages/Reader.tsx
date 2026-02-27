import React, { useEffect, useRef, useCallback, useState, useMemo } from "react";
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
import { matchesKeybind, toggleFullscreen, DEFAULT_KEYBINDS, type Keybinds } from "../../lib/keybinds";
import s from "./Reader.module.css";

// ── Page cache (module-level, survives re-renders) ────────────────────────────
const pageCache  = new Map<number, string[]>();
const inflight   = new Map<number, Promise<string[]>>();
const cacheOrder: number[] = [];
const MAX_CACHED = 6;

function cacheTouch(id: number) {
  const i = cacheOrder.indexOf(id);
  if (i !== -1) cacheOrder.splice(i, 1);
  cacheOrder.push(id);
}

function cacheEvict(keep: Set<number>) {
  while (pageCache.size > MAX_CACHED) {
    const victim = cacheOrder.find((id) => !keep.has(id));
    if (!victim) break;
    cacheOrder.splice(cacheOrder.indexOf(victim), 1);
    pageCache.delete(victim);
  }
}

function fetchPages(chapterId: number, signal?: AbortSignal): Promise<string[]> {
  const cached = pageCache.get(chapterId);
  if (cached) { cacheTouch(chapterId); return Promise.resolve(cached); }

  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

  // The inflight promise is shared — never pass a caller's signal into it,
  // because one caller aborting would kill the fetch for everyone else waiting.
  if (!inflight.has(chapterId)) {
    const p = gql<{ fetchChapterPages: { pages: string[] } }>(
      FETCH_CHAPTER_PAGES, { chapterId },
    ).then((d) => {
      const urls = d.fetchChapterPages.pages.map(thumbUrl);
      pageCache.set(chapterId, urls);
      cacheTouch(chapterId);
      return urls;
    }).finally(() => inflight.delete(chapterId));
    inflight.set(chapterId, p);
  }

  const base = inflight.get(chapterId)!;

  // No abort signal — return the shared promise directly
  if (!signal) return base;

  // Wrap so this caller can abort their own wait without cancelling the network request
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    base.then(resolve, reject);
  });
}

// ── Image helpers ─────────────────────────────────────────────────────────────
const aspectCache = new Map<string, number>();

function preloadImage(url: string) { new Image().src = url; }

function decodeImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => { img.decode ? img.decode().then(resolve, resolve) : resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  });
}

function measureAspect(url: string): Promise<number> {
  if (aspectCache.has(url)) return Promise.resolve(aspectCache.get(url)!);
  return new Promise((res) => {
    const img = new Image();
    img.onload  = () => { aspectCache.set(url, img.naturalWidth / img.naturalHeight); res(aspectCache.get(url)!); };
    img.onerror = () => res(0.67);
    img.src = url;
  });
}

// ── Download modal ────────────────────────────────────────────────────────────
function DownloadModal({
  chapter, remaining, onClose,
}: {
  chapter: { id: number; name: string; isDownloaded?: boolean };
  remaining: { id: number; isDownloaded?: boolean }[];
  onClose: () => void;
}) {
  const addToast   = useStore((s) => s.addToast);
  const [nextN, setNextN] = useState(5);
  const [busy, setBusy]   = useState(false);
  const queueable  = remaining.filter((c) => !c.isDownloaded);
  const alreadyDl  = !!chapter.isDownloaded;

  const run = async (fn: () => Promise<unknown>, toastBody: string) => {
    setBusy(true);
    try {
      await fn();
      addToast({ kind: "download", title: "Download queued", body: toastBody });
    } catch (e) {
      addToast({ kind: "error", title: "Queue failed", body: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
    onClose();
  };

  return (
    <div className={s.dlBackdrop} onClick={onClose}>
      <div className={s.dlModal} onClick={(e) => e.stopPropagation()}>
        <p className={s.dlTitle}>Download</p>
        <button className={s.dlOption} disabled={busy || alreadyDl}
          onClick={() => run(() => gql(ENQUEUE_DOWNLOAD, { chapterId: chapter.id }), alreadyDl ? "" : chapter.name)}>
          This chapter
          <span className={s.dlSub}>{alreadyDl ? "Already downloaded" : chapter.name}</span>
        </button>
        <div className={s.dlRow}>
          <button className={s.dlOption} disabled={busy || queueable.length === 0}
            onClick={() => run(
              () => gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: queueable.slice(0, nextN).map((c) => c.id) }),
              `${Math.min(nextN, queueable.length)} chapters queued`,
            )}>
            Next chapters
            <span className={s.dlSub}>{Math.min(nextN, queueable.length)} not yet downloaded</span>
          </button>
          <div className={s.dlStepper} onClick={(e) => e.stopPropagation()}>
            <button className={s.dlStepBtn} onClick={() => setNextN((n) => Math.max(1, n - 1))} disabled={nextN <= 1}>−</button>
            <span className={s.dlStepVal}>{nextN}</span>
            <button className={s.dlStepBtn} onClick={() => setNextN((n) => Math.min(queueable.length || 1, n + 1))} disabled={nextN >= queueable.length}>+</button>
          </div>
        </div>
        <button className={s.dlOption} disabled={busy || queueable.length === 0}
          onClick={() => run(
            () => gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: queueable.map((c) => c.id) }),
            `${queueable.length} chapter${queueable.length !== 1 ? "s" : ""} queued`,
          )}>
          All remaining
          <span className={s.dlSub}>{queueable.length} not yet downloaded</span>
        </button>
      </div>
    </div>
  );
}

// ── Zoom popover ──────────────────────────────────────────────────────────────
function ZoomPopover({ value, onChange, onReset, onClose }: {
  value: number; onChange: (v: number) => void; onReset: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div className={s.zoomPopover} ref={ref}>
      <input type="range" className={s.zoomSlider} min={200} max={2400} step={50} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <button className={s.zoomResetBtn} onClick={onReset}>{Math.round((value / 900) * 100)}%</button>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface StripChapter {
  chapterId:      number;
  chapterName:    string;
  urls:           string[];
  startGlobalIdx: number;
}

// ── Reader ────────────────────────────────────────────────────────────────────
export default function Reader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef  = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live-value refs — updated every render, readable inside effects without stale closures
  const settingsRef    = useRef<typeof settings | null>(null);
  const chapterListRef = useRef<typeof activeChapterList>([]);
  const loadingIdRef   = useRef<number | null>(null);
  const markedReadRef  = useRef<Set<number>>(new Set());
  const appendedRef    = useRef<Set<number>>(new Set());
  const abortRef       = useRef<AbortController | null>(null);

  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState<string | null>(null);
  const [dlOpen, setDlOpen]                     = useState(false);
  const [zoomOpen, setZoomOpen]                 = useState(false);
  const [uiVisible, setUiVisible]               = useState(true);
  const [pageReady, setPageReady]               = useState(false);
  const [pageGroups, setPageGroups]             = useState<number[][]>([]);
  const [stripChapters, setStripChapters]       = useState<StripChapter[]>([]);
  const [visibleChapterId, setVisibleChapterId] = useState<number | null>(null);
  const stripChaptersRef = useRef<StripChapter[]>([]);
  stripChaptersRef.current = stripChapters;

  const {
    activeManga, activeChapter, activeChapterList,
    pageUrls, pageNumber, settings,
    setPageUrls, setPageNumber, closeReader, openReader, openSettings,
    updateSettings, addHistory,
  } = useStore();

  const rtl      = settings.readingDirection === "rtl";
  const fit      = settings.fitMode      ?? "width";
  const style    = settings.pageStyle    ?? "single";
  const maxW     = settings.maxPageWidth ?? 900;
  const autoNext = settings.autoNextChapter ?? false;

  // Sync live refs every render
  settingsRef.current    = settings;
  chapterListRef.current = activeChapterList;

  // ── UI autohide ──────────────────────────────────────────────────────────────
  const showUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setUiVisible(false), 3000);
  }, []);

  useEffect(() => {
    showUi();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  useEffect(() => { containerRef.current?.focus({ preventScroll: true }); }, [activeChapter?.id]);

  // ── Load chapter ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChapter) {
      abortRef.current?.abort();
      appendedRef.current   = new Set();
      markedReadRef.current = new Set();
      setStripChapters([]);
      setVisibleChapterId(null);
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const targetId = activeChapter.id;
    loadingIdRef.current  = targetId;
    appendedRef.current       = new Set();
    markedReadRef.current     = new Set();
    setLoading(true);
    setError(null);
    setPageGroups([]);
    setPageReady(false);
    setStripChapters([]);
    setVisibleChapterId(null);

    fetchPages(targetId, ctrl.signal)
      .then(async (urls) => {
        if (ctrl.signal.aborted) return;
        if (style !== "longstrip") await decodeImage(urls[0]);
        if (ctrl.signal.aborted) return;
        setPageUrls(urls);
        setPageReady(true);
        if (style === "longstrip" && autoNext) {
          setStripChapters([{ chapterId: targetId, chapterName: activeChapter.name, urls, startGlobalIdx: 0 }]);
          setVisibleChapterId(targetId);
          // Manual kick: when stripChapters goes 0→1 the dep-array change
          // re-creates the observer. If the sentinel is already in the viewport
          // at that moment the new observer fires immediately and handles the
          // append itself. But if getBoundingClientRect shows it's already
          // visible before the observer has a chance to fire, kick directly.
          const _sentinel = sentinelRef.current;
          const _el       = containerRef.current;
          if (_sentinel && _el) {
            const sr = _sentinel.getBoundingClientRect();
            const er = _el.getBoundingClientRect();
            if (sr.top < er.bottom + 500) {
              const list = chapterListRef.current;
              const idx  = list.findIndex((c) => c.id === targetId);
              const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
              if (next && !appendedRef.current.has(next.id)) {
                appendedRef.current.add(next.id);
                fetchPages(next.id)
                  .then((u) => Promise.all(u.map(measureAspect)).then(() => u))
                  .then((u) => setStripChapters((cur) => {
                    if (cur.some((c) => c.chapterId === next.id)) return cur;
                    const last = cur[cur.length - 1];
                    const newStart = last ? last.startGlobalIdx + last.urls.length : 0;
                    const updated = [...cur, { chapterId: next.id, chapterName: next.name, urls: u, startGlobalIdx: newStart }];
                    if (updated.length > 3) {
                      const container = containerRef.current;
                      if (container) {
                        const firstKeptImg = container.querySelector(
                          `img[data-chapter="${updated[1].chapterId}"]`
                        ) as HTMLElement | null;
                        if (firstKeptImg) container.scrollTop -= firstKeptImg.offsetTop;
                      }
                      return updated.slice(-3);
                    }
                    return updated;
                  })).catch((err) => { console.error(err); appendedRef.current.delete(next.id); });
              }
            }
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
  }, [activeChapter?.id]);

  // ── Longstrip: IntersectionObserver for page number + visible chapter ─────────
  // Watches every img[data-page]. Fires on scroll, keyboard jump, or any navigation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || style !== "longstrip") return;

    const obs = new IntersectionObserver((entries) => {
      let topPage = Infinity;
      let topChId: number | null = null;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const p  = Number((entry.target as HTMLElement).dataset.page);
        const ch = Number((entry.target as HTMLElement).dataset.chapter);
        if (p < topPage) { topPage = p; topChId = ch; }
      }
      if (topPage !== Infinity) setPageNumber(topPage);
      if (topChId && topChId !== visibleChapterId) {
        // Mark the chapter we just left as read
        if (settingsRef.current?.autoMarkRead && visibleChapterId && !markedReadRef.current.has(visibleChapterId)) {
          markedReadRef.current.add(visibleChapterId);
          gql(MARK_CHAPTER_READ, { id: visibleChapterId, isRead: true }).catch(console.error);
        }
        setVisibleChapterId(topChId);
      }
    }, { root: el, threshold: 0.1 });

    el.querySelectorAll("img[data-page]").forEach((img) => obs.observe(img));
    return () => obs.disconnect();
  }, [style, stripChapters, pageUrls, visibleChapterId]);

  // ── Longstrip: sentinel triggers append (or plain chapter advance) ────────────
  // The sentinel div sits at the very bottom of the strip. When it enters the
  // viewport — via scroll, keyboard jump, or any other means — we fetch the
  // next chapter. rootMargin pre-fires 500px before it's actually visible.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const el       = containerRef.current;
    // Gatekeeper: don't observe until chapter 1 is actually in the DOM.
    // stripChapters is in the dep array, so this effect re-runs the moment
    // content exists — and the new observer fires immediately for an already-
    // visible sentinel.
    if (!sentinel || !el || style !== "longstrip") return;
    // Gatekeeper for autoNext: don't create the observer until the strip has
    // content. On mount the sentinel is at the top of an empty container —
    // it fires immediately, sees no strip, and goes permanently idle.
    // stripChapters is a dep so this effect re-runs the moment ch1 is seeded,
    // creating a fresh observer that accurately checks the sentinel position.
    // Non-autoNext uses loadingIdRef not stripChapters — no gate needed there.
    if (autoNext && stripChapters.length === 0) return;

    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;

      if (!autoNext) {
        const list = chapterListRef.current;
        const idx  = list.findIndex((c) => c.id === loadingIdRef.current);
        const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
        if (next) openReader(next, list);
        return;
      }

      // Read from ref — always current, no stale closure, no updater needed
      const strip   = stripChaptersRef.current;
      const lastChunk = strip[strip.length - 1];
      if (!lastChunk) return;

      const list    = chapterListRef.current;
      const lastIdx = list.findIndex((c) => c.id === lastChunk.chapterId);
      if (lastIdx < 0 || lastIdx >= list.length - 1) return;

      const nextEntry = list[lastIdx + 1];
      if (!nextEntry || appendedRef.current.has(nextEntry.id)) return;

      // Lock immediately and synchronously — before any async work
      appendedRef.current.add(nextEntry.id);

      fetchPages(nextEntry.id)
        .then((urls) => Promise.all(urls.map(measureAspect)).then(() => urls))
        .then((urls) => {
          setStripChapters((cur) => {
            if (cur.some((c) => c.chapterId === nextEntry.id)) return cur;
            const last     = cur[cur.length - 1];
            const newStart = last ? last.startGlobalIdx + last.urls.length : 0;
            const next     = [...cur, { chapterId: nextEntry.id, chapterName: nextEntry.name, urls, startGlobalIdx: newStart }];
            if (next.length > 3) {
              // Compensate scroll so the viewport doesn't jump when the
              // first chunk is trimmed off the top of the DOM.
              const container = containerRef.current;
              if (container) {
                const firstKeptImg = container.querySelector(
                  `img[data-chapter="${next[1].chapterId}"]`
                ) as HTMLElement | null;
                if (firstKeptImg) {
                  container.scrollTop -= firstKeptImg.offsetTop;
                }
              }
              return next.slice(-3);
            }
            return next;
          });
        }).catch((err) => {
          console.error(err);
          appendedRef.current.delete(nextEntry.id); // allow retry on failure
        });
    }, { root: el, rootMargin: "0px 0px 500px 0px", threshold: 0 });

    obs.observe(sentinel);
    return () => obs.disconnect();
  // stripChapters.length as dep: observer re-mounts exactly once when ch1
  // arrives (0→1), not on every subsequent append.
  }, [style, autoNext, stripChapters.length, openReader]);

  // Mark last chunk read when reaching the very bottom of the strip
  useEffect(() => {
    const el = containerRef.current;
    if (!el || style !== "longstrip" || !autoNext) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 40) return;
      setStripChapters((cur) => {
        const last = cur[cur.length - 1];
        if (last && settingsRef.current?.autoMarkRead && !markedReadRef.current.has(last.chapterId)) {
          markedReadRef.current.add(last.chapterId);
          gql(MARK_CHAPTER_READ, { id: last.chapterId, isRead: true }).catch(console.error);
        }
        return cur;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [style, autoNext, stripChapters]);

  // Rebuild strip when autoNext is toggled while longstrip is active
  useEffect(() => {
    if (style !== "longstrip" || !pageUrls.length || !activeChapter) return;
    appendedRef.current = new Set();
    if (autoNext) {
      setStripChapters([{ chapterId: activeChapter.id, chapterName: activeChapter.name, urls: pageUrls, startGlobalIdx: 0 }]);
      setVisibleChapterId(activeChapter.id);
    } else {
      setStripChapters([]);
      setVisibleChapterId(null);
    }
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [autoNext, style]);

  // Reset scroll on non-longstrip page change
  useEffect(() => {
    if (style !== "longstrip" && containerRef.current) containerRef.current.scrollTop = 0;
  }, [pageNumber, style]);

  // ── Double-page grouping ─────────────────────────────────────────────────────
  useEffect(() => {
    if (style !== "double" || !pageUrls.length) { setPageGroups([]); return; }
    let cancelled = false;
    const snap = pageUrls;
    Promise.all(snap.map(measureAspect)).then((aspects) => {
      if (cancelled || snap !== pageUrls) return;
      const offset = settings.offsetDoubleSpreads;
      const groups: number[][] = [[1]];
      if (offset) groups.push([2]);
      let i = offset ? 3 : 2;
      while (i <= snap.length) {
        const a     = aspects[i - 1];
        const nextA = aspects[i] ?? 0;
        if (a > 1.2 || i === snap.length || nextA > 1.2) {
          groups.push([i++]);
        } else {
          groups.push(rtl ? [i + 1, i] : [i, i + 1]);
          i += 2;
        }
      }
      setPageGroups(groups);
    });
    return () => { cancelled = true; };
  }, [pageUrls, style, settings.offsetDoubleSpreads, rtl]);

  // ── Preload adjacent pages ───────────────────────────────────────────────────
  useEffect(() => {
    const ahead = settings.preloadPages ?? 3;
    for (let i = 1; i <= ahead; i++) {
      const url = pageUrls[pageNumber - 1 + i];
      if (url) decodeImage(url);
    }
    const behind = pageUrls[pageNumber - 2];
    if (behind) preloadImage(behind);
  }, [pageNumber, pageUrls, settings.preloadPages]);

  // ── Adjacent chapters + cache eviction ──────────────────────────────────────
  const adjacent = useMemo(() => {
    if (!activeChapter || !activeChapterList.length)
      return { prev: null, next: null, remaining: [] };
    const idx = activeChapterList.findIndex((c) => c.id === activeChapter.id);
    return {
      prev:      idx > 0                              ? activeChapterList[idx - 1] : null,
      next:      idx < activeChapterList.length - 1   ? activeChapterList[idx + 1] : null,
      remaining: activeChapterList.slice(idx + 1),
    };
  }, [activeChapter, activeChapterList]);

  useEffect(() => {
    const pinned = new Set([activeChapter?.id, adjacent.next?.id, adjacent.prev?.id].filter(Boolean) as number[]);
    if (adjacent.next) fetchPages(adjacent.next.id).then((u) => u.slice(0, 3).forEach(preloadImage)).catch(() => {});
    if (adjacent.prev) fetchPages(adjacent.prev.id).then((u) => u.slice(0, 3).forEach(preloadImage)).catch(() => {});
    cacheEvict(pinned);
  }, [adjacent.next?.id, adjacent.prev?.id]);

  // ── Derived display values ───────────────────────────────────────────────────
  const lastPage = pageUrls.length;

  const displayChapter = useMemo(() => {
    if (style !== "longstrip" || !autoNext || !visibleChapterId) return activeChapter;
    return activeChapterList.find((c) => c.id === visibleChapterId) ?? activeChapter;
  }, [style, autoNext, visibleChapterId, activeChapter, activeChapterList]);

  const visibleChunkLastPage = useMemo(() => {
    if (style !== "longstrip" || !autoNext) return lastPage;
    const chunk = stripChapters.find((c) => c.chapterId === (visibleChapterId ?? activeChapter?.id));
    return chunk?.urls.length ?? lastPage;
  }, [style, autoNext, stripChapters, visibleChapterId, activeChapter?.id, lastPage]);

  const visibleChunkPage = useMemo(() => {
    if (style !== "longstrip" || !autoNext) return pageNumber;
    const chunk = stripChapters.find((c) => c.chapterId === (visibleChapterId ?? activeChapter?.id));
    return chunk ? Math.max(1, pageNumber - chunk.startGlobalIdx) : pageNumber;
  }, [style, autoNext, stripChapters, visibleChapterId, activeChapter?.id, pageNumber]);

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
    if (style === "longstrip" && autoNext) return; // handled by IntersectionObserver
    if (settings.autoMarkRead && pageNumber === lastPage) {
      if (!markedReadRef.current.has(activeChapter.id)) {
        markedReadRef.current.add(activeChapter.id);
        gql(MARK_CHAPTER_READ, { id: activeChapter.id, isRead: true }).catch(console.error);
      }
    }
  }, [pageNumber, lastPage, activeChapter?.id, settings.autoMarkRead, style, autoNext]);

  // ── Navigation ───────────────────────────────────────────────────────────────
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
    if (loading || !pageUrls.length) return;
    if (style === "double" && pageGroups.length) { advanceGroup(true); return; }
    if (pageNumber < lastPage) {
      decodeImage(pageUrls[pageNumber]).then(() => setPageNumber(pageNumber + 1));
    } else if (adjacent.next) {
      setPageNumber(1); openReader(adjacent.next, activeChapterList);
    } else {
      closeReader();
    }
  }, [loading, pageNumber, lastPage, pageUrls, adjacent, activeChapterList, style, pageGroups, advanceGroup]);

  const goBack = useCallback(() => {
    if (loading || !pageUrls.length) return;
    if (style === "double" && pageGroups.length) { advanceGroup(false); return; }
    if (pageNumber > 1) {
      decodeImage(pageUrls[pageNumber - 2]).then(() => setPageNumber(pageNumber - 1));
    } else if (adjacent.prev) {
      openReader(adjacent.prev, activeChapterList);
    }
  }, [loading, pageNumber, pageUrls, adjacent, activeChapterList, style, pageGroups, advanceGroup]);

  const goNext = rtl ? goBack  : goForward;
  const goPrev = rtl ? goForward : goBack;

  function cycleStyle() {
    const opts = ["single", "longstrip"] as const;
    const cur  = style === "double" ? "single" : style;
    updateSettings({ pageStyle: opts[(opts.indexOf(cur as typeof opts[number]) + 1) % opts.length] });
  }

  function cycleFit() {
    const opts: FitMode[] = ["width", "height", "screen", "original"];
    updateSettings({ fitMode: opts[(opts.indexOf(fit) + 1) % opts.length] });
  }

  // ── Ctrl+scroll → zoom ───────────────────────────────────────────────────────
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      updateSettings({ maxPageWidth: Math.min(2400, Math.max(200, maxW + (e.deltaY < 0 ? 50 : -50))) });
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [maxW]);

  // ── Keybinds ─────────────────────────────────────────────────────────────────
  const goForwardRef  = useRef(goForward);
  const goBackRef     = useRef(goBack);
  const cycleStyleRef = useRef(cycleStyle);
  useEffect(() => { goForwardRef.current  = goForward;  }, [goForward]);
  useEffect(() => { goBackRef.current     = goBack;     }, [goBack]);
  useEffect(() => { cycleStyleRef.current = cycleStyle; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const kb: Keybinds = settingsRef.current?.keybinds ?? DEFAULT_KEYBINDS;
      const maxW = settingsRef.current?.maxPageWidth ?? 900;
      const rtl  = settingsRef.current?.readingDirection === "rtl";

      if (e.key === "Escape") {
        e.preventDefault();
        if (zoomOpen) { setZoomOpen(false); return; }
        if (dlOpen)   { setDlOpen(false);   return; }
        closeReader(); return;
      }
      if (e.ctrlKey && (e.key === "=" || e.key === "+")) { e.preventDefault(); updateSettings({ maxPageWidth: Math.min(2400, maxW + 100) }); return; }
      if (e.ctrlKey && e.key === "-")                    { e.preventDefault(); updateSettings({ maxPageWidth: Math.max(200,  maxW - 100) }); return; }
      if (e.ctrlKey && e.key === "0")                    { e.preventDefault(); updateSettings({ maxPageWidth: 900 });                       return; }

      if      (matchesKeybind(e, kb.exitReader))             { e.preventDefault(); closeReader(); }
      else if (matchesKeybind(e, kb.pageRight))              { e.preventDefault(); goForwardRef.current(); }
      else if (matchesKeybind(e, kb.pageLeft))               { e.preventDefault(); goBackRef.current(); }
      else if (matchesKeybind(e, kb.firstPage))              { e.preventDefault(); setPageNumber(1); }
      else if (matchesKeybind(e, kb.lastPage))               { e.preventDefault(); setPageNumber(lastPage); }
      else if (matchesKeybind(e, kb.chapterRight)) {
        e.preventDefault();
        const list = chapterListRef.current;
        const idx  = list.findIndex((c) => c.id === loadingIdRef.current);
        const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
        if (next) openReader(next, list);
      }
      else if (matchesKeybind(e, kb.chapterLeft)) {
        e.preventDefault();
        const list = chapterListRef.current;
        const idx  = list.findIndex((c) => c.id === loadingIdRef.current);
        const prev = idx > 0 ? list[idx - 1] : null;
        if (prev) openReader(prev, list);
      }
      else if (matchesKeybind(e, kb.togglePageStyle))        { e.preventDefault(); cycleStyleRef.current(); }
      else if (matchesKeybind(e, kb.toggleReadingDirection)) { e.preventDefault(); updateSettings({ readingDirection: rtl ? "ltr" : "rtl" }); }
      else if (matchesKeybind(e, kb.toggleFullscreen))       { e.preventDefault(); toggleFullscreen().catch(console.error); }
      else if (matchesKeybind(e, kb.openSettings))           { e.preventDefault(); openSettings(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen, dlOpen, lastPage]);

  // ── Render ───────────────────────────────────────────────────────────────────
  function handleTap(e: React.MouseEvent) {
    if (style === "longstrip") return;
    const x = e.clientX / window.innerWidth;
    if (!rtl) { if (x > 0.6) goForward(); else if (x < 0.4) goBack(); }
    else       { if (x < 0.4) goForward(); else if (x > 0.6) goBack(); }
  }

  const cssVars   = { "--max-page-width": `${maxW}px` } as React.CSSProperties;
  const imgCls    = [
    s.img,
    fit === "width"    && s.fitWidth,
    fit === "height"   && s.fitHeight,
    fit === "screen"   && s.fitScreen,
    fit === "original" && s.fitOriginal,
    settings.optimizeContrast && s.optimizeContrast,
  ].filter(Boolean).join(" ");
  const fitIcon   =
    fit === "width"    ? <ArrowsLeftRight size={14} weight="light" /> :
    fit === "height"   ? <ArrowsVertical  size={14} weight="light" /> :
    fit === "screen"   ? <ArrowsIn        size={14} weight="light" /> :
                         <ArrowsOut       size={14} weight="light" />;
  const fitLabel  = { width: "Fit W", height: "Fit H", screen: "Fit Screen", original: "1:1" }[fit];
  const styleIcon = style === "single" ? <Square size={14} weight="light" /> : <Rows size={14} weight="light" />;

  const stripToRender: StripChapter[] = style === "longstrip"
    ? (autoNext && stripChapters.length > 0
        ? stripChapters
        : [{ chapterId: activeChapter?.id ?? 0, chapterName: activeChapter?.name ?? "", urls: pageUrls, startGlobalIdx: 0 }])
    : [];

  return (
    <div className={s.root} onMouseMove={(e) => {
      if (e.clientY < 60 || window.innerHeight - e.clientY < 60) showUi();
    }}>
      {/* ── Topbar ── */}
      <div className={[s.topbar, uiVisible ? "" : s.uiHidden].join(" ")}>
        <button className={s.iconBtn} onClick={closeReader} title="Close reader"><X size={15} weight="light" /></button>
        <button className={s.iconBtn} onClick={() => adjacent.prev && openReader(adjacent.prev, activeChapterList)} disabled={!adjacent.prev} title="Previous chapter">
          <CaretLeft size={14} weight="light" />
        </button>
        <span className={s.chLabel}>
          <span className={s.chTitle}>{activeManga?.title}</span>
          <span className={s.chSep}>/</span>
          <span>{displayChapter?.name}</span>
        </span>
        <span className={s.pageLabel}>{visibleChunkPage} / {visibleChunkLastPage || "…"}</span>
        <button className={s.iconBtn} onClick={() => adjacent.next && openReader(adjacent.next, activeChapterList)} disabled={!adjacent.next} title="Next chapter">
          <CaretRight size={14} weight="light" />
        </button>
        <div className={s.topSep} />
        <button className={s.modeBtn} onClick={cycleFit} title={`Fit mode: ${fitLabel}\nCtrl+scroll to zoom`}>
          {fitIcon}<span className={s.modeBtnLabel}>{fitLabel}</span>
        </button>
        <div className={s.zoomWrap}>
          <button className={s.zoomBtn} onClick={() => setZoomOpen((o) => !o)} title="Zoom">
            {Math.round((maxW / 900) * 100)}%
          </button>
          {zoomOpen && (
            <ZoomPopover value={maxW}
              onChange={(v) => updateSettings({ maxPageWidth: v })}
              onReset={() => updateSettings({ maxPageWidth: 900 })}
              onClose={() => setZoomOpen(false)} />
          )}
        </div>
        <button className={[s.modeBtn, rtl ? s.modeBtnActive : ""].join(" ")}
          onClick={() => updateSettings({ readingDirection: rtl ? "ltr" : "rtl" })} title={`Direction: ${rtl ? "RTL" : "LTR"}`}>
          <ArrowsLeftRight size={14} weight="light" /><span className={s.modeBtnLabel}>{rtl ? "RTL" : "LTR"}</span>
        </button>
        <button className={s.modeBtn} onClick={cycleStyle} title={`Layout: ${style}`}>
          {styleIcon}<span className={s.modeBtnLabel}>{style}</span>
        </button>
        {style !== "single" && (
          <button className={[s.modeBtn, settings.pageGap ? s.modeBtnActive : ""].join(" ")}
            onClick={() => updateSettings({ pageGap: !settings.pageGap })} title="Toggle page gap">
            <span className={s.modeBtnLabel}>Gap</span>
          </button>
        )}
        {style === "longstrip" && (
          <button className={[s.modeBtn, autoNext ? s.modeBtnActive : ""].join(" ")}
            onClick={() => updateSettings({ autoNextChapter: !autoNext })} title="Auto-advance to next chapter">
            <span className={s.modeBtnLabel}>Auto</span>
          </button>
        )}
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
        onWheel={(e) => { if (e.ctrlKey) e.preventDefault(); }}
        onKeyDown={(e) => {
          if (e.key === " " && style === "longstrip") {
            e.preventDefault();
            containerRef.current?.scrollBy({ top: containerRef.current.clientHeight * 0.85, behavior: "smooth" });
          }
        }}
      >
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircleNotch size={20} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
          </div>
        )}
        {error && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p className={s.errorMsg}>{error}</p>
          </div>
        )}
        {style === "longstrip" ? (
          <>
            {stripToRender.map((chunk) =>
              chunk.urls.map((url, i) => {
                const globalIdx = chunk.startGlobalIdx + i;
                return (
                  <img
                    key={`${chunk.chapterId}-${i}`}
                    src={url}
                    alt={`${chunk.chapterName} – Page ${i + 1}`}
                    data-page={globalIdx + 1}
                    data-chapter={chunk.chapterId}
                    className={[imgCls, settings.pageGap ? s.stripGap : ""].join(" ")}
                    loading={globalIdx < 3 ? "eager" : "lazy"}
                    decoding="async"
                    width={aspectCache.has(url) ? Math.round(aspectCache.get(url)! * 1000) : 720}
                    height={1000}
                  />
                );
              })
            )}
            {/* Entering viewport (or within 500px of it) triggers next-chapter fetch */}
            <div ref={sentinelRef} style={{ height: 1, flexShrink: 0, overflowAnchor: "none" }} />
          </>
        ) : (pageReady && (
          <img
            src={pageUrls[pageNumber - 1]}
            alt={`Page ${pageNumber}`}
            className={imgCls}
            decoding="async"
            style={{ transition: "opacity 0.1s ease" }}
          />
        ))}
      </div>

      {/* ── Bottom nav ── */}
      <div className={[s.bottombar, uiVisible ? "" : s.uiHidden].join(" ")}>
        <button className={s.navBtn} onClick={goPrev} disabled={loading || (pageNumber === 1 && !adjacent.prev)}>
          <ArrowLeft size={13} weight="light" />
        </button>
        <button className={s.navBtn} onClick={goNext} disabled={loading || (pageNumber === lastPage && !adjacent.next)}>
          <ArrowRight size={13} weight="light" />
        </button>
      </div>

      {dlOpen && activeChapter && (
        <DownloadModal chapter={activeChapter} remaining={adjacent.remaining} onClose={() => setDlOpen(false)} />
      )}
    </div>
  );
}