import { useState, useRef, useCallback, useEffect, memo, useMemo } from "react";
import {
  MagnifyingGlass, CircleNotch, SlidersHorizontal, Hash, List,
} from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_SOURCES, FETCH_SOURCE_MANGA } from "../../lib/queries";
import { cache, CACHE_KEYS, getTopSources } from "../../lib/cache";
import { dedupeSources, dedupeMangaByTitle } from "../../lib/sourceUtils";
import { useStore } from "../../store";
import type { Manga, Source } from "../../lib/types";
import s from "./Search.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchTab = "keyword" | "tag" | "source";

interface SourceResult {
  source: Source;
  mangas: Manga[];
  loading: boolean;
  error: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONCURRENCY = 4;
const RESULTS_PER_SOURCE = 8;

const COMMON_GENRES = [
  "Action","Adventure","Comedy","Drama","Fantasy","Romance",
  "Sci-Fi","Slice of Life","Horror","Mystery","Thriller","Sports",
  "Supernatural","Mecha","Historical","Psychological","School Life",
  "Shounen","Seinen","Josei","Shoujo","Isekai","Martial Arts",
  "Magic","Music","Cooking","Medical","Military","Harem","Ecchi",
];

// ── Concurrent fetch helper ───────────────────────────────────────────────────

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

// ── Shared card ───────────────────────────────────────────────────────────────

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

  const [allSources, setAllSources]       = useState<Source[]>([]);
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
        .then((d) => d.sources.nodes.filter((src) => src.id !== "0"))
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

function KeywordTab({
  allSources, loadingSources, availableLangs, hasMultipleLangs,
  preferredLang, pendingPrefill, onMangaClick,
}: {
  allSources: Source[];
  loadingSources: boolean;
  availableLangs: string[];
  hasMultipleLangs: boolean;
  preferredLang: string;
  pendingPrefill: React.MutableRefObject<string>;
  onMangaClick: (m: Manga) => void;
}) {
  const [query, setQuery]               = useState("");
  const [submitted, setSubmitted]       = useState("");
  const [results, setResults]           = useState<SourceResult[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(new Set());
  const [includeNsfw, setIncludeNsfw]     = useState(false);

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

function TagTab({
  preferredLang, onMangaClick,
}: {
  allSources: Source[];
  loadingSources: boolean;
  preferredLang: string;
  onMangaClick: (m: Manga) => void;
}) {
  const [activeTag, setActiveTag]   = useState<string | null>(null);
  const [tagResults, setTagResults] = useState<Manga[]>([]);
  const [loadingTag, setLoadingTag] = useState(false);
  const [tagFilter, setTagFilter]   = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function drillTag(tag: string) {
    if (tag === activeTag && !loadingTag) return;
    setActiveTag(tag);
    setTagResults([]);
    setLoadingTag(true);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const sources = await cache.get(CACHE_KEYS.SOURCES, () =>
        gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
          .then((d) => d.sources.nodes.filter((s) => s.id !== "0"))
      );
      const deduped = dedupeSources(sources, preferredLang);
      const top     = getTopSources(deduped);

      const results = await cache.get(CACHE_KEYS.GENRE(tag), () =>
        Promise.allSettled(
          top.map((src) =>
            gql<{ fetchSourceManga: { mangas: Manga[] } }>(
              FETCH_SOURCE_MANGA,
              { source: src.id, type: "SEARCH", page: 1, query: tag },
              ctrl.signal,
            ).then((d) => d.fetchSourceManga.mangas)
          )
        ).then((settled) => {
          const merged: Manga[] = [];
          for (const r of settled)
            if (r.status === "fulfilled") merged.push(...r.value);
          return dedupeMangaByTitle(merged);
        })
      );

      if (!ctrl.signal.aborted) setTagResults(results);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    } finally {
      if (!ctrl.signal.aborted) setLoadingTag(false);
    }
  }

  const filteredGenres = useMemo(() => {
    const q = tagFilter.trim().toLowerCase();
    return q ? COMMON_GENRES.filter((g) => g.toLowerCase().includes(q)) : COMMON_GENRES;
  }, [tagFilter]);

  return (
    <div className={s.splitRoot}>
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
              className={[s.splitItem, activeTag === tag ? s.splitItemActive : ""].join(" ")}
              onClick={() => drillTag(tag)}
            >
              {tag}
            </button>
          ))}
          {filteredGenres.length === 0 && <p className={s.splitEmpty}>No matching tags</p>}
        </div>
      </div>

      <div className={s.splitContent}>
        {!activeTag ? (
          <div className={s.empty}>
            <Hash size={32} weight="light" className={s.emptyIcon} />
            <p className={s.emptyText}>Browse by tag</p>
            <p className={s.emptyHint}>Select a genre tag to see matching manga across your sources.</p>
          </div>
        ) : (
          <>
            <div className={s.splitContentHeader}>
              <span className={s.splitContentTitle}>{activeTag}</span>
              {loadingTag
                ? <CircleNotch size={13} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
                : <span className={s.splitResultCount}>{tagResults.length} results</span>}
            </div>
            {loadingTag ? (
              <GridSkeleton />
            ) : tagResults.length > 0 ? (
              <div className={s.tagGrid}>
                {tagResults.map((m) => (
                  <MangaCard key={m.id} manga={m} onClick={() => onMangaClick(m)} />
                ))}
              </div>
            ) : (
              <div className={s.empty}>
                <p className={s.emptyText}>No results for "{activeTag}"</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Source tab ────────────────────────────────────────────────────────────────

function SourceTab({
  allSources, loadingSources, availableLangs, hasMultipleLangs, onMangaClick,
}: {
  allSources: Source[];
  loadingSources: boolean;
  availableLangs: string[];
  hasMultipleLangs: boolean;
  onMangaClick: (m: Manga) => void;
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