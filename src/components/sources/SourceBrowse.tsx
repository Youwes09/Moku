import { useEffect, useState, useRef } from "react";
import { ArrowLeft, MagnifyingGlass, ArrowLeft as Prev, ArrowRight as Next } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { FETCH_SOURCE_MANGA } from "../../lib/queries";
import { useStore } from "../../store";
import type { Manga } from "../../lib/types";
import s from "./SourceBrowse.module.css";

type BrowseType = "POPULAR" | "LATEST" | "SEARCH";

export default function SourceBrowse() {
  const activeSource = useStore((state) => state.activeSource);
  const setActiveSource = useStore((state) => state.setActiveSource);
  const setActiveManga = useStore((state) => state.setActiveManga);
  const setNavPage = useStore((state) => state.setNavPage);

  const [mangas, setMangas] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [browseType, setBrowseType] = useState<BrowseType>("POPULAR");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  async function fetch(type: BrowseType, p: number, q: string) {
    if (!activeSource) return;
    setLoading(true);
    setMangas([]);
    gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
      FETCH_SOURCE_MANGA,
      { source: activeSource.id, type, page: p, query: q || null }
    )
      .then((d) => {
        setMangas(d.fetchSourceManga.mangas);
        setHasNextPage(d.fetchSourceManga.hasNextPage);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetch(browseType, page, search);
  }, [activeSource?.id, browseType, page, search]);

  function submitSearch() {
    const q = searchInput.trim();
    setSearch(q);
    setBrowseType("SEARCH");
    setPage(1);
  }

  function setMode(mode: BrowseType) {
    if (mode === browseType) return;
    setBrowseType(mode);
    setSearch("");
    setSearchInput("");
    setPage(1);
  }

  function openManga(m: Manga) {
    setActiveManga(m);
    setNavPage("library");
  }

  if (!activeSource) return null;

  return (
    <div className={s.root}>
      <div className={s.header}>
        <button className={s.back} onClick={() => setActiveSource(null)}>
          <ArrowLeft size={13} weight="light" />
          <span>Sources</span>
        </button>
        <span className={s.sourceName}>{activeSource.displayName}</span>
      </div>

      <div className={s.toolbar}>
        <div className={s.tabs}>
          {(["POPULAR", "LATEST"] as BrowseType[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              className={[s.tab, browseType === mode && search === "" ? s.tabActive : ""].join(" ").trim()}
            >
              {mode.charAt(0) + mode.slice(1).toLowerCase()}
            </button>
          ))}
          {search && (
            <button className={[s.tab, s.tabActive].join(" ")}>
              Search
            </button>
          )}
        </div>

        <div className={s.searchWrap}>
          <MagnifyingGlass size={12} className={s.searchIcon} weight="light" />
          <input
            ref={searchRef}
            className={s.search}
            placeholder="Search source…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSearch()}
          />
        </div>
      </div>

      {loading ? (
        <div className={s.loadingGrid}>
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className={s.cardSkeleton}>
              <div className={["skeleton", s.coverSkeleton].join(" ")} />
              <div className={["skeleton", s.titleSkeleton].join(" ")} />
            </div>
          ))}
        </div>
      ) : mangas.length === 0 ? (
        <div className={s.empty}>No results.</div>
      ) : (
        <div className={s.grid}>
          {mangas.map((m) => (
            <button key={m.id} className={s.card} onClick={() => openManga(m)}>
              <div className={s.coverWrap}>
                <img src={thumbUrl(m.thumbnailUrl)} alt={m.title} className={s.cover} />
                {m.inLibrary && <span className={s.inLibraryBadge}>In Library</span>}
              </div>
              <p className={s.title}>{m.title}</p>
            </button>
          ))}
        </div>
      )}

      {!loading && (page > 1 || hasNextPage) && (
        <div className={s.pagination}>
          <button
            className={s.pageBtn}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <Prev size={13} weight="light" />
            Prev
          </button>
          <span className={s.pageNum}>{page}</span>
          <button
            className={s.pageBtn}
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNextPage}
          >
            Next
            <Next size={13} weight="light" />
          </button>
        </div>
      )}
    </div>
  );
}