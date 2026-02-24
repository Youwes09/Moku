import { useEffect, useState, useMemo, useRef, memo } from "react";
import { ArrowRight, Compass, List, BookOpen, Star, Fire, BookmarkSimple, FolderSimplePlus, Folder } from "@phosphor-icons/react";
import GenreDrillPage from "./GenreDrillPage";
import { gql, thumbUrl } from "../../lib/client";
import { UPDATE_MANGA } from "../../lib/queries";
import { cache, CACHE_KEYS, getTopSources } from "../../lib/cache";
import { dedupeSources, dedupeMangaByTitle } from "../../lib/sourceUtils";
import ContextMenu, { type ContextMenuEntry } from "../context/ContextMenu";
import { GET_ALL_MANGA, GET_LIBRARY, GET_SOURCES, FETCH_SOURCE_MANGA } from "../../lib/queries";
import { useStore } from "../../store";
import type { Manga, Source } from "../../lib/types";
import SourceList from "../sources/SourceList";
import SourceBrowse from "../sources/SourceBrowse";
import s from "./Explore.module.css";

// ── Frecency score ────────────────────────────────────────────────────────────

function frecencyScore(readAt: number, count: number): number {
  const hoursSince = (Date.now() - readAt) / 3_600_000;
  return count / Math.log(hoursSince + 2);
}

// ── Ghost / Skeleton ──────────────────────────────────────────────────────────

function GhostCard() { return <div className={s.ghostCard} aria-hidden />; }
const GHOST_COUNT = 3;

function SkeletonRow({ count = 8 }: { count?: number }) {
  return (
    <div className={s.skeletonRow}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={s.cardSkeleton}>
          <div className={["skeleton", s.coverSkeleton].join(" ")} />
          <div className={["skeleton", s.titleSkeleton].join(" ")} />
        </div>
      ))}
    </div>
  );
}

// ── Cover image with fade-in ──────────────────────────────────────────────────

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

// ── Mini card ─────────────────────────────────────────────────────────────────

