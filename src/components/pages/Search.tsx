import { useState, useRef, useCallback } from "react";
import { MagnifyingGlass, CircleNotch } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_SOURCES, FETCH_SOURCE_MANGA } from "../../lib/queries";
import { useStore } from "../../store";
import type { Manga, Source } from "../../lib/types";
import s from "./Search.module.css";

interface SourceResult {
  source: Source;
  mangas: Manga[];
  loading: boolean;
  error: string | null;
}

export default function Search() {
  const [query, setQuery]         = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults]     = useState<SourceResult[]>([]);
  const [sources, setSources]     = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setActiveManga = useStore((s) => s.setActiveManga);
  const setNavPage     = useStore((s) => s.setNavPage);

  const loadSources = useCallback(async () => {
    if (sources.length) return sources;
    setLoadingSources(true);
    const data = await gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .finally(() => setLoadingSources(false));
    const nodes = data.sources.nodes.filter((s) => s.id !== "0");
    setSources(nodes);
    return nodes;
  }, [sources]);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);

    const srcs = await loadSources();
    // Initialise loading state for each source
    setResults(srcs.map((src) => ({ source: src, mangas: [], loading: true, error: null })));

    // Fire all source queries in parallel, update each independently
    srcs.forEach((src) => {
      gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
        source: src.id, type: "SEARCH", page: 1, query: q,
      })
        .then((d) => {
          setResults((prev) => prev.map((r) =>
            r.source.id === src.id
              ? { ...r, mangas: d.fetchSourceManga.mangas, loading: false }
              : r
          ));
        })
        .catch((e) => {
          setResults((prev) => prev.map((r) =>
            r.source.id === src.id
              ? { ...r, loading: false, error: e.message }
              : r
          ));
        });
    });
  }

  function openManga(m: Manga) {
    setActiveManga(m);
    setNavPage("library");
  }

  const hasResults = results.some((r) => r.mangas.length > 0);
  const allDone    = results.every((r) => !r.loading);

  return (
    <div className={s.root}>
      {/* ── Search bar ── */}
      <div className={s.header}>
        <h1 className={s.heading}>Search</h1>
        <div className={s.searchBar}>
          <MagnifyingGlass size={14} className={s.searchIcon} weight="light" />
          <input ref={inputRef} className={s.searchInput}
            placeholder="Search across all sources…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            autoFocus />
          <button className={s.searchBtn}
            onClick={runSearch}
            disabled={!query.trim() || loadingSources}>
            {loadingSources
              ? <CircleNotch size={13} weight="light" className="anim-spin" />
              : "Search"}
          </button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {!submitted && (
        <div className={s.empty}>
          <MagnifyingGlass size={36} weight="light" className={s.emptyIcon} />
          <p className={s.emptyText}>Search across all installed sources at once</p>
          <p className={s.emptyHint}>Results from each source appear as they load.</p>
        </div>
      )}

      {/* ── Results ── */}
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
                <img src={thumbUrl(source.iconUrl)} alt={source.displayName}
                  className={s.sourceIcon}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                <span className={s.sourceName}>{source.displayName}</span>
                {loading && <CircleNotch size={12} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />}
                {!loading && mangas.length > 0 && (
                  <span className={s.resultCount}>{mangas.length} results</span>
                )}
              </div>

              {error ? (
                <p className={s.sourceError}>{error}</p>
              ) : loading ? (
                <div className={s.sourceRow}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={s.skCard}>
                      <div className={["skeleton", s.skCover].join(" ")} />
                      <div className={["skeleton", s.skTitle].join(" ")} />
                    </div>
                  ))}
                </div>
              ) : mangas.length > 0 ? (
                <div className={s.sourceRow}>
                  {mangas.slice(0, 8).map((m) => (
                    <button key={m.id} className={s.card} onClick={() => openManga(m)}>
                      <div className={s.coverWrap}>
                        <img src={thumbUrl(m.thumbnailUrl)} alt={m.title} className={s.cover} />
                        {m.inLibrary && <span className={s.inLibBadge}>In Library</span>}
                      </div>
                      <p className={s.cardTitle}>{m.title}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {allDone && !hasResults && submitted && (
            <div className={s.empty}>
              <p className={s.emptyText}>No results for "{submitted}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}