import { useEffect, useState, useMemo, useRef, memo, useCallback } from "react";
import { ArrowLeft, BookmarkSimple, FolderSimplePlus, Folder, CircleNotch } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_ALL_MANGA, GET_LIBRARY, GET_SOURCES, FETCH_SOURCE_MANGA, UPDATE_MANGA } from "../../lib/queries";
import { cache, CACHE_KEYS } from "../../lib/cache";
import { dedupeSources, dedupeMangaById } from "../../lib/sourceUtils";
import { useStore } from "../../store";
import ContextMenu, { type ContextMenuEntry } from "../context/ContextMenu";
import type { Manga, Source } from "../../lib/types";
import s from "./GenreDrillPage.module.css";

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_SIZE         = 50;   // how many items to show at once
const INITIAL_PAGES     = 3;    // source API pages to fetch upfront per source
const MAX_SOURCES       = 12;   // max sources to query concurrently
const CONCURRENCY       = 4;    // parallel source fetches

async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      if (signal.aborted) return;
      const item = items[i++];
      await fn(item).catch(() => {});
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

// ── CoverImg ──────────────────────────────────────────────────────────────────
const CoverImg = memo(function CoverImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src} alt={alt} className={className}
      loading="lazy" decoding="async"
      onLoad={() => setLoaded(true)}
      style={{ opacity: loaded ? 1 : 0, transition: loaded ? "opacity 0.15s ease" : "none" }}
    />
  );
});