const MiniCard = memo(function MiniCard({
  manga, onClick, onContextMenu, subtitle, progress,
}: {
  manga: Manga;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  subtitle?: string;
  progress?: number;
}) {
  return (
    <button className={s.card} onClick={onClick} onContextMenu={onContextMenu}>
      <div className={s.coverWrap}>
        <CoverImg src={thumbUrl(manga.thumbnailUrl)} alt={manga.title} className={s.cover} />
        {manga.inLibrary && <span className={s.inLibraryBadge}>Saved</span>}
        {progress !== undefined && progress > 0 && (
          <div className={s.progressBar}>
            <div className={s.progressFill} style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <p className={s.title}>{manga.title}</p>
      {subtitle && <p className={s.subtitle}>{subtitle}</p>}
    </button>
  );
});

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title, icon, onSeeAll, loading, children,
}: {
  title: string; icon?: React.ReactNode; onSeeAll?: () => void;
  loading?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={s.section}>
      <div className={s.sectionHeader}>
        <span className={s.sectionTitle}>
          <span className={s.sectionTitleIcon}>{icon}{title}</span>
        </span>
        {onSeeAll && (
          <button className={s.seeAll} onClick={onSeeAll}>
            See all <ArrowRight size={11} weight="light" />
          </button>
        )}
      </div>
      {loading ? <SkeletonRow /> : children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ExploreMode = "explore" | "sources";

export default function Explore() {
  const [mode, setMode] = useState<ExploreMode>("explore");
  const activeSource = useStore((s) => s.activeSource);
  const genreFilter  = useStore((s) => s.genreFilter);

  if (activeSource) return <SourceBrowse />;
  if (genreFilter)  return <GenreDrillPage />;

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.heading}>Explore</h1>
          <div className={s.tabs}>
            <button
              className={[s.tab, mode === "explore" ? s.tabActive : ""].join(" ").trim()}
              onClick={() => setMode("explore")}
            >
              <Compass size={11} weight="bold" /> Explore
            </button>
            <button
              className={[s.tab, mode === "sources" ? s.tabActive : ""].join(" ").trim()}
              onClick={() => setMode("sources")}
            >
              <List size={11} weight="bold" /> Sources
            </button>
          </div>
        </div>
      </div>
      {/* Keep ExploreFeed always mounted so data survives tab switches */}
      <div style={{ display: mode === "explore" ? "contents" : "none" }}><ExploreFeed /></div>
      {mode === "sources" && <SourceList />}
    </div>
  );
}

// ── Explore feed ──────────────────────────────────────────────────────────────

const FOUNDATIONAL_GENRES = ["Action", "Romance", "Fantasy", "Adventure", "Comedy", "Drama"];

function ExploreFeed() {
  const [allManga, setAllManga]             = useState<Manga[]>([]);
  const [loadingLib, setLoadingLib]         = useState(true);
  const [popularManga, setPopularManga]     = useState<Manga[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [genreResults, setGenreResults]     = useState<Map<string, Manga[]>>(new Map());
  const [loadingGenres, setLoadingGenres]   = useState(false);
  const [sources, setSources]               = useState<Source[]>([]);
  const [loadError, setLoadError]           = useState(false);
  const [retryCount, setRetryCount]         = useState(0);
  const abortRef                            = useRef<AbortController | null>(null);
  const fetchedGenresRef                    = useRef<string>("");

  const history             = useStore((s) => s.history);
  const settings            = useStore((s) => s.settings);
  const setPreviewManga     = useStore((s) => s.setPreviewManga);
  const setGenreFilter      = useStore((s) => s.setGenreFilter);
  const folders             = useStore((s) => s.settings.folders);
  const addFolder           = useStore((s) => s.addFolder);
  const assignMangaToFolder = useStore((s) => s.assignMangaToFolder);
  const [ctx, setCtx]       = useState<{ x: number; y: number; manga: Manga } | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

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
          .then(() => { cache.clear(CACHE_KEYS.LIBRARY); })
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

  // ── Library + sources load (retries when suwayomi wasn't ready) ─────────────
  useEffect(() => {
    // If we already have data, no need to re-fetch (cache hit path)
    const alreadyLoaded = allManga.length > 0 && sources.length > 0;
    if (alreadyLoaded) return;

    setLoadingLib(true);
    setLoadingPopular(true);
    setLoadError(false);

    const preferredLang = settings.preferredExtensionLang || "en";

    // Clear stale failed cache entries so we actually retry
    if (retryCount > 0) {
      cache.clear(CACHE_KEYS.LIBRARY);
      cache.clear(CACHE_KEYS.SOURCES);
      fetchedGenresRef.current = "";
    }

    // Library — fire immediately, independent of sources
    cache.get(CACHE_KEYS.LIBRARY, () =>
      Promise.all([
        gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA),
        gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY),
      ]).then(([all, lib]) => {
        const libMap = new Map(lib.mangas.nodes.map((m) => [m.id, m]));
        return all.mangas.nodes.map((m) => libMap.get(m.id) ?? m);
      })
    ).then(setAllManga)
     .catch((e) => { console.error(e); setLoadError(true); })
     .finally(() => setLoadingLib(false));

    // Sources — then kick off popular AND genres simultaneously
    cache.get(CACHE_KEYS.SOURCES, () =>
      gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
        .then((d) => dedupeSources(d.sources.nodes, preferredLang))
    ).then((allSources) => {
      if (allSources.length === 0) { setLoadingPopular(false); setLoadError(true); return; }

      // Cap to 2 sources for the explore feed — halves the network calls
      const topSources = getTopSources(allSources).slice(0, 2);
      setSources(allSources);

      // ── Popular — don't block genres ──────────────────────────────────
      cache.get(CACHE_KEYS.POPULAR, () =>
        Promise.allSettled(
          topSources.map((src) =>
            gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
              source: src.id, type: "POPULAR", page: 1, query: null,
            }).then((d) => d.fetchSourceManga.mangas)
          )
        ).then((results) => {
          const merged: Manga[] = [];
          for (const r of results)
            if (r.status === "fulfilled") merged.push(...r.value);
          return dedupeMangaByTitle(merged).slice(0, 30);
        })
      ).then(setPopularManga).catch(console.error).finally(() => setLoadingPopular(false));

      // ── Genres — start immediately alongside popular using foundational
      // genres as a starting point; personalized genres replace these once
      // library loads. Results stream in as each genre resolves.
      const genresToFetch = FOUNDATIONAL_GENRES.slice(0, 3);
      const genreKey = genresToFetch.join(",");
      if (fetchedGenresRef.current === genreKey) return;
      fetchedGenresRef.current = genreKey;

      setLoadingGenres(true);
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const streamingMap = new Map<string, Manga[]>();
      Promise.allSettled(
        genresToFetch.map((genre) =>
          cache.get(CACHE_KEYS.GENRE(genre), () =>
            Promise.allSettled(
              topSources.map((src) =>
                gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
                  source: src.id, type: "SEARCH", page: 1, query: genre,
                }, ctrl.signal).then((d) => d.fetchSourceManga.mangas)
              )
            ).then((results) => {
              const merged: Manga[] = [];
              for (const r of results)
                if (r.status === "fulfilled") merged.push(...r.value);
              return dedupeMangaByTitle(merged).slice(0, 24);
            })
          ).then((mangas) => {
            if (ctrl.signal.aborted) return;
            // Stream: each genre paints immediately as it resolves
            streamingMap.set(genre, mangas);
            setGenreResults(new Map(streamingMap));
          })
        )
      )
      .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingGenres(false); });
    })
      .catch((e) => { console.error(e); setLoadError(true); setLoadingPopular(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  // ── Frecency genres (derived from history + library) ──────────────────────
  const frecencyGenres = useMemo(() => {
    const mangaScores = new Map<number, number>();
    const mangaReadAt = new Map<number, number>();
    for (const entry of history) {
      mangaScores.set(entry.mangaId, (mangaScores.get(entry.mangaId) ?? 0) + 1);
      if (entry.readAt > (mangaReadAt.get(entry.mangaId) ?? 0))
        mangaReadAt.set(entry.mangaId, entry.readAt);
    }
    const genreWeights = new Map<string, number>();
    const mangaMap = new Map(allManga.map((m) => [m.id, m]));
    for (const [mangaId, count] of mangaScores.entries()) {
      const score = frecencyScore(mangaReadAt.get(mangaId) ?? 0, count);
      for (const genre of mangaMap.get(mangaId)?.genre ?? [])
        genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + score);
    }
    if (genreWeights.size === 0)
      allManga.filter((m) => m.inLibrary).forEach((m) =>
        (m.genre ?? []).forEach((g) => genreWeights.set(g, (genreWeights.get(g) ?? 0) + 1)));
    if (genreWeights.size === 0) return FOUNDATIONAL_GENRES.slice(0, 3);
    return Array.from(genreWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);
  }, [allManga, history]);

  // ── Re-fetch only when personalized genres differ from what's cached ───────
  useEffect(() => {
    if (frecencyGenres.length === 0 || sources.length === 0) return;

    const genreKey = frecencyGenres.join(",");
    if (fetchedGenresRef.current === genreKey) return; // already fetched, cache hit
    fetchedGenresRef.current = genreKey;

    setLoadingGenres(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const topSources = getTopSources(sources).slice(0, 2);
    const streamingMap = new Map<string, Manga[]>();

    Promise.allSettled(
      frecencyGenres.map((genre) =>
        cache.get(CACHE_KEYS.GENRE(genre), () =>
          Promise.allSettled(
            topSources.map((src) =>
              gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
                source: src.id, type: "SEARCH", page: 1, query: genre,
              }, ctrl.signal).then((d) => d.fetchSourceManga.mangas)
            )
          ).then((results) => {
            const merged: Manga[] = [];
            for (const r of results)
              if (r.status === "fulfilled") merged.push(...r.value);
            return dedupeMangaByTitle(merged).slice(0, 24);
          })
        ).then((mangas) => {
          if (ctrl.signal.aborted) return;
          streamingMap.set(genre, mangas);
          setGenreResults(new Map(streamingMap));
        })
      )
    )
    .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
    .finally(() => { if (!ctrl.signal.aborted) setLoadingGenres(false); });
  }, [frecencyGenres, sources]);

  function openManga(m: Manga) { setPreviewManga(m); }

  // ── Continue reading ──────────────────────────────────────────────────────
  const continueReading = useMemo(() => {
    const mangaMap = new Map(allManga.map((m) => [m.id, m]));
    const seen = new Set<number>();
    const result: { manga: Manga; chapterName: string; progress: number }[] = [];
    for (const entry of history) {
      if (seen.has(entry.mangaId)) continue;
      seen.add(entry.mangaId);
      const manga = mangaMap.get(entry.mangaId);
      if (!manga) continue;
      result.push({ manga, chapterName: entry.chapterName, progress: entry.pageNumber > 0 ? Math.min(entry.pageNumber / 20, 1) : 0 });
      if (result.length >= 12) break;
    }
    return result;
  }, [history, allManga]);

  // ── Recommended ───────────────────────────────────────────────────────────
  const recommended = useMemo(() => {
    if (allManga.length === 0 || frecencyGenres.length === 0) return [];
    const continueIds = new Set(continueReading.map((r) => r.manga.id));
    return allManga
      .filter((m) => m.inLibrary && !continueIds.has(m.id) &&
        frecencyGenres.some((g) => (m.genre ?? []).includes(g)))
      .slice(0, 20);
  }, [allManga, frecencyGenres, continueReading]);

  const genresLoading = loadingGenres;

  return (
    <div className={s.body}>

      {(continueReading.length > 0 || loadingLib) && (
        <Section title="Continue Reading" icon={<BookOpen size={11} weight="bold" />} loading={loadingLib}>
          <div className={s.row}>
            {continueReading.map(({ manga, chapterName, progress }) => (
              <MiniCard key={manga.id} manga={manga} onClick={() => openManga(manga)}
                onContextMenu={(e) => openCtx(e, manga)} subtitle={chapterName} progress={progress} />
            ))}
            {Array.from({ length: GHOST_COUNT }).map((_, i) => <GhostCard key={`ghost-cr-${i}`} />)}
          </div>
        </Section>
      )}

      {(recommended.length > 0 || loadingLib) && (
        <Section title="Recommended for You" icon={<Star size={11} weight="bold" />} loading={loadingLib}>
          <div className={s.row}>
            {recommended.map((m) => (
              <MiniCard key={m.id} manga={m} onClick={() => openManga(m)} onContextMenu={(e) => openCtx(e, m)} />
            ))}
            {Array.from({ length: GHOST_COUNT }).map((_, i) => <GhostCard key={`ghost-rec-${i}`} />)}
          </div>
        </Section>
      )}

      {(popularManga.length > 0 || loadingPopular) && (
        <Section
          title={sources.length === 1 ? `Popular on ${sources[0].displayName}` : sources.length > 1 ? `Popular across ${sources.length} sources` : "Popular"}
          icon={<Fire size={11} weight="bold" />}
          loading={loadingPopular}
        >
          {sources.length === 0 ? (
            <div className={s.noSource}>No sources installed. Add extensions first.</div>
          ) : (
            <div className={s.row}>
              {popularManga.map((m) => (
                <MiniCard key={m.id} manga={m} onClick={() => openManga(m)} onContextMenu={(e) => openCtx(e, m)} />
              ))}
              {Array.from({ length: GHOST_COUNT }).map((_, i) => <GhostCard key={`ghost-pop-${i}`} />)}
            </div>
          )}
        </Section>
      )}

      {frecencyGenres.map((genre) => {
        const items = genreResults.get(genre) ?? [];
        const isLoading = genresLoading && items.length === 0;
        if (!isLoading && items.length === 0) return null;
        return (
          <Section key={genre} title={genre} onSeeAll={() => setGenreFilter(genre)} loading={isLoading}>
            <div className={s.row}>
              {items.map((m) => (
                <MiniCard key={m.id} manga={m} onClick={() => openManga(m)} onContextMenu={(e) => openCtx(e, m)} />
              ))}
              {Array.from({ length: GHOST_COUNT }).map((_, i) => <GhostCard key={`ghost-${genre}-${i}`} />)}
            </div>
          </Section>
        );
      })}

      {!loadingLib && !loadingPopular && !loadingGenres &&
        continueReading.length === 0 && recommended.length === 0 &&
        popularManga.length === 0 && frecencyGenres.every((g) => !genreResults.get(g)?.length) && (
        <div className={s.empty}>
          {loadError ? (
            <>
              <span>Could not reach Suwayomi</span>
              <span className={s.emptyHint}>Make sure the server is running, then try again.</span>
              <button
                style={{ marginTop: "var(--sp-3)", padding: "6px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-dim)", background: "var(--bg-raised)", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-wide)" }}
                onClick={() => { setLoadingLib(true); setLoadingPopular(true); setRetryCount((c) => c + 1); }}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <span>Nothing to explore yet</span>
              <span className={s.emptyHint}>Add manga to your library or install sources to get started.</span>
            </>
          )}
        </div>
      )}

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.manga)} onClose={() => setCtx(null)} />
      )}
    </div>
  );
}