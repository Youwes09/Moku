import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { MagnifyingGlass, Books, DownloadSimple, X, Folder, Trash } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_LIBRARY, GET_ALL_MANGA, UPDATE_MANGA, GET_CHAPTERS, DELETE_DOWNLOADED_CHAPTERS } from "../../lib/queries";
import { useStore } from "../../store";
import type { Manga, Chapter } from "../../lib/types";
import ContextMenu, { type ContextMenuEntry } from "../context/ContextMenu";
import s from "./Library.module.css";

const INITIAL_PAGE_SIZE = 48;
const PAGE_INCREMENT = 48;

// Memoized card to prevent re-renders when siblings change
const MangaCard = memo(function MangaCard({
  manga,
  onClick,
  onContextMenu,
  cropCovers,
}: {
  manga: Manga;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  cropCovers: boolean;
}) {
  return (
    <button className={s.card} onClick={onClick} onContextMenu={onContextMenu}>
      <div className={s.coverWrap}>
        <img
          src={thumbUrl(manga.thumbnailUrl)}
          alt={manga.title}
          className={s.cover}
          style={{ objectFit: cropCovers ? "cover" : "contain" }}
          loading="lazy"
          decoding="async"
        />
        {!!manga.downloadCount && (
          <span className={s.downloadedBadge}>{manga.downloadCount}</span>
        )}
      </div>
      <p className={s.title}>{manga.title}</p>
    </button>
  );
});