// ── GenreDrillPage ────────────────────────────────────────────────────────────
export default function GenreDrillPage() {
  const genre               = useStore((st) => st.genreFilter);
  const setGenreFilter      = useStore((st) => st.setGenreFilter);
  const setPreviewManga     = useStore((st) => st.setPreviewManga);
  const settings            = useStore((st) => st.settings);
  const folders             = useStore((st) => st.settings.folders);
  const addFolder           = useStore((st) => st.addFolder);
  const assignMangaToFolder = useStore((st) => st.assignMangaToFolder);

  const [libraryManga, setLibraryManga]     = useState<Manga[]>([]);
  const [sourceManga, setSourceManga]       = useState<Manga[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore]       = useState(false);
  const [visibleCount, setVisibleCount]     = useState(PAGE_SIZE);
  const [ctx, setCtx] = useState<{ x: number; y: number; manga: Manga } | null>(null);

  // Per-source next-page tracker; -1 means exhausted
  const nextPageRef  = useRef<Map<string, number>>(new Map());
  const sourcesRef   = useRef<Source[]>([]);
  const abortRef     = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!genre) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoadingInitial(true);
    setSourceManga([]);
    setLibraryManga([]);
    setVisibleCount(PAGE_SIZE);
    nextPageRef.current = new Map();

    const preferredLang = settings.preferredExtensionLang || "en";

    // ── Library (fire-and-forget, doesn't block skeleton removal) ─────────
    cache.get(CACHE_KEYS.LIBRARY, () =>
      Promise.all([
        gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA),
        gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY),
      ]).then(([all, lib]) => {
        const libMap = new Map(lib.mangas.nodes.map((m) => [m.id, m]));
        return all.mangas.nodes.map((m) => libMap.get(m.id) ?? m);
      })
    )
    .then((manga) => { if (!ctrl.signal.aborted) setLibraryManga(manga); })
    .catch((e) => { if (e?.name !== "AbortError") console.error(e); });

    // ── Sources: stream results in as each source responds ────────────────
    cache.get(CACHE_KEYS.SOURCES, () =>
      gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
        .then((d) => dedupeSources(d.sources.nodes.filter((s) => s.id !== "0"), preferredLang))
    ).then(async (allSources) => {
      const sources = allSources.slice(0, MAX_SOURCES);
      sourcesRef.current = sources;
      // Start all sources at -1 (unknown/exhausted); the fetch loop will set the correct next page
      for (const src of sources) nextPageRef.current.set(src.id, -1);

      await runConcurrent(sources, async (src) => {
        if (ctrl.signal.aborted) return;
        const pageItems: Manga[] = [];
        for (let page = 1; page <= INITIAL_PAGES; page++) {
          if (ctrl.signal.aborted) return;
          try {
            const d = await gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
              FETCH_SOURCE_MANGA,
              { source: src.id, type: "SEARCH", page, query: genre },
              ctrl.signal,
            );
            pageItems.push(...d.fetchSourceManga.mangas);
            if (!d.fetchSourceManga.hasNextPage) {
              nextPageRef.current.set(src.id, -1);
              break;
            } else if (page === INITIAL_PAGES) {
              // Has more pages beyond what we fetched upfront — mark for "load more"
              nextPageRef.current.set(src.id, INITIAL_PAGES + 1);
            }
          } catch (e: any) {
            if (e?.name === "AbortError") return;
            nextPageRef.current.set(src.id, -1);
            break;
          }
        }
        if (!ctrl.signal.aborted && pageItems.length > 0) {
          // Dedupe by ID only — title dedup across sources is too aggressive and collapses
          // legitimate different-source results that share a common title (e.g. "Action" genre)
          setSourceManga((prev) => dedupeMangaById([...prev, ...pageItems]));
          // Drop the skeleton as soon as we have anything
          setLoadingInitial(false);
        }
      }, ctrl.signal);

      if (!ctrl.signal.aborted) setLoadingInitial(false);
    }).catch((e) => {
      if (e?.name !== "AbortError") console.error(e);
      if (!ctrl.signal.aborted) setLoadingInitial(false);
    });

    return () => { ctrl.abort(); };
  }, [genre]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived merged list ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const libMatches = libraryManga.filter((m) => (m.genre ?? []).includes(genre));
    const libIds = new Set(libMatches.map((m) => m.id));
    const srcAll = sourceManga.filter((m) => !libIds.has(m.id));
    return dedupeMangaById([...libMatches, ...srcAll]);
  }, [libraryManga, sourceManga, genre]);

  // ── Load more ──────────────────────────────────────────────────────────────
  const hasMoreVisible  = visibleCount < filtered.length;
  const hasMoreNetwork  = sourcesRef.current.some((src) => (nextPageRef.current.get(src.id) ?? -1) > 0);
  const hasMore         = hasMoreVisible || hasMoreNetwork;

  const loadMore = useCallback(async () => {
    if (loadingMore) return;

    // If there are buffered results, just reveal the next page
    if (hasMoreVisible) {
      setVisibleCount((v) => v + PAGE_SIZE);
      return;
    }

    // Fetch next pages from network
    const sources = sourcesRef.current.filter(
      (src) => (nextPageRef.current.get(src.id) ?? -1) > 0
    );
    if (!sources.length) return;

    setLoadingMore(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await runConcurrent(sources, async (src) => {
        const page = nextPageRef.current.get(src.id)!;
        if (ctrl.signal.aborted) return;
        try {
          const d = await gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
            FETCH_SOURCE_MANGA,
            { source: src.id, type: "SEARCH", page, query: genre },
            ctrl.signal,
          );
          nextPageRef.current.set(src.id, d.fetchSourceManga.hasNextPage ? page + 1 : -1);
          if (!ctrl.signal.aborted && d.fetchSourceManga.mangas.length > 0)
            setSourceManga((prev) => dedupeMangaById([...prev, ...d.fetchSourceManga.mangas]));
        } catch (e: any) {
          if (e?.name !== "AbortError") nextPageRef.current.set(src.id, -1);
        }
      }, ctrl.signal);
    } finally {
      if (!ctrl.signal.aborted) {
        setVisibleCount((v) => v + PAGE_SIZE);
        setLoadingMore(false);
      }
    }
  }, [loadingMore, hasMoreVisible, genre]);

  // ── Context menu ──────────────────────────────────────────────────────────
  function openCtx(e: React.MouseEvent, m: Manga) {
    e.preventDefault(); e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, manga: m });
  }

  function buildCtxItems(m: Manga): ContextMenuEntry[] {
    return [
      {
        label: m.inLibrary ? "In Library" : "Add to library",
        icon: <BookmarkSimple size={13} weight={m.inLibrary ? "fill" : "light"} />,
        disabled: m.inLibrary,
        onClick: () => gql(UPDATE_MANGA, { id: m.id, inLibrary: true })
          .then(() => {
            setSourceManga((prev) => prev.map((x) => x.id === m.id ? { ...x, inLibrary: true } : x));
            cache.clear(CACHE_KEYS.LIBRARY);
          })
          .catch(console.error),
      },
      ...(folders.length > 0 ? [
        { separator: true } as ContextMenuEntry,
        ...folders.map((f): ContextMenuEntry => ({
          label: f.mangaIds.includes(m.id) ? `✓ ${f.name}` : f.name,
          icon: <Folder size={13} weight={f.mangaIds.includes(m.id) ? "fill" : "light"} />,
          onClick: () => assignMangaToFolder(f.id, m.id),
        })),
      ] : []),
      { separator: true },
      {
        label: "New folder & add",
        icon: <FolderSimplePlus size={13} weight="light" />,
        onClick: () => {
          const name = prompt("Folder name:");
          if (name?.trim()) { const id = addFolder(name.trim()); assignMangaToFolder(id, m.id); }
        },
      },
    ];
  }

  const visibleItems = filtered.slice(0, visibleCount);

  return (
    <div className={s.root}>
      <div className={s.header}>
        <button className={s.back} onClick={() => setGenreFilter("")}>
          <ArrowLeft size={13} weight="light" />
          <span>Back</span>
        </button>
        <span className={s.title}>{genre}</span>
        {loadingInitial && filtered.length === 0 ? null : (
          <span className={s.resultCount}>
            {visibleItems.length}{filtered.length > visibleCount ? "+" : ""} of {filtered.length}
          </span>
        )}
        {!loadingInitial && hasMoreNetwork && (
          <span className={s.loadingHint}>More loading…</span>
        )}
      </div>

      {loadingInitial && filtered.length === 0 ? (
        <div className={s.grid}>
          {Array.from({ length: 50 }).map((_, i) => (
            <div key={i} className={s.cardSkeleton}>
              <div className={["skeleton", s.coverSkeleton].join(" ")} />
              <div className={["skeleton", s.titleSkeleton].join(" ")} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>No manga found for "{genre}".</div>
      ) : (
        <div className={s.grid}>
          {visibleItems.map((m) => (
            <button key={m.id} className={s.card} onClick={() => setPreviewManga(m)} onContextMenu={(e) => openCtx(e, m)}>
              <div className={s.coverWrap}>
                <CoverImg src={thumbUrl(m.thumbnailUrl)} alt={m.title} className={s.cover} />
                {m.inLibrary && <span className={s.inLibraryBadge}>Saved</span>}
              </div>
              <p className={s.cardTitle}>{m.title}</p>
            </button>
          ))}
          {hasMore && (
            <div className={s.showMoreCell}>
              <button className={s.showMoreBtn} onClick={loadMore} disabled={loadingMore}>
                {loadingMore
                  ? <><CircleNotch size={13} weight="light" className="anim-spin" style={{ display:"inline-block" }} /> Loading…</>
                  : `Show more`}
              </button>
            </div>
          )}
        </div>
      )}

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.manga)} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}