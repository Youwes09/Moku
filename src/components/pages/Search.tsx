import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import {
  MagnifyingGlass, CircleNotch, SlidersHorizontal, Hash, List, Globe,
} from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_SOURCES, FETCH_SOURCE_MANGA } from "../../lib/queries";
import { cache, CACHE_KEYS, getPageSet } from "../../lib/cache";
import { dedupeSources, dedupeMangaById } from "../../lib/sourceUtils";
import { useStore } from "../../store";
import type { Manga, Source } from "../../lib/types";
import s from "./Search.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchTab = "keyword" | "tag" | "source";
type TagMode   = "AND" | "OR";

interface SourceResult {
  source: Source;
  mangas: Manga[];
  loading: boolean;
  error:   string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONCURRENCY        = 4;
const RESULTS_PER_SOURCE = 8;
const TAG_PAGE_SIZE      = 48;
const MAX_TAG_SOURCES    = 10; // sources queried when "Search sources" is toggled on

const COMMON_GENRES = [
  "Action","Adventure","Comedy","Drama","Fantasy","Romance",
  "Sci-Fi","Slice of Life","Horror","Mystery","Thriller","Sports",
  "Supernatural","Mecha","Historical","Psychological","School Life",
  "Shounen","Seinen","Josei","Shoujo","Isekai","Martial Arts",
  "Magic","Music","Cooking","Medical","Military","Harem","Ecchi",
];

// ── Shared helpers ────────────────────────────────────────────────────────────

async function runConcurrent<T>(
  items: T[],
  fn:    (item: T) => Promise<void>,
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

/** Keep only manga whose genre array includes every tag (case-insensitive). */
function matchesAllTags(m: Manga, tags: string[]): boolean {
  const genres = (m.genre ?? []).map((g) => g.toLowerCase());
  return tags.every((t) => genres.includes(t.toLowerCase()));
}

// ── Shared card components ────────────────────────────────────────────────────

const CoverImg = memo(function CoverImg({
  src, alt, className,
}: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img src={src} alt={alt} className={className}
      loading="lazy" decoding="async" onLoad={() => setLoaded(true)}
      style={{ opacity: loaded ? 1 : 0, transition: loaded ? "opacity 0.15s ease" : "none" }}
    />
  );
});

function MangaCard({ manga, onClick }: { manga: Manga; onClick: () => void }) {
  return (
    <button className={s.card} onClick={onClick}>
      <div className={s.coverWrap}>
        <CoverImg src={thumbUrl(manga.thumbnailUrl)} alt={manga.title} className={s.cover} />
        {manga.inLibrary && <span className={s.inLibBadge}>Saved</span>}
      </div>
      <p className={s.cardTitle}>{manga.title}</p>
    </button>
  );
}

function GridSkeleton({ count = 18 }: { count?: number }) {
  return (
    <div className={s.tagGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={s.skCard} style={{ width: "auto" }}>
          <div className={["skeleton", s.skCover].join(" ")} style={{ aspectRatio: "2/3", width: "100%" }} />
          <div className={["skeleton", s.skTitle].join(" ")} />
        </div>
      ))}
    </div>
  );
}