export default function Library() {
  const [allManga, setAllManga] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE);
  const [ctx, setCtx] = useState<{ x: number; y: number; manga: Manga } | null>(null);

  const setActiveManga   = useStore((state) => state.setActiveManga);
  const libraryFilter    = useStore((state) => state.libraryFilter);
  const setLibraryFilter = useStore((state) => state.setLibraryFilter);
  const settings         = useStore((state) => state.settings);
  const libraryTagFilter = useStore((state) => state.libraryTagFilter);
  const setLibraryTagFilter = useStore((state) => state.setLibraryTagFilter);
  const folders          = useStore((state) => state.settings.folders);

  useEffect(() => {
    Promise.all([
      gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA),
      gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY),
    ])
      .then(([all, lib]) => {
        const libMap = new Map(lib.mangas.nodes.map((m) => [m.id, m]));
        setAllManga(all.mangas.nodes.map((m) => libMap.get(m.id) ?? m));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setVisibleCount(INITIAL_PAGE_SIZE); }, [libraryFilter, search]);

  // Reset filter if the active folder tab gets hidden
  useEffect(() => {
    const activeFolder = folders.find((f) => f.id === libraryFilter);
    if (activeFolder && !activeFolder.showTab) {
      setLibraryFilter("library");
    }
  }, [folders]);

  const isBuiltinFilter = libraryFilter === "all" || libraryFilter === "library" || libraryFilter === "downloaded";

  const filtered = useMemo(() => {
    let items = allManga;

    if (libraryFilter === "library") {
      items = items.filter((m) => m.inLibrary);
    } else if (libraryFilter === "downloaded") {
      items = items.filter((m) => (m.downloadCount ?? 0) > 0);
    } else if (!isBuiltinFilter) {
      // folder filter
      const folder = folders.find((f) => f.id === libraryFilter);
      if (folder) {
        items = items.filter((m) => folder.mangaIds.includes(m.id));
      }
    }

    // tag filter only applies to library/all/folder views
    if (libraryTagFilter.length > 0) {
      items = items.filter((m) =>
        libraryTagFilter.every((tag) => (m.genre ?? []).includes(tag))
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((m) => m.title.toLowerCase().includes(q));
    }

    return items;
  }, [allManga, libraryFilter, search, libraryTagFilter, folders, isBuiltinFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleCardClick = useCallback(
    (m: Manga) => () => setActiveManga(m),
    [setActiveManga]
  );

  async function removeFromLibrary(manga: Manga) {
    await gql(UPDATE_MANGA, { id: manga.id, inLibrary: false }).catch(console.error);
    setAllManga((prev) => prev.map((m) => m.id === manga.id ? { ...m, inLibrary: false } : m));
  }

  async function deleteAllDownloads(manga: Manga) {
    try {
      const data = await gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId: manga.id });
      const downloadedIds = data.chapters.nodes
        .filter((c) => c.isDownloaded)
        .map((c) => c.id);
      if (!downloadedIds.length) return;
      await gql(DELETE_DOWNLOADED_CHAPTERS, { ids: downloadedIds });
      setAllManga((prev) =>
        prev.map((m) => m.id === manga.id ? { ...m, downloadCount: 0 } : m)
      );
    } catch (e) {
      console.error(e);
    }
  }

  function openCtx(e: React.MouseEvent, m: Manga) {
    e.preventDefault();
    const menuW = 200;
    const menuH = 160;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setCtx({ x, y, manga: m });
  }

  function buildCtxItems(m: Manga): ContextMenuEntry[] {
    return [
      {
        label: "Open",
        onClick: () => setActiveManga(m),
      },
      { separator: true },
      {
        label: m.inLibrary ? "Remove from library" : "Add to library",
        danger: m.inLibrary,
        onClick: () => m.inLibrary
          ? removeFromLibrary(m)
          : gql(UPDATE_MANGA, { id: m.id, inLibrary: true })
              .then(() => setAllManga((prev) => prev.map((x) => x.id === m.id ? { ...x, inLibrary: true } : x)))
              .catch(console.error),
      },
      {
        label: "Delete all downloads",
        danger: true,
        disabled: !(m.downloadCount && m.downloadCount > 0),
        icon: <Trash size={13} weight="light" />,
        onClick: () => deleteAllDownloads(m),
      },
    ];
  }

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    allManga.filter((m) => m.inLibrary).forEach((m) => (m.genre ?? []).forEach((g) => tagSet.add(g)));
    return Array.from(tagSet).sort();
  }, [allManga]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {
      all: allManga.length,
      library: allManga.filter((m) => m.inLibrary).length,
      downloaded: allManga.filter((m) => (m.downloadCount ?? 0) > 0).length,
    };
    folders.forEach((f) => {
      result[f.id] = allManga.filter((m) => f.mangaIds.includes(m.id)).length;
    });
    return result;
  }, [allManga, folders]);

  if (error) return (
    <div className={s.center}>
      <p className={s.errorMsg}>Could not reach Suwayomi</p>
      <p className={s.errorDetail}>{error}</p>
    </div>
  );

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.heading}>Library</h1>
          <div className={s.tabs}>
            {/* Built-in tabs */}
            {(["library", "downloaded", "all"] as const).map((f) => (
              <button
                key={f}
                className={[s.tab, libraryFilter === f ? s.tabActive : ""].join(" ").trim()}
                onClick={() => setLibraryFilter(f)}
              >
                {f === "library" ? (
                  <><Books size={11} weight="bold" /> Saved</>
                ) : f === "downloaded" ? (
                  <><DownloadSimple size={11} weight="bold" /> Downloaded</>
                ) : (
                  <>All</>
                )}
                <span className={s.tabCount}>{counts[f]}</span>
              </button>
            ))}
            {/* Folder tabs — only shown if the folder has showTab enabled */}
            {folders.filter((f) => f.showTab).map((folder) => (
              <button
                key={folder.id}
                className={[s.tab, libraryFilter === folder.id ? s.tabActive : ""].join(" ").trim()}
                onClick={() => setLibraryFilter(folder.id)}
              >
                <Folder size={11} weight="bold" />
                {folder.name}
                <span className={s.tabCount}>{counts[folder.id] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={s.searchWrap}>
          <MagnifyingGlass size={13} className={s.searchIcon} weight="light" />
          <input
            className={s.search}
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tag filter panel */}
      {allTags.length > 0 && (
        <div className={s.tagPanel}>
          {libraryTagFilter.length > 0 && (
            <button className={s.tagClear} onClick={() => setLibraryTagFilter([])}>
              <X size={11} weight="bold" />
              Clear
            </button>
          )}
          {allTags.map((tag) => {
            const active = libraryTagFilter.includes(tag);
            return (
              <button key={tag}
                className={[s.tagChip, active ? s.tagChipActive : ""].join(" ")}
                onClick={() =>
                  setLibraryTagFilter(
                    active
                      ? libraryTagFilter.filter((t) => t !== tag)
                      : [...libraryTagFilter, tag]
                  )
                }>
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className={s.grid}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={s.cardSkeleton}>
              <div className={[s.coverSkeletonWrap, "skeleton"].join(" ")} />
              <div className={[s.titleSkeleton, "skeleton"].join(" ")} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.center}>
          {libraryFilter === "library"
            ? "No manga saved to library. Browse sources to add some."
            : libraryFilter === "downloaded"
            ? "No downloaded manga."
            : !isBuiltinFilter
            ? "No manga in this folder yet. Right-click manga to assign them."
            : "No manga found."}
        </div>
      ) : (
        <>
          <div className={s.grid}>
            {visible.map((m) => (
              <MangaCard
                key={m.id}
                manga={m}
                onClick={handleCardClick(m)}
                onContextMenu={(e) => openCtx(e, m)}
                cropCovers={settings.libraryCropCovers}
              />
            ))}
          </div>
          {hasMore && (
            <div className={s.showMore}>
              <button
                className={s.showMoreBtn}
                onClick={() => setVisibleCount((c) => c + PAGE_INCREMENT)}
              >
                Show more
                <span className={s.showMoreCount}>{filtered.length - visibleCount} remaining</span>
              </button>
            </div>
          )}
        </>
      )}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildCtxItems(ctx.manga)}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}