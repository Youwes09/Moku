import { useEffect, useState, useMemo, useCallback, memo, useRef } from "react";
import { MagnifyingGlass, Books, DownloadSimple, X, Folder, FolderSimplePlus, Trash, BookOpen, BookmarkSimple } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { gql, thumbUrl } from "../../lib/client";
import { GET_LIBRARY, UPDATE_MANGA, GET_CHAPTERS, DELETE_DOWNLOADED_CHAPTERS, DEQUEUE_DOWNLOAD } from "../../lib/queries";
import { useStore } from "../../store";
import type { Manga, Chapter } from "../../lib/types";
import ContextMenu, { type ContextMenuEntry } from "../context/ContextMenu";
import s from "./Library.module.css";

// Keep in sync with CSS grid: minmax(130px, 1fr) + var(--sp-4)=16px gap
const CARD_MIN_W = 130;
const CARD_GAP   = 16;
const ROW_HEIGHT = 260; // ~195px cover + ~40px title + 16px gap + buffer

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
  const [allManga, setAllManga]   = useState<Manga[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [ctx, setCtx]             = useState<{ x: number; y: number; manga: Manga } | null>(null);
  const [emptyCtx, setEmptyCtx]   = useState<{ x: number; y: number } | null>(null);
  const scrollRef                 = useRef<HTMLDivElement>(null);

  const setActiveManga      = useStore((state) => state.setActiveManga);
  const libraryFilter       = useStore((state) => state.libraryFilter);
  const setLibraryFilter    = useStore((state) => state.setLibraryFilter);
  const settings            = useStore((state) => state.settings);
  const libraryTagFilter    = useStore((state) => state.libraryTagFilter);
  const setLibraryTagFilter = useStore((state) => state.setLibraryTagFilter);
  const folders                = useStore((state) => state.settings.folders);
  const addFolder              = useStore((state) => state.addFolder);
  const assignMangaToFolder    = useStore((state) => state.assignMangaToFolder);
  const removeMangaFromFolder  = useStore((state) => state.removeMangaFromFolder);

  useEffect(() => {
    gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY)
      .then((lib) => setAllManga(lib.mangas.nodes))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Reset scroll when filter/search changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [libraryFilter, search]);

  useEffect(() => {
    const activeFolder = folders.find((f) => f.id === libraryFilter);
    if (activeFolder && !activeFolder.showTab) setLibraryFilter("library");
  }, [folders]);

  const isBuiltinFilter = libraryFilter === "all" || libraryFilter === "library" || libraryFilter === "downloaded";

  const filtered = useMemo(() => {
    let items = allManga;
    if (libraryFilter === "library") {
      items = items.filter((m) => m.inLibrary);
    } else if (libraryFilter === "downloaded") {
      items = items.filter((m) => (m.downloadCount ?? 0) > 0);
    } else if (!isBuiltinFilter) {
      const folder = folders.find((f) => f.id === libraryFilter);
      if (folder) items = items.filter((m) => folder.mangaIds.includes(m.id));
    }
    if (libraryTagFilter.length > 0)
      items = items.filter((m) => libraryTagFilter.every((tag) => (m.genre ?? []).includes(tag)));
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((m) => m.title.toLowerCase().includes(q));
    }
    return items;
  }, [allManga, libraryFilter, search, libraryTagFilter, folders, isBuiltinFilter]);

  // ── Virtualizer setup ──────────────────────────────────────────────────────
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((containerWidth + CARD_GAP) / (CARD_MIN_W + CARD_GAP)));

  const rows = useMemo(() => {
    const result: Manga[][] = [];
    for (let i = 0; i < filtered.length; i += cols)
      result.push(filtered.slice(i, i + cols));
    return result;
  }, [filtered, cols]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

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
      const downloadedChapters = data.chapters.nodes.filter((c) => c.isDownloaded);
      const ids = downloadedChapters.map((c) => c.id);
      if (!ids.length) return;

      // Delete the downloaded files
      await gql(DELETE_DOWNLOADED_CHAPTERS, { ids });

      // Also remove these chapters from the download queue (fix #12)
      // Fire-and-forget — queue removal is best-effort
      await Promise.allSettled(ids.map((id) => gql(DEQUEUE_DOWNLOAD, { chapterId: id })));

      setAllManga((prev) => prev.map((m) => m.id === manga.id ? { ...m, downloadCount: 0 } : m));
    } catch (e) { console.error(e); }
  }

  function openCtx(e: React.MouseEvent, m: Manga) {
    e.preventDefault();
    const x = Math.min(e.clientX, window.innerWidth - 208);
    const y = Math.min(e.clientY, window.innerHeight - 168);
    setCtx({ x, y, manga: m });
  }

  function buildCtxItems(m: Manga): ContextMenuEntry[] {
    const mangaFolderEntries: ContextMenuEntry[] = folders.map((f) => {
      const inFolder = f.mangaIds.includes(m.id);
      return {
        label: inFolder ? `✓ ${f.name}` : f.name,
        icon: <Folder size={13} weight={inFolder ? "fill" : "light"} />,
        onClick: () => inFolder
          ? removeMangaFromFolder(f.id, m.id)
          : assignMangaToFolder(f.id, m.id),
      };
    });

    return [
      {
        label: "Open",
        icon: <BookOpen size={13} weight="light" />,
        onClick: () => setActiveManga(m),
      },
      { separator: true },
      {
        label: m.inLibrary ? "Remove from library" : "Add to library",
        icon: <BookmarkSimple size={13} weight={m.inLibrary ? "fill" : "light"} />,
        danger: m.inLibrary,
        onClick: () => m.inLibrary
          ? removeFromLibrary(m)
          : gql(UPDATE_MANGA, { id: m.id, inLibrary: true })
              .then(() => setAllManga((prev) => prev.map((x) => x.id === m.id ? { ...x, inLibrary: true } : x)))
              .catch(console.error),
      },
      {
        label: "Delete all downloads",
        icon: <Trash size={13} weight="light" />,
        danger: true,
        disabled: !(m.downloadCount && m.downloadCount > 0),
        onClick: () => deleteAllDownloads(m),
      },
      ...(folders.length > 0 ? [
        { separator: true } as ContextMenuEntry,
        ...mangaFolderEntries,
      ] : []),
      { separator: true },
      {
        label: "New folder",
        icon: <FolderSimplePlus size={13} weight="light" />,
        onClick: () => {
          const name = prompt("Folder name:");
          if (name?.trim()) {
            const id = addFolder(name.trim());
            assignMangaToFolder(id, m.id);
          }
        },
      },
    ];
  }

  function buildEmptyCtxItems(): ContextMenuEntry[] {
    return [
      {
        label: "New folder",
        icon: <FolderSimplePlus size={13} weight="light" />,
        onClick: () => {
          const name = prompt("Folder name:");
          if (name?.trim()) addFolder(name.trim());
        },
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
    folders.forEach((f) => { result[f.id] = allManga.filter((m) => f.mangaIds.includes(m.id)).length; });
    return result;
  }, [allManga, folders]);

  if (error) return (
    <div className={s.center}>
      <p className={s.errorMsg}>Could not reach Suwayomi</p>
      <p className={s.errorDetail}>{error}</p>
    </div>
  );

  return (
    <div
      className={s.root}
      ref={scrollRef}
      onContextMenu={(e) => {
        // Only fire on the bare background, not on cards
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        setEmptyCtx({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.heading}>Library</h1>
          <div className={s.tabs}>
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
                ) : <>All</>}
                <span className={s.tabCount}>{counts[f]}</span>
              </button>
            ))}
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

      {allTags.length > 0 && (
        <div className={s.tagPanel}>
          {libraryTagFilter.length > 0 && (
            <button className={s.tagClear} onClick={() => setLibraryTagFilter([])}>
              <X size={11} weight="bold" /> Clear
            </button>
          )}
          {allTags.map((tag) => {
            const active = libraryTagFilter.includes(tag);
            return (
              <button key={tag}
                className={[s.tagChip, active ? s.tagChipActive : ""].join(" ")}
                onClick={() => setLibraryTagFilter(
                  active ? libraryTagFilter.filter((t) => t !== tag) : [...libraryTagFilter, tag]
                )}>
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
            ? "No manga saved to library, browse sources to add some."
            : libraryFilter === "downloaded"
            ? "No downloaded manga."
            : !isBuiltinFilter
            ? "No manga in this folder yet. Right-click manga to assign them."
            : "No manga found."}
        </div>
      ) : (
        /* Virtual scroll container */
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const rowManga = rows[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: virtualRow.start,
                  left: 0,
                  right: 0,
                  height: virtualRow.size,
                }}
                className={s.virtualRow}
              >
                {rowManga.map((m) => (
                  <MangaCard
                    key={m.id}
                    manga={m}
                    onClick={handleCardClick(m)}
                    onContextMenu={(e) => openCtx(e, m)}
                    cropCovers={settings.libraryCropCovers}
                  />
                ))}
                {/* Ghost cards on last row to fill grid */}
                {virtualRow.index === rows.length - 1 &&
                  Array.from({ length: cols - rowManga.length }).map((_, i) => (
                    <div key={`ghost-${i}`} className={s.ghostCard} aria-hidden />
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildCtxItems(ctx.manga)}
          onClose={() => setCtx(null)}
        />
      )}
      {emptyCtx && (
        <ContextMenu
          x={emptyCtx.x}
          y={emptyCtx.y}
          items={buildEmptyCtxItems()}
          onClose={() => setEmptyCtx(null)}
        />
      )}
    </div>
  );
}