function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={s.sourceRow}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={s.skCard}>
          <div className={["skeleton", s.skCover].join(" ")} />
          <div className={["skeleton", s.skTitle].join(" ")} />
        </div>
      ))}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Search() {
  const [tab, setTab] = useState<SearchTab>("keyword");

  const preferredLang    = useStore((st) => st.settings.preferredExtensionLang);
  const searchPrefill    = useStore((st) => st.searchPrefill ?? "");
  const setSearchPrefill = useStore((st) => st.setSearchPrefill);
  const setPreviewManga  = useStore((st) => st.setPreviewManga);

  const [allSources, setAllSources]         = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const pendingPrefill = useRef<string>("");

  // Consume searchPrefill → route to keyword tab
  useEffect(() => {
    if (!searchPrefill) return;
    pendingPrefill.current = searchPrefill;
    setTab("keyword");
    setSearchPrefill("");
  }, [searchPrefill, setSearchPrefill]);

  // Load sources once, shared across all tabs
  useEffect(() => {
    setLoadingSources(true);
    cache.get(CACHE_KEYS.SOURCES, () =>
      gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
        .then((d) => d.sources.nodes.filter((src) => src.id !== "0")),
      Infinity, // source list is stable within a session
    )
      .then(setAllSources)
      .catch(console.error)
      .finally(() => setLoadingSources(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableLangs   = useMemo(() =>
    Array.from(new Set<string>(allSources.map((s) => s.lang))).sort(), [allSources]);
  const hasMultipleLangs = availableLangs.length > 1;

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h1 className={s.heading}>Search</h1>
        <div className={s.tabs}>
          <button className={[s.tab, tab === "keyword" ? s.tabActive : ""].join(" ")} onClick={() => setTab("keyword")}>
            <MagnifyingGlass size={11} weight="bold" /> Keyword
          </button>
          <button className={[s.tab, tab === "tag" ? s.tabActive : ""].join(" ")} onClick={() => setTab("tag")}>
            <Hash size={11} weight="bold" /> Tags
          </button>
          <button className={[s.tab, tab === "source" ? s.tabActive : ""].join(" ")} onClick={() => setTab("source")}>
            <List size={11} weight="bold" /> Sources
          </button>
        </div>
      </div>

      {tab === "keyword" && (
        <KeywordTab
          allSources={allSources}
          loadingSources={loadingSources}
          availableLangs={availableLangs}
          hasMultipleLangs={hasMultipleLangs}
          preferredLang={preferredLang}
          pendingPrefill={pendingPrefill}
          onMangaClick={setPreviewManga}
        />
      )}
      {tab === "tag" && (
        <TagTab
          allSources={allSources}
          loadingSources={loadingSources}
          preferredLang={preferredLang}
          onMangaClick={setPreviewManga}
        />
      )}
      {tab === "source" && (
        <SourceTab
          allSources={allSources}
          loadingSources={loadingSources}
          availableLangs={availableLangs}
          hasMultipleLangs={hasMultipleLangs}
          onMangaClick={setPreviewManga}
        />
      )}
    </div>
  );
}

// ── Keyword tab ───────────────────────────────────────────────────────────────
// Unchanged from v1.

function KeywordTab({
  allSources, loadingSources, availableLangs, hasMultipleLangs,
  preferredLang, pendingPrefill, onMangaClick,
}: {
  allSources:      Source[];
  loadingSources:  boolean;
  availableLangs:  string[];
  hasMultipleLangs: boolean;
  preferredLang:   string;
  pendingPrefill:  React.MutableRefObject<string>;
  onMangaClick:    (m: Manga) => void;
}) {
  const [query, setQuery]               = useState("");
  const [submitted, setSubmitted]       = useState("");
  const [results, setResults]           = useState<SourceResult[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());
  const [includeNsfw, setIncludeNsfw]   = useState(false);

  const abortRef         = useRef<AbortController | null>(null);
  const inputRef         = useRef<HTMLInputElement>(null);
  const allSourcesRef    = useRef<Source[]>([]);
  const selectedLangsRef = useRef<Set<string>>(new Set());

  useEffect(() => { allSourcesRef.current = allSources; }, [allSources]);
  useEffect(() => { selectedLangsRef.current = selectedLangs; }, [selectedLangs]);

  // Set default lang selection once sources load
  useEffect(() => {
    if (!allSources.length) return;
    const available = new Set(allSources.map((s) => s.lang));
    setSelectedLangs(available.has(preferredLang)
      ? new Set([preferredLang])
      : new Set(availableLangs.slice(0, 1))
    );
  }, [allSources]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consume prefill once sources are ready
  useEffect(() => {
    if (loadingSources || !pendingPrefill.current || submitted) return;
    if (!allSourcesRef.current.length) return;
    const q = pendingPrefill.current;
    pendingPrefill.current = "";
    setQuery(q);
    doSearch(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSources]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const getVisibleSources = useCallback((): Source[] => {
    let filtered = allSourcesRef.current;
    if (selectedLangsRef.current.size > 0)
      filtered = filtered.filter((s) => selectedLangsRef.current.has(s.lang));
    if (!includeNsfw)
      filtered = filtered.filter((s) => !s.isNsfw);
    return filtered;
  }, [includeNsfw]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const visible = getVisibleSources();
    if (!visible.length) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setSubmitted(trimmed);
    setResults(visible.map((src) => ({ source: src, mangas: [], loading: true, error: null })));

    await runConcurrent(visible, async (src) => {
      if (ctrl.signal.aborted) return;
      try {
        const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(
          FETCH_SOURCE_MANGA,
          { source: src.id, type: "SEARCH", page: 1, query: trimmed },
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        setResults((prev) => prev.map((r) =>
          r.source.id === src.id ? { ...r, mangas: d.fetchSourceManga.mangas, loading: false } : r
        ));
      } catch (e: any) {
        if (ctrl.signal.aborted || e?.name === "AbortError") return;
        setResults((prev) => prev.map((r) =>
          r.source.id === src.id ? { ...r, loading: false, error: e.message } : r
        ));
      }
    }, ctrl.signal);
  }, [getVisibleSources]);

  function toggleLang(lang: string) {
    setSelectedLangs((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) { if (next.size === 1) return prev; next.delete(lang); }
      else next.add(lang);
      return next;
    });
  }

  const visibleCount = getVisibleSources().length;
  const hasResults   = results.some((r) => r.mangas.length > 0);
  const allDone      = results.every((r) => !r.loading);

  return (
    <>
      <div className={s.keywordBar}>
        <div className={s.searchBar}>
          <MagnifyingGlass size={14} className={s.searchIcon} weight="light" />
          <input
            ref={inputRef} autoFocus
            className={s.searchInput}
            placeholder="Search across sources…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
          />
          {hasMultipleLangs && (
            <button
              className={[s.advancedBtn, showAdvanced ? s.advancedBtnActive : ""].join(" ")}
              onClick={() => setShowAdvanced((v) => !v)}
              title="Language & filter options"
            >
              <SlidersHorizontal size={13} weight="light" />
            </button>
          )}
          <button
            className={s.searchBtn}
            onClick={() => doSearch(query)}
            disabled={!query.trim() || loadingSources}
          >
            {loadingSources
              ? <CircleNotch size={13} weight="light" className="anim-spin" />
              : "Search"}
          </button>
        </div>

        {hasMultipleLangs && showAdvanced && (
          <div className={s.advancedPanel}>
            <div className={s.advancedHeader}>
              <span className={s.advancedTitle}>Languages</span>
              <div className={s.advancedActions}>
                <button className={s.advancedLink} onClick={() => setSelectedLangs(new Set(availableLangs))}>All</button>
                <button className={s.advancedLink} onClick={() => setSelectedLangs(new Set([preferredLang]))}>Reset</button>
              </div>
            </div>
            <div className={s.langGrid}>
              {availableLangs.map((lang) => (
                <button key={lang}
                  className={[s.langChip, selectedLangs.has(lang) ? s.langChipActive : ""].join(" ")}
                  onClick={() => toggleLang(lang)}
                >
                  {lang === preferredLang ? `${lang.toUpperCase()} ★` : lang.toUpperCase()}
                </button>
              ))}
            </div>
            <div className={s.advancedDivider} />
            <label className={s.advancedCheck}>
              <input type="checkbox" checked={includeNsfw}
                onChange={(e) => setIncludeNsfw(e.target.checked)} className={s.checkbox} />
              Include NSFW sources
            </label>
            <div className={s.advancedFooter}>
              Searching <strong>{visibleCount}</strong> source{visibleCount !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>

      {!submitted && (
        <div className={s.empty}>
          <MagnifyingGlass size={36} weight="light" className={s.emptyIcon} />
          <p className={s.emptyText}>Search across sources</p>
          <p className={s.emptyHint}>
            {hasMultipleLangs
              ? `${visibleCount} source${visibleCount !== 1 ? "s" : ""} · ${selectedLangs.size} language${selectedLangs.size !== 1 ? "s" : ""}`
              : `${visibleCount} source${visibleCount !== 1 ? "s" : ""}`}
          </p>
          {hasMultipleLangs && !showAdvanced && (
            <button className={s.advancedLinkStandalone} onClick={() => setShowAdvanced(true)}>
              <SlidersHorizontal size={12} weight="light" /> Adjust language filters
            </button>
          )}
        </div>
      )}

      {submitted && (
        <div className={s.results}>
          {results.length === 0 && (
            <div className={s.empty}>
              <CircleNotch size={20} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
            </div>
          )}
          {results
            .filter((r) => r.mangas.length > 0 || r.loading || r.error)
            .map(({ source, mangas, loading, error }) => (
              <div key={source.id} className={s.sourceSection}>
                <div className={s.sourceHeader}>
                  <img src={thumbUrl(source.iconUrl)} alt={source.displayName} className={s.sourceIcon}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className={s.sourceName}>{source.displayName}</span>
                  {hasMultipleLangs && <span className={s.sourceLang}>{source.lang.toUpperCase()}</span>}
                  {loading && <CircleNotch size={12} weight="light" className="anim-spin" style={{ color: "var(--text-faint)", marginLeft: "auto" }} />}
                  {!loading && mangas.length > 0 && <span className={s.resultCount}>{mangas.length} results</span>}
                </div>
                {error ? (
                  <p className={s.sourceError}>{error}</p>
                ) : loading ? (
                  <RowSkeleton />
                ) : mangas.length > 0 ? (
                  <div className={s.sourceRow}>
                    {mangas.slice(0, RESULTS_PER_SOURCE).map((m) => (
                      <MangaCard key={m.id} manga={m} onClick={() => onMangaClick(m)} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          {allDone && !hasResults && (
            <div className={s.empty}>
              <p className={s.emptyText}>No results for "{submitted}"</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Tag tab ───────────────────────────────────────────────────────────────────
//
// Two data sources, selectable independently:
//
// 1. Local DB (always on) — instant MangaFilterInput query with AND/OR support.
//    "Show more" uses GraphQL offset pagination.
//
// 2. Source search (opt-in via "Search sources" toggle) — fires FETCH_SOURCE_MANGA
//    across the top sources, using getPageSet() + cache.get(sourceMangaPage) so
//    results survive navigation and "Show more" fetches the next cached page before
//    hitting the network.
//    For multi-tag AND: sends the first tag as the source query string (sources only
//    support one term) and client-filters the results by the remaining tags.

const MANGAS_BY_GENRE = `
  query MangasByGenre($filter: MangaFilterInput, $first: Int, $offset: Int) {
    mangas(filter: $filter, first: $first, offset: $offset, orderBy: IN_LIBRARY_AT, orderByType: DESC) {
      nodes {
        id title thumbnailUrl inLibrary genre status
        source { id displayName }
      }
      pageInfo { hasNextPage }
      totalCount
    }
  }
`;

function buildGenreFilter(tags: string[], mode: TagMode): Record<string, unknown> {
  if (tags.length === 0) return {};
  if (mode === "AND") return { and: tags.map((t) => ({ genre: { includesInsensitive: t } })) };
  return { or: tags.map((t) => ({ genre: { includesInsensitive: t } })) };
}

function TagTab({
  allSources,
  loadingSources,
  preferredLang,
  onMangaClick,
}: {
  allSources:     Source[];
  loadingSources: boolean;
  preferredLang:  string;
  onMangaClick:   (m: Manga) => void;
}) {
  const [activeTags, setActiveTags]   = useState<string[]>([]);
  const [tagMode, setTagMode]         = useState<TagMode>("AND");
  const [tagFilter, setTagFilter]     = useState("");

  // ── Local DB state ────────────────────────────────────────────────────────
  const [localResults, setLocalResults]         = useState<Manga[]>([]);
  const [totalCount, setTotalCount]             = useState(0);
  const [loadingLocal, setLoadingLocal]         = useState(false);
  const [loadingMoreLocal, setLoadingMoreLocal] = useState(false);
  const [localOffset, setLocalOffset]           = useState(0);
  const [localHasNext, setLocalHasNext]         = useState(false);
  const abortLocalRef = useRef<AbortController | null>(null);

  // ── Source search state ───────────────────────────────────────────────────
  const [searchSources, setSearchSources]         = useState(false);
  const [sourceResults, setSourceResults]         = useState<Manga[]>([]);
  const [loadingSourceSearch, setLoadingSourceSearch] = useState(false);
  const [loadingMoreSource, setLoadingMoreSource] = useState(false);
  // Per-source next-page tracker; -1 = exhausted
  const srcNextPageRef = useRef<Map<string, number>>(new Map());
  const abortSourceRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    abortLocalRef.current?.abort();
    abortSourceRef.current?.abort();
  }, []);

  // ── Local DB query ────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTags.length === 0) {
      setLocalResults([]); setTotalCount(0); setLocalHasNext(false); setLocalOffset(0);
      return;
    }
    abortLocalRef.current?.abort();
    const ctrl = new AbortController();
    abortLocalRef.current = ctrl;
    setLocalResults([]); setTotalCount(0); setLocalOffset(0); setLocalHasNext(false);
    setLoadingLocal(true);

    gql<{ mangas: { nodes: Manga[]; pageInfo: { hasNextPage: boolean }; totalCount: number } }>(
      MANGAS_BY_GENRE,
      { filter: buildGenreFilter(activeTags, tagMode), first: TAG_PAGE_SIZE, offset: 0 },
      ctrl.signal,
    ).then((d) => {
      if (ctrl.signal.aborted) return;
      setLocalResults(d.mangas.nodes);
      setTotalCount(d.mangas.totalCount);
      setLocalHasNext(d.mangas.pageInfo.hasNextPage);
      setLocalOffset(TAG_PAGE_SIZE);
    }).catch((e: any) => {
      if (e?.name !== "AbortError") console.error(e);
    }).finally(() => {
      if (!ctrl.signal.aborted) setLoadingLocal(false);
    });
  }, [activeTags, tagMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Source search ─────────────────────────────────────────────────────────
  // Fires when toggled on (or when tags change while already on).
  // Uses getPageSet() + cache.get(sourceMangaPage) so the first page of each
  // source is re-used from cache if the user navigates away and back.
  useEffect(() => {
    if (!searchSources || activeTags.length === 0 || loadingSources) return;

    abortSourceRef.current?.abort();
    const ctrl = new AbortController();
    abortSourceRef.current = ctrl;

    setSourceResults([]);
    srcNextPageRef.current = new Map();
    setLoadingSourceSearch(true);

    const sources    = dedupeSources(allSources, preferredLang).slice(0, MAX_TAG_SOURCES);
    const primaryTag = activeTags[0]; // sources only support a single query string

    for (const src of sources) srcNextPageRef.current.set(src.id, -1);

    runConcurrent(sources, async (src) => {
      if (ctrl.signal.aborted) return;

      const ps      = getPageSet(src.id, "SEARCH", activeTags);
      const pageKey = CACHE_KEYS.sourceMangaPage(src.id, "SEARCH", 1, activeTags);

      const result = await cache
        .get<{ mangas: Manga[]; hasNextPage: boolean }>(
          pageKey,
          () => gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
            FETCH_SOURCE_MANGA,
            { source: src.id, type: "SEARCH", page: 1, query: primaryTag },
            ctrl.signal,
          ).then((d) => d.fetchSourceManga),
        )
        .catch((e: any) => {
          if (e?.name !== "AbortError") console.error(e);
          return null;
        });

      if (!result || ctrl.signal.aborted) return;

      ps.add(1);
      srcNextPageRef.current.set(src.id, result.hasNextPage ? 2 : -1);

      // Multi-tag AND: client-filter for tags beyond the first
      const matching = activeTags.length > 1
        ? result.mangas.filter((m) => matchesAllTags(m, activeTags))
        : result.mangas;

      if (matching.length > 0) {
        setSourceResults((prev) => dedupeMangaById([...prev, ...matching]));
        setLoadingSourceSearch(false); // reveal as results arrive
      }
    }, ctrl.signal).finally(() => {
      if (!ctrl.signal.aborted) setLoadingSourceSearch(false);
    });

    return () => { ctrl.abort(); };
  }, [searchSources, activeTags, allSources, loadingSources]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load more: local ──────────────────────────────────────────────────────
  async function loadMoreLocal() {
    if (loadingMoreLocal || !localHasNext) return;
    setLoadingMoreLocal(true);
    abortLocalRef.current?.abort();
    const ctrl = new AbortController();
    abortLocalRef.current = ctrl;
    try {
      const d = await gql<{ mangas: { nodes: Manga[]; pageInfo: { hasNextPage: boolean } } }>(
        MANGAS_BY_GENRE,
        { filter: buildGenreFilter(activeTags, tagMode), first: TAG_PAGE_SIZE, offset: localOffset },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setLocalResults((prev) => [...prev, ...d.mangas.nodes]);
      setLocalHasNext(d.mangas.pageInfo.hasNextPage);
      setLocalOffset((o) => o + TAG_PAGE_SIZE);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    } finally {
      if (!ctrl.signal.aborted) setLoadingMoreLocal(false);
    }
  }

  // ── Load more: sources ────────────────────────────────────────────────────
  const sourceHasMore = searchSources &&
    [...srcNextPageRef.current.values()].some((p) => p > 0);

  async function loadMoreSource() {
    if (loadingMoreSource || !sourceHasMore) return;
    setLoadingMoreSource(true);
    abortSourceRef.current?.abort();
    const ctrl = new AbortController();
    abortSourceRef.current = ctrl;

    const sources    = dedupeSources(allSources, preferredLang)
      .slice(0, MAX_TAG_SOURCES)
      .filter((src) => (srcNextPageRef.current.get(src.id) ?? -1) > 0);
    const primaryTag = activeTags[0];

    try {
      await runConcurrent(sources, async (src) => {
        const page = srcNextPageRef.current.get(src.id)!;
        if (ctrl.signal.aborted) return;

        const ps      = getPageSet(src.id, "SEARCH", activeTags);
        const pageKey = CACHE_KEYS.sourceMangaPage(src.id, "SEARCH", page, activeTags);

        const result = await cache
          .get<{ mangas: Manga[]; hasNextPage: boolean }>(
            pageKey,
            () => gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
              FETCH_SOURCE_MANGA,
              { source: src.id, type: "SEARCH", page, query: primaryTag },
              ctrl.signal,
            ).then((d) => d.fetchSourceManga),
          )
          .catch((e: any) => {
            if (e?.name !== "AbortError") srcNextPageRef.current.set(src.id, -1);
            return null;
          });

        if (!result || ctrl.signal.aborted) return;

        ps.add(page);
        srcNextPageRef.current.set(src.id, result.hasNextPage ? page + 1 : -1);

        const matching = activeTags.length > 1
          ? result.mangas.filter((m) => matchesAllTags(m, activeTags))
          : result.mangas;

        if (matching.length > 0)
          setSourceResults((prev) => dedupeMangaById([...prev, ...matching]));
      }, ctrl.signal);
    } finally {
      if (!ctrl.signal.aborted) setLoadingMoreSource(false);
    }
  }

  // ── Tag toggle ────────────────────────────────────────────────────────────
  function toggleTag(tag: string) {
    // Clear source sessions when tags change — new query = new page buckets
    srcNextPageRef.current = new Map();
    setSourceResults([]);
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  const filteredGenres = useMemo(() => {
    const q = tagFilter.trim().toLowerCase();
    return q ? COMMON_GENRES.filter((g) => g.toLowerCase().includes(q)) : COMMON_GENRES;
  }, [tagFilter]);

  const hasActiveTags = activeTags.length > 0;

  // Merge local + source results (local first, source de-duped against local IDs)
  const localIds      = useMemo(() => new Set(localResults.map((m) => m.id)), [localResults]);
  const mergedResults = searchSources
    ? [...localResults, ...sourceResults.filter((m) => !localIds.has(m.id))]
    : localResults;

  const totalVisible = localResults.length + (searchSources ? sourceResults.length : 0);

  return (
    <div className={s.splitRoot}>
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <div className={s.splitSidebar}>
        <div className={s.splitSearchWrap}>
          <MagnifyingGlass size={12} className={s.splitSearchIcon} weight="light" />
          <input
            className={s.splitSearchInput}
            placeholder="Filter tags…"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
        </div>
        <div className={s.splitList}>
          {filteredGenres.map((tag) => (
            <button
              key={tag}
              className={[s.splitItem, activeTags.includes(tag) ? s.splitItemActive : ""].join(" ")}
              onClick={() => toggleTag(tag)}
            >
              <span className={s.splitItemLabel}>{tag}</span>
              {activeTags.includes(tag) && <span className={s.tagCheckMark}>✓</span>}
            </button>
          ))}
          {filteredGenres.length === 0 && <p className={s.splitEmpty}>No matching tags</p>}
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className={s.splitContent}>
        {!hasActiveTags ? (
          <div className={s.empty}>
            <Hash size={32} weight="light" className={s.emptyIcon} />
            <p className={s.emptyText}>Browse by tag</p>
            <p className={s.emptyHint}>Select one or more genre tags to find matching manga.</p>
          </div>
        ) : (
          <>
            {/* Active tag pills + controls */}
            <div className={s.tagActiveBar}>
              <div className={s.tagPillRow}>
                {activeTags.map((tag) => (
                  <span key={tag} className={s.tagPill}>
                    {tag}
                    <button className={s.tagPillRemove} onClick={() => toggleTag(tag)} title={`Remove ${tag}`}>×</button>
                  </span>
                ))}
              </div>
              <div className={s.tagBarRight}>
                {activeTags.length > 1 && (
                  <div className={s.tagModeToggle}>
                    <button
                      className={[s.tagModeBtn, tagMode === "AND" ? s.tagModeBtnActive : ""].join(" ")}
                      onClick={() => setTagMode("AND")}
                      title="Show manga matching ALL selected tags"
                    >AND</button>
                    <button
                      className={[s.tagModeBtn, tagMode === "OR" ? s.tagModeBtnActive : ""].join(" ")}
                      onClick={() => setTagMode("OR")}
                      title="Show manga matching ANY selected tag"
                    >OR</button>
                  </div>
                )}
                {/* "Search sources" toggle — fetches from external sources */}
                <button
                  className={[s.tagModeBtn, searchSources ? s.tagModeBtnActive : ""].join(" ")}
                  onClick={() => setSearchSources((v) => !v)}
                  title="Also search across sources (slower, requires network)"
                  disabled={loadingSources}
                >
                  <Globe size={11} weight="light" style={{ marginRight: 3, verticalAlign: "middle" }} />
                  Sources
                </button>
                <button className={s.tagClearAll} onClick={() => setActiveTags([])}>Clear all</button>
              </div>
            </div>

            {/* Result header */}
            <div className={s.splitContentHeader}>
              <span className={s.splitContentTitle}>
                {activeTags.length === 1 ? activeTags[0] : `${activeTags.length} tags (${tagMode})`}
                {searchSources && (
                  <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.55, fontSize: "0.9em" }}>
                    + sources
                  </span>
                )}
              </span>
              {(loadingLocal || loadingSourceSearch)
                ? <CircleNotch size={13} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
                : <span className={s.splitResultCount}>
                    {totalVisible}
                    {localHasNext || sourceHasMore ? "+" : ""} of {totalCount + sourceResults.length} results
                  </span>
              }
            </div>

            {/* Results grid */}
            {loadingLocal ? (
              <GridSkeleton count={48} />
            ) : mergedResults.length > 0 ? (
              <div className={s.tagGrid}>
                {mergedResults.map((m) => (
                  <MangaCard key={m.id} manga={m} onClick={() => onMangaClick(m)} />
                ))}

                {/* Inline skeletons while source results are still streaming in */}
                {loadingSourceSearch && Array.from({ length: 8 }).map((_, i) => (
                  <div key={`sk-src-${i}`} className={s.skCard} style={{ width: "auto" }}>
                    <div className={["skeleton", s.skCover].join(" ")} style={{ aspectRatio: "2/3", width: "100%" }} />
                    <div className={["skeleton", s.skTitle].join(" ")} />
                  </div>
                ))}

                {/* Show more buttons — one per data source */}
                {(localHasNext || sourceHasMore) && (
                  <div className={s.showMoreCell}>
                    {localHasNext && (
                      <button className={s.showMoreBtn} onClick={loadMoreLocal} disabled={loadingMoreLocal}>
                        {loadingMoreLocal
                          ? <><CircleNotch size={13} weight="light" className="anim-spin" /> Loading…</>
                          : "Show more (library)"}
                      </button>
                    )}
                    {sourceHasMore && (
                      <button className={s.showMoreBtn} onClick={loadMoreSource} disabled={loadingMoreSource}>
                        {loadingMoreSource
                          ? <><CircleNotch size={13} weight="light" className="anim-spin" /> Loading…</>
                          : "Show more (sources)"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className={s.empty}>
                <p className={s.emptyText}>No results for {activeTags.join(` ${tagMode} `)}</p>
                <p className={s.emptyHint}>
                  {searchSources
                    ? "Try OR mode or broader tags."
                    : "Try OR mode, enable Sources, or check that these manga are in your library."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Source tab ────────────────────────────────────────────────────────────────
// Unchanged from v1.

function SourceTab({
  allSources, loadingSources, availableLangs, hasMultipleLangs, onMangaClick,
}: {
  allSources:       Source[];
  loadingSources:   boolean;
  availableLangs:   string[];
  hasMultipleLangs: boolean;
  onMangaClick:     (m: Manga) => void;
}) {
  const [selectedLang, setSelectedLang]   = useState<string>("all");
  const [activeSource, setActiveSource]   = useState<Source | null>(null);
  const [browseResults, setBrowseResults] = useState<Manga[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [browseQuery, setBrowseQuery]     = useState("");
  const [submitted, setSubmitted]         = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const visibleSources = useMemo(() =>
    selectedLang === "all" ? allSources : allSources.filter((s) => s.lang === selectedLang),
    [allSources, selectedLang]
  );

  async function fetchBrowse(src: Source, type: "POPULAR" | "SEARCH", q?: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoadingBrowse(true);
    setBrowseResults([]);

    try {
      const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(
        FETCH_SOURCE_MANGA,
        { source: src.id, type, page: 1, query: q ?? null },
        ctrl.signal,
      );
      if (!ctrl.signal.aborted) setBrowseResults(d.fetchSourceManga.mangas);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    } finally {
      if (!ctrl.signal.aborted) setLoadingBrowse(false);
    }
  }

  function selectSource(src: Source) {
    setActiveSource(src);
    setBrowseQuery("");
    setSubmitted("");
    fetchBrowse(src, "POPULAR");
  }

  function handleSearch() {
    if (!activeSource || !browseQuery.trim()) return;
    setSubmitted(browseQuery.trim());
    fetchBrowse(activeSource, "SEARCH", browseQuery.trim());
  }

  function clearSearch() {
    setBrowseQuery("");
    setSubmitted("");
    if (activeSource) fetchBrowse(activeSource, "POPULAR");
  }

  return (
    <div className={s.splitRoot}>
      <div className={s.splitSidebar}>
        {hasMultipleLangs && (
          <div className={s.langFilterRow}>
            {["all", ...availableLangs].map((lang) => (
              <button key={lang}
                className={[s.langChip, selectedLang === lang ? s.langChipActive : ""].join(" ")}
                onClick={() => setSelectedLang(lang)}
              >
                {lang === "all" ? "All" : lang.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        {loadingSources ? (
          <div className={s.splitLoading}>
            <CircleNotch size={16} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
          </div>
        ) : (
          <div className={s.splitList}>
            {visibleSources.map((src) => (
              <button key={src.id}
                className={[s.splitItem, s.splitItemSource, activeSource?.id === src.id ? s.splitItemActive : ""].join(" ")}
                onClick={() => selectSource(src)}
              >
                <img src={thumbUrl(src.iconUrl)} alt="" className={s.splitSourceIcon}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className={s.splitItemLabel}>{src.displayName}</span>
                {src.isNsfw && <span className={s.nsfwBadge}>18+</span>}
              </button>
            ))}
            {visibleSources.length === 0 && <p className={s.splitEmpty}>No sources for this language</p>}
          </div>
        )}
      </div>

      <div className={s.splitContent}>
        {!activeSource ? (
          <div className={s.empty}>
            <List size={32} weight="light" className={s.emptyIcon} />
            <p className={s.emptyText}>Browse a source</p>
            <p className={s.emptyHint}>Select a source to see its popular titles, or search within it.</p>
          </div>
        ) : (
          <>
            <div className={s.splitContentHeader}>
              <div className={s.splitSourceTitle}>
                <img src={thumbUrl(activeSource.iconUrl)} alt="" className={s.splitSourceIcon}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className={s.splitContentTitle}>{activeSource.displayName}</span>
                {loadingBrowse && <CircleNotch size={13} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />}
                {!loadingBrowse && browseResults.length > 0 && <span className={s.splitResultCount}>{browseResults.length} results</span>}
              </div>
              <div className={s.sourceBrowseBar}>
                <div className={s.searchBar} style={{ flex: 1 }}>
                  <MagnifyingGlass size={12} className={s.searchIcon} weight="light" />
                  <input
                    className={s.searchInput}
                    placeholder={`Search ${activeSource.displayName}…`}
                    value={browseQuery}
                    onChange={(e) => setBrowseQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  {submitted && (
                    <button className={s.clearSearchBtn} onClick={clearSearch} title="Clear search">×</button>
                  )}
                </div>
                <button className={s.searchBtn} onClick={handleSearch} disabled={!browseQuery.trim() || loadingBrowse}>
                  Search
                </button>
              </div>
            </div>

            {loadingBrowse ? <GridSkeleton /> : browseResults.length > 0 ? (
              <div className={s.tagGrid}>
                {browseResults.map((m) => <MangaCard key={m.id} manga={m} onClick={() => onMangaClick(m)} />)}
              </div>
            ) : (
              <div className={s.empty}>
                <p className={s.emptyText}>{submitted ? `No results for "${submitted}"` : "No results"}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}