import { useState, useRef, useCallback, useEffect } from "react";
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

const CONCURRENCY = 3;

async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      await fn(item).catch(() => {});
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

export default function Search() {
  const [query, setQuery]         = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults]     = useState<SourceResult[]>([]);
  const [allSources, setAllSources]   = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [activeLang, setActiveLang] = useState<string>("preferred");
  const inputRef = useRef<HTMLInputElement>(null);

  const setActiveManga = useStore((st) => st.setActiveManga);
  const setNavPage     = useStore((st) => st.setNavPage);
  const preferredLang  = useStore((st) => st.settings.preferredExtensionLang);

  useEffect(() => {
    setLoadingSources(true);
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => setAllSources(d.sources.nodes.filter((s) => s.id !== "0")))
      .catch(console.error)
      .finally(() => setLoadingSources(false));
  }, []);

  const langs = ["preferred", ...Array.from(new Set(allSources.map((s) => s.lang))).sort(), "all"];

  const visibleSources = allSources.filter((src) => {
    if (activeLang === "all") return true;
    if (activeLang === "preferred") return src.lang === preferredLang;
    return src.lang === activeLang;
  });

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || !visibleSources.length) return;
    setSubmitted(q);

    setResults(visibleSources.map((src) => ({ source: src, mangas: [], loading: true, error: null })));

    await runConcurrent(visibleSources, async (src) => {
      try {
        const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
          source: src.id, type: "SEARCH", page: 1, query: q,
        });
        setResults((prev) => prev.map((r) =>
          r.source.id === src.id ? { ...r, mangas: d.fetchSourceManga.mangas, loading: false } : r
        ));
      } catch (e: any) {
        setResults((prev) => prev.map((r) =>
          r.source.id === src.id ? { ...r, loading: false, error: e.message } : r
        ));
      }
    });
  }, [query, visibleSources]);

  function openManga(m: Manga) {
    setActiveManga(m);
    setNavPage("library");
  }

  const hasResults = results.some((r) => r.mangas.length > 0);
  const allDone    = results.every((r) => !r.loading);

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h1 className={s.heading}>Search</h1>
        <div className={s.searchBar}>
          <MagnifyingGlass size={14} className={s.searchIcon} weight="light" />
          <input
            ref={inputRef}
            className={s.searchInput}
            placeholder="Search across sources…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            autoFocus
          />
          <button
            className={s.searchBtn}
            onClick={runSearch}
            disabled={!query.trim() || loadingSources}
          >
            {loadingSources
              ? <CircleNotch size={13} weight="light" className="anim-spin" />
              : "Search"}
          </button>
        </div>
      </div>

      <div className={s.langBar}>
        {langs.map((l) => (
          <button
            key={l}
            onClick={() => setActiveLang(l)}
            className={[s.langBtn, activeLang === l ? s.langBtnActive : ""].join(" ").trim()}
          >
            {l === "preferred" ? `${preferredLang.toUpperCase()} (default)` : l === "all" ? "All" : l.toUpperCase()}
          </button>
        ))}
        {visibleSources.length > 0 && (
          <span className={s.sourceCount}>{visibleSources.length} sources</span>
        )}
      </div>

      {!submitted && (
        <div className={s.empty}>
          <MagnifyingGlass size={36} weight="light" className={s.emptyIcon} />
          <p className={s.emptyText}>Search across sources</p>
          <p className={s.emptyHint}>
            Searching {visibleSources.length} {activeLang === "preferred" ? `${preferredLang.toUpperCase()}` : activeLang === "all" ? "" : activeLang.toUpperCase()} source{visibleSources.length !== 1 ? "s" : ""}.
          </p>
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
                  <img
                    src={thumbUrl(source.iconUrl)}
                    alt={source.displayName}
                    className={s.sourceIcon}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
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