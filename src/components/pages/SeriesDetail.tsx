import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  ArrowLeft, BookmarkSimple, Download, CheckCircle, Circle,
  ArrowSquareOut, CircleNotch, Play,
  SortAscending, SortDescending, CaretDown, ArrowsClockwise,
  List, SquaresFour, FolderSimplePlus, X, Trash, DownloadSimple,
} from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import {
  GET_MANGA, GET_CHAPTERS, FETCH_CHAPTERS, ENQUEUE_DOWNLOAD,
  UPDATE_MANGA, MARK_CHAPTER_READ, MARK_CHAPTERS_READ, DELETE_DOWNLOADED_CHAPTERS,
  ENQUEUE_CHAPTERS_DOWNLOAD,
} from "../../lib/queries";
import { useStore } from "../../store";
import ContextMenu, { type ContextMenuEntry } from "../context/ContextMenu";
import MigrateModal from "./MigrateModal";
import type { Manga, Chapter } from "../../lib/types";
import s from "./SeriesDetail.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: string | null | undefined): string {
  if (!ts) return "";
  const n = Number(ts);
  const d = new Date(n > 1e10 ? n : n * 1000);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface CtxState {
  x: number;
  y: number;
  chapter: Chapter;
  indexInSorted: number;
}

const CHAPTERS_PER_PAGE = 25;

// ── Download dropdown ─────────────────────────────────────────────────────────

interface DownloadDropdownProps {
  sortedChapters: Chapter[];
  continueChapter: { chapter: Chapter; type: string } | null;
  downloadedCount: number;
  deletingAll: boolean;
  onEnqueue: (ids: number[]) => void;
  onDelete: () => void;
  onClose: () => void;
}

function DownloadDropdown({
  sortedChapters, continueChapter, downloadedCount, deletingAll,
  onEnqueue, onDelete, onClose,
}: DownloadDropdownProps) {
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo]     = useState("");
  const [showRange, setShowRange] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose]);

  const continueIdx = continueChapter
    ? sortedChapters.indexOf(continueChapter.chapter)
    : -1;

  function enqueueNext(n: number) {
    if (continueIdx < 0) return;
    const ids = sortedChapters
      .slice(continueIdx, continueIdx + n)
      .filter((c) => !c.isDownloaded)
      .map((c) => c.id);
    onEnqueue(ids);
  }

  function enqueueRange() {
    const from = parseFloat(rangeFrom);
    const to   = parseFloat(rangeTo);
    if (isNaN(from) || isNaN(to)) return;
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const ids = sortedChapters
      .filter((c) => c.chapterNumber >= lo && c.chapterNumber <= hi && !c.isDownloaded)
      .map((c) => c.id);
    if (ids.length) onEnqueue(ids);
  }

  const unreadNotDl = sortedChapters.filter((c) => !c.isRead && !c.isDownloaded);
  const allNotDl    = sortedChapters.filter((c) => !c.isDownloaded);

  return (
    <div className={s.dlDropdown} ref={ref}>

      {continueChapter && continueIdx >= 0 && (
        <>
          <p className={s.dlSectionLabel}>From Ch.{continueChapter.chapter.chapterNumber}</p>
          <div className={s.dlNextRow}>
            {[5, 10, 25].map((n) => {
              const avail = sortedChapters
                .slice(continueIdx, continueIdx + n)
                .filter((c) => !c.isDownloaded).length;
              return (
                <button
                  key={n}
                  className={s.dlNextBtn}
                  disabled={avail === 0}
                  onClick={() => enqueueNext(n)}
                >
                  <span>Next {n}</span>
                  <span className={s.dlNextSub}>{avail} new</span>
                </button>
              );
            })}
          </div>
          <div className={s.dlDivider} />
        </>
      )}

      <button className={s.dlItem} onClick={() => setShowRange((p) => !p)}>
        <span>Custom range…</span>
        <span className={s.dlItemSub}>Enter chapter numbers</span>
      </button>
      {showRange && (
        <div className={s.dlRangeRow}>
          <input
            className={s.dlRangeInput}
            placeholder="From"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enqueueRange()}
          />
          <span className={s.dlRangeSep}>–</span>
          <input
            className={s.dlRangeInput}
            placeholder="To"
            value={rangeTo}
            onChange={(e) => setRangeTo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enqueueRange()}
          />
          <button
            className={s.dlRangeGo}
            disabled={!rangeFrom.trim() || !rangeTo.trim()}
            onClick={enqueueRange}
          >
            Queue
          </button>
        </div>
      )}

      <div className={s.dlDivider} />

      <button className={s.dlItem} onClick={() => onEnqueue(unreadNotDl.map((c) => c.id))}>
        <span>Unread chapters</span>
        <span className={s.dlItemSub}>{unreadNotDl.length} remaining</span>
      </button>
      <button className={s.dlItem} onClick={() => onEnqueue(allNotDl.map((c) => c.id))}>
        <span>Download all</span>
        <span className={s.dlItemSub}>{allNotDl.length} not yet downloaded</span>
      </button>

      {downloadedCount > 0 && (
        <>
          <div className={s.dlDivider} />
          <button
            className={[s.dlItem, s.dlItemDanger].join(" ")}
            onClick={onDelete}
            disabled={deletingAll}
          >
            <span>{deletingAll ? "Deleting…" : "Delete all downloads"}</span>
            <span className={s.dlItemSub}>{downloadedCount} downloaded</span>
          </button>
        </>
      )}
    </div>
  );
}

// ── Folder picker ─────────────────────────────────────────────────────────────

function FolderPicker({ mangaId }: { mangaId: number }) {
  const [open, setOpen]         = useState(false);
  const [newName, setNewName]   = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const folders               = useStore((st) => st.settings.folders);
  const assignMangaToFolder   = useStore((st) => st.assignMangaToFolder);
  const removeMangaFromFolder = useStore((st) => st.removeMangaFromFolder);
  const addFolder             = useStore((st) => st.addFolder);

  const assigned    = folders.filter((f) => f.mangaIds.includes(mangaId));
  const hasAssigned = assigned.length > 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const id = addFolder(name);
    assignMangaToFolder(id, mangaId);
    setNewName("");
    setCreating(false);
  }

  return (
    <div className={s.folderPickerWrap} ref={ref}>
      <button
        className={[s.folderPickerBtn, hasAssigned ? s.folderPickerBtnActive : ""].join(" ")}
        onClick={() => setOpen((p) => !p)}
        title={hasAssigned ? `Folders: ${assigned.map((f) => f.name).join(", ")}` : "Add to folder"}
      >
        <FolderSimplePlus size={14} weight={hasAssigned ? "fill" : "light"} />
      </button>

      {open && (
        <div className={s.folderPickerMenu}>
          {folders.length === 0 && !creating && (
            <p className={s.folderPickerEmpty}>No folders yet</p>
          )}
          {folders.map((folder) => {
            const isIn = folder.mangaIds.includes(mangaId);
            return (
              <button
                key={folder.id}
                className={[s.folderPickerItem, isIn ? s.folderPickerItemActive : ""].join(" ")}
                onClick={() =>
                  isIn
                    ? removeMangaFromFolder(folder.id, mangaId)
                    : assignMangaToFolder(folder.id, mangaId)
                }
              >
                <span className={s.folderPickerItemCheck}>{isIn ? "✓" : ""}</span>
                {folder.name}
              </button>
            );
          })}
          <div className={s.folderPickerDivider} />
          {creating ? (
            <div className={s.folderPickerCreate}>
              <input
                autoFocus
                className={s.folderPickerInput}
                placeholder="Folder name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreating(false); setNewName(""); }
                }}
              />
              <button className={s.folderPickerConfirm} onClick={handleCreate} disabled={!newName.trim()}>
                Add
              </button>
              <button className={s.folderPickerCancel} onClick={() => { setCreating(false); setNewName(""); }}>
                <X size={12} weight="light" />
              </button>
            </div>
          ) : (
            <button className={s.folderPickerNewBtn} onClick={() => setCreating(true)}>
              + New folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SeriesDetail() {
  const activeManga         = useStore((state) => state.activeManga);
  const setActiveManga      = useStore((state) => state.setActiveManga);
  const openReader          = useStore((state) => state.openReader);
  const settings            = useStore((state) => state.settings);
  const updateSettings      = useStore((state) => state.updateSettings);
  const addToast            = useStore((state) => state.addToast);
  const setLibraryTagFilter = useStore((state) => state.setLibraryTagFilter);
  const setLibraryFilter    = useStore((state) => state.setLibraryFilter);

  const [manga, setManga]                   = useState<Manga | null>(activeManga);
  const [chapters, setChapters]             = useState<Chapter[]>([]);
  const [loadingManga, setLoadingManga]     = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [enqueueing, setEnqueueing]         = useState<Set<number>>(new Set());
  const [dlOpen, setDlOpen]                 = useState(false);
  const [detailsOpen, setDetailsOpen]       = useState(false);
  const [migrateOpen, setMigrateOpen]       = useState(false);
  const [togglingLibrary, setTogglingLibrary] = useState(false);
  const [chapterPage, setChapterPage]       = useState(1);
  const [ctx, setCtx]                       = useState<CtxState | null>(null);
  const [jumpOpen, setJumpOpen]             = useState(false);
  const [jumpInput, setJumpInput]           = useState("");
  const [viewMode, setViewMode]             = useState<"list" | "grid">("list");
  const [deletingAll, setDeletingAll]       = useState(false);
  const [refreshing, setRefreshing]         = useState(false);
  const [descExpanded, setDescExpanded]     = useState(false);
  const [genresExpanded, setGenresExpanded] = useState(false);

  const sortDir = settings.chapterSortDir;

  // Load extended manga details
  useEffect(() => {
    if (!activeManga) return;
    setLoadingManga(true);
    gql<{ manga: Manga }>(GET_MANGA, { id: activeManga.id })
      .then((data) => setManga(data.manga))
      .catch(console.error)
      .finally(() => setLoadingManga(false));
  }, [activeManga?.id]);

  const loadChapters = useCallback((mangaId: number) => {
    return gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId })
      .then((data) => {
        const sorted = [...data.chapters.nodes].sort((a, b) => a.sourceOrder - b.sourceOrder);
        setChapters(sorted);
        return sorted;
      });
  }, []);

  // Load chapters: show cache immediately, then silently refresh from source
  useEffect(() => {
    if (!activeManga) return;
    setLoadingChapters(true);
    setChapters([]);
    setChapterPage(1);

    loadChapters(activeManga.id)
      .then((cached) =>
        gql(FETCH_CHAPTERS, { mangaId: activeManga.id })
          .then(() => loadChapters(activeManga.id))
          .then((fresh) => {
            // Suppress no-op: if count unchanged the state is already correct
            void (fresh.length === cached.length);
          })
          .catch(console.error)
      )
      .catch(console.error)
      .finally(() => setLoadingChapters(false));
  }, [activeManga?.id]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const sortedChapters = useMemo(() =>
    sortDir === "desc" ? [...chapters].reverse() : [...chapters],
    [chapters, sortDir]
  );

  const totalPages    = Math.ceil(sortedChapters.length / CHAPTERS_PER_PAGE);
  const pageChapters  = sortedChapters.slice(
    (chapterPage - 1) * CHAPTERS_PER_PAGE,
    chapterPage * CHAPTERS_PER_PAGE
  );
  const readCount      = chapters.filter((c) => c.isRead).length;
  const totalCount     = chapters.length;
  const progressPct    = totalCount > 0 ? (readCount / totalCount) * 100 : 0;
  const downloadedCount = chapters.filter((c) => c.isDownloaded).length;

  const continueChapter = useMemo(() => {
    if (!chapters.length) return null;
    const asc = [...chapters].sort((a, b) => a.sourceOrder - b.sourceOrder);
    const anyRead    = asc.some((c) => c.isRead);
    const inProgress = asc.find((c) => !c.isRead && (c.lastPageRead ?? 0) > 0);
    if (inProgress) return { chapter: inProgress, type: "continue" as const };
    const firstUnread = asc.find((c) => !c.isRead);
    if (firstUnread) return { chapter: firstUnread, type: anyRead ? "continue" : "start" as const };
    return { chapter: asc[0], type: "reread" as const };
  }, [chapters]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function toggleLibrary() {
    if (!manga) return;
    setTogglingLibrary(true);
    const next = !manga.inLibrary;
    await gql(UPDATE_MANGA, { id: manga.id, inLibrary: next }).catch(console.error);
    setManga((prev) => prev ? { ...prev, inLibrary: next } : prev);
    setTogglingLibrary(false);
  }

  async function enqueue(chapter: Chapter, e: React.MouseEvent) {
    e.stopPropagation();
    setEnqueueing((prev) => new Set(prev).add(chapter.id));
    await gql(ENQUEUE_DOWNLOAD, { chapterId: chapter.id }).catch(console.error);
    addToast({ kind: "download", title: "Download queued", body: chapter.name });
    setEnqueueing((prev) => { const n = new Set(prev); n.delete(chapter.id); return n; });
    if (activeManga) loadChapters(activeManga.id);
  }

  async function enqueueMultiple(chapterIds: number[]) {
    if (!chapterIds.length) return;
    await gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds }).catch(console.error);
    addToast({
      kind: "download",
      title: "Download queued",
      body: `${chapterIds.length} chapter${chapterIds.length !== 1 ? "s" : ""} added to queue`,
    });
    if (activeManga) loadChapters(activeManga.id);
  }

  async function markRead(chapterId: number, isRead: boolean) {
    await gql(MARK_CHAPTER_READ, { id: chapterId, isRead }).catch(console.error);
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, isRead } : c));
  }

  async function markBulk(ids: number[], isRead: boolean) {
    if (!ids.length) return;
    await gql(MARK_CHAPTERS_READ, { ids, isRead }).catch(console.error);
    setChapters((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, isRead } : c));
  }

  const markAllAboveRead    = (i: number) =>
    markBulk(sortedChapters.slice(0, i + 1).filter((c) => !c.isRead).map((c) => c.id), true);
  const markAllBelowRead    = (i: number) =>
    markBulk(sortedChapters.slice(i).filter((c) => !c.isRead).map((c) => c.id), true);
  const markAllAboveUnread  = (i: number) =>
    markBulk(sortedChapters.slice(0, i + 1).filter((c) => c.isRead).map((c) => c.id), false);
  const markAllBelowUnread  = (i: number) =>
    markBulk(sortedChapters.slice(i).filter((c) => c.isRead).map((c) => c.id), false);

  async function deleteDownloaded(chapterId: number) {
    await gql(DELETE_DOWNLOADED_CHAPTERS, { ids: [chapterId] }).catch(console.error);
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, isDownloaded: false } : c));
  }

  async function deleteAllDownloads() {
    const ids = chapters.filter((c) => c.isDownloaded).map((c) => c.id);
    if (!ids.length) return;
    setDeletingAll(true);
    await gql(DELETE_DOWNLOADED_CHAPTERS, { ids }).catch(console.error);
    setChapters((prev) => prev.map((c) => ({ ...c, isDownloaded: false })));
    setDeletingAll(false);
  }

  async function refreshChapters() {
    if (!activeManga || refreshing) return;
    setRefreshing(true);
    await gql(FETCH_CHAPTERS, { mangaId: activeManga.id })
      .then(() => loadChapters(activeManga.id))
      .then(() => addToast({ kind: "success", title: "Chapters refreshed" }))
      .catch((e) => addToast({ kind: "error", title: "Refresh failed", body: e?.message ?? String(e) }))
      .finally(() => setRefreshing(false));
  }

  // ── FIX: restored missing function declaration ─────────────────────────────
  function openContextMenu(e: React.MouseEvent, chapter: Chapter, indexInSorted: number) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, chapter, indexInSorted });
  }

  function buildCtxItems(ch: Chapter, indexInSorted: number): ContextMenuEntry[] {
    const aboveItems  = sortedChapters.slice(0, indexInSorted + 1);
    const belowItems  = sortedChapters.slice(indexInSorted);
    const unreadAbove = aboveItems.filter((c) => !c.isRead).length;
    const unreadBelow = belowItems.filter((c) => !c.isRead).length;
    const readAbove   = aboveItems.filter((c) => c.isRead).length;
    const readBelow   = belowItems.filter((c) => c.isRead).length;
    const lastIdx     = sortedChapters.length - 1;

    return [
      {
        label: ch.isRead ? "Mark as unread" : "Mark as read",
        icon: ch.isRead ? <Circle size={13} weight="light" /> : <CheckCircle size={13} weight="light" />,
        onClick: () => markRead(ch.id, !ch.isRead),
      },
      { separator: true },
      {
        label: "Mark above as read",
        icon: <CheckCircle size={13} weight="duotone" />,
        onClick: () => markAllAboveRead(indexInSorted),
        disabled: indexInSorted === 0 || unreadAbove === 0,
      },
      {
        label: "Mark above as unread",
        icon: <Circle size={13} weight="duotone" />,
        onClick: () => markAllAboveUnread(indexInSorted),
        disabled: indexInSorted === 0 || readAbove === 0,
      },
      { separator: true },
      {
        label: "Mark below as read",
        icon: <CheckCircle size={13} weight="duotone" />,
        onClick: () => markAllBelowRead(indexInSorted),
        disabled: indexInSorted === lastIdx || unreadBelow === 0,
      },
      {
        label: "Mark below as unread",
        icon: <Circle size={13} weight="duotone" />,
        onClick: () => markAllBelowUnread(indexInSorted),
        disabled: indexInSorted === lastIdx || readBelow === 0,
      },
      { separator: true },
      {
        label: ch.isDownloaded ? "Delete download" : "Download",
        icon: ch.isDownloaded ? <Trash size={13} weight="light" /> : <Download size={13} weight="light" />,
        onClick: () => ch.isDownloaded
          ? deleteDownloaded(ch.id)
          : gql(ENQUEUE_DOWNLOAD, { chapterId: ch.id }).catch(console.error),
        danger: ch.isDownloaded,
      },
      { separator: true },
      {
        label: "Download next 5 from here",
        icon: <DownloadSimple size={13} weight="light" />,
        onClick: () => {
          const ids = sortedChapters
            .slice(indexInSorted, indexInSorted + 5)
            .filter((c) => !c.isDownloaded)
            .map((c) => c.id);
          enqueueMultiple(ids);
        },
      },
      {
        label: "Download all from here",
        icon: <DownloadSimple size={13} weight="light" />,
        onClick: () => {
          const ids = sortedChapters
            .slice(indexInSorted)
            .filter((c) => !c.isDownloaded)
            .map((c) => c.id);
          enqueueMultiple(ids);
        },
      },
    ];
  }

  // ── Early exit ─────────────────────────────────────────────────────────────

  if (!activeManga) return null;

  const statusLabel = manga?.status
    ? manga.status.charAt(0) + manga.status.slice(1).toLowerCase()
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={s.root} onContextMenu={(e) => e.preventDefault()}>

      {/* ── Sidebar ── */}
      <div className={s.sidebar}>
        <button className={s.back} onClick={() => setActiveManga(null)}>
          <ArrowLeft size={13} weight="light" />
          <span>Library</span>
        </button>

        <div className={s.coverWrap}>
          <img src={thumbUrl(activeManga.thumbnailUrl)} alt={activeManga.title} className={s.cover} />
        </div>

        {loadingManga ? (
          <div className={s.metaSkeleton}>
            <div className={["skeleton", s.skLine].join(" ")} style={{ width: "90%", height: 14 }} />
            <div className={["skeleton", s.skLine].join(" ")} style={{ width: "60%", height: 11 }} />
          </div>
        ) : (
          <div className={s.meta}>
            <p className={s.title}>{manga?.title}</p>

            {(manga?.author || manga?.artist) && (
              <p className={s.byline}>
                {[manga.author, manga.artist]
                  .filter(Boolean)
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(" · ")}
              </p>
            )}

            {statusLabel && (
              <span className={[
                s.statusBadge,
                manga?.status === "ONGOING" ? s.statusOngoing : s.statusEnded,
              ].join(" ").trim()}>
                {statusLabel}
              </span>
            )}

            {manga?.genre && manga.genre.length > 0 && (
              <div className={s.genres}>
                {(genresExpanded ? manga.genre : manga.genre.slice(0, 5)).map((g) => (
                  <button
                    key={g}
                    className={[s.genre, s.genreClickable].join(" ")}
                    title={`Filter library by "${g}"`}
                    onClick={() => {
                      setLibraryTagFilter([g]);
                      setLibraryFilter("library");
                      setActiveManga(null);
                    }}
                  >
                    {g}
                  </button>
                ))}
                {manga.genre.length > 5 && (
                  <button className={s.genreToggle} onClick={() => setGenresExpanded((p) => !p)}>
                    {genresExpanded ? "less" : `+${manga.genre.length - 5}`}
                  </button>
                )}
              </div>
            )}

            {manga?.description && (
              <div className={s.descriptionWrap}>
                <p className={[s.description, descExpanded ? s.descriptionExpanded : ""].join(" ")}>
                  {manga.description}
                </p>
                {manga.description.length > 120 && (
                  <button className={s.descToggle} onClick={() => setDescExpanded((p) => !p)}>
                    {descExpanded ? "Less" : "More"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        {totalCount > 0 && (
          <div className={s.progressSection}>
            <div className={s.progressHeader}>
              <span className={s.progressLabel}>{readCount} / {totalCount} read</span>
              <span className={s.progressPct}>{Math.round(progressPct)}%</span>
            </div>
            <div className={s.progressTrack}>
              <div className={s.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        <div className={s.actions}>
          <button
            className={[s.libraryBtn, manga?.inLibrary ? s.libraryBtnActive : ""].join(" ").trim()}
            onClick={toggleLibrary}
            disabled={togglingLibrary || loadingManga}
          >
            <BookmarkSimple size={13} weight={manga?.inLibrary ? "fill" : "light"} />
            {manga?.inLibrary ? "In Library" : "Add to Library"}
          </button>

          {manga?.realUrl && (
            <a href={manga.realUrl} target="_blank" rel="noreferrer" className={s.externalLink}>
              <ArrowSquareOut size={13} weight="light" />
            </a>
          )}
        </div>

        {continueChapter && (
          <button
            className={s.readBtn}
            onClick={() => openReader(continueChapter.chapter, sortedChapters)}
          >
            <Play size={12} weight="fill" />
            {continueChapter.type === "continue"
              ? `Continue · Ch.${continueChapter.chapter.chapterNumber}${
                  (continueChapter.chapter.lastPageRead ?? 0) > 0
                    ? ` p.${continueChapter.chapter.lastPageRead}`
                    : ""
                }`
              : continueChapter.type === "reread"
              ? "Read again"
              : "Start reading"
            }
          </button>
        )}

        <p className={s.chapterCount}>
          {totalCount} {totalCount === 1 ? "chapter" : "chapters"}
          {readCount > 0 && ` · ${readCount} read`}
        </p>

        {/* Quick mark-all */}
        {totalCount > 0 && (
          <div className={s.markAllRow}>
            <button
              className={s.markAllBtn}
              onClick={() => markAllAboveRead(sortedChapters.length - 1)}
              disabled={readCount === totalCount}
              title="Mark all chapters as read"
            >
              <CheckCircle size={12} weight="light" />
              All read
            </button>
            <button
              className={s.markAllBtn}
              onClick={() => markAllAboveUnread(sortedChapters.length - 1)}
              disabled={readCount === 0}
              title="Mark all chapters as unread"
            >
              <Circle size={12} weight="light" />
              All unread
            </button>
          </div>
        )}

        {/* Details (collapsible) */}
        {!loadingManga && manga?.source && (
          <div className={s.detailsSection}>
            <button className={s.detailsToggle} onClick={() => setDetailsOpen((p) => !p)}>
              <span>Details</span>
              <CaretDown size={11} weight="light" className={detailsOpen ? s.caretOpen : s.caretClosed} />
            </button>
            {detailsOpen && (
              <div className={s.detailsBody}>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>Source</span>
                  <span className={s.detailVal}>{manga.source.displayName}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>Language</span>
                  <span className={s.detailVal}>{manga.source.name.match(/\(([^)]+)\)$/)?.[1] ?? "—"}</span>
                </div>
                <div className={s.detailRow}>
                  <span className={s.detailKey}>Source ID</span>
                  <span className={[s.detailVal, s.detailMono].join(" ")}>{manga.source.id}</span>
                </div>
                <button className={s.migrateBtn} onClick={() => setMigrateOpen(true)}>
                  <ArrowsClockwise size={12} weight="light" />
                  Switch source
                </button>
                {downloadedCount > 0 && (
                  <button
                    className={s.deleteAllBtn}
                    onClick={deleteAllDownloads}
                    disabled={deletingAll}
                  >
                    <Trash size={12} weight="light" />
                    {deletingAll ? "Deleting…" : `Delete all downloads (${downloadedCount})`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Chapter list ── */}
      <div className={s.listWrap}>
        <div className={s.listHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <button
              className={s.sortBtn}
              onClick={() => {
                updateSettings({ chapterSortDir: sortDir === "desc" ? "asc" : "desc" });
                setChapterPage(1);
              }}
              title={sortDir === "desc" ? "Newest first" : "Oldest first"}
            >
              {sortDir === "desc"
                ? <SortDescending size={14} weight="light" />
                : <SortAscending size={14} weight="light" />
              }
              <span>{sortDir === "desc" ? "Newest first" : "Oldest first"}</span>
            </button>

            <button
              className={[s.viewToggleBtn, viewMode === "grid" ? s.viewToggleActive : ""].join(" ")}
              onClick={() => setViewMode((v) => v === "list" ? "grid" : "list")}
              title={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}
            >
              {viewMode === "list"
                ? <SquaresFour size={14} weight="light" />
                : <List size={14} weight="light" />
              }
            </button>
          </div>

          <div className={s.listHeaderRight}>
            <button
              className={s.viewToggleBtn}
              onClick={refreshChapters}
              disabled={refreshing}
              title="Refresh chapters from source"
            >
              <ArrowsClockwise size={14} weight="light" className={refreshing ? "anim-spin" : ""} />
            </button>
            {activeManga && <FolderPicker mangaId={activeManga.id} />}

            {/* Jump to chapter */}
            {chapters.length > 1 && (
              <div className={s.jumpWrap}>
                {!jumpOpen ? (
                  <button className={s.jumpToggle} onClick={() => { setJumpOpen(true); setJumpInput(""); }}>
                    Go to…
                  </button>
                ) : (
                  <div className={s.jumpRow}>
                    <input
                      className={s.jumpInput}
                      type="text"
                      placeholder="Ch. #"
                      value={jumpInput}
                      autoFocus
                      onChange={(e) => setJumpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setJumpOpen(false); return; }
                        if (e.key === "Enter") {
                          const num = parseFloat(jumpInput);
                          if (!isNaN(num)) {
                            const target = sortedChapters.find((c) => c.chapterNumber === num)
                              ?? sortedChapters.reduce((best, c) =>
                                Math.abs(c.chapterNumber - num) < Math.abs(best.chapterNumber - num) ? c : best
                              , sortedChapters[0]);
                            if (target) openReader(target, sortedChapters);
                          }
                          setJumpOpen(false);
                        }
                      }}
                    />
                    <button className={s.jumpCancel} onClick={() => setJumpOpen(false)}>✕</button>
                  </div>
                )}
              </div>
            )}

            {/* Download menu */}
            {chapters.length > 0 && (
              <div className={s.dlWrap}>
                <button className={s.dlToggleBtn} onClick={() => setDlOpen((p) => !p)}>
                  <Download size={13} weight="light" />
                </button>
                {dlOpen && (
                  <DownloadDropdown
                    sortedChapters={sortedChapters}
                    continueChapter={continueChapter}
                    downloadedCount={downloadedCount}
                    deletingAll={deletingAll}
                    onEnqueue={(ids) => { enqueueMultiple(ids); setDlOpen(false); }}
                    onDelete={() => { deleteAllDownloads(); setDlOpen(false); }}
                    onClose={() => setDlOpen(false)}
                  />
                )}
              </div>
            )}

            {totalPages > 1 && (
              <div className={s.pagination}>
                <button
                  className={s.pageBtn}
                  onClick={() => setChapterPage((p) => Math.max(1, p - 1))}
                  disabled={chapterPage === 1}
                >←</button>
                <span className={s.pageNum}>{chapterPage} / {totalPages}</span>
                <button
                  className={s.pageBtn}
                  onClick={() => setChapterPage((p) => Math.min(totalPages, p + 1))}
                  disabled={chapterPage === totalPages}
                >→</button>
              </div>
            )}
          </div>
        </div>

        <div className={viewMode === "grid" ? s.grid : s.list}>
          {loadingChapters && chapters.length === 0 ? (
            viewMode === "grid" ? (
              Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className={s.gridCellSkeleton}>
                  <div className="skeleton" style={{ width: "60%", height: 10, borderRadius: 3 }} />
                </div>
              ))
            ) : (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={s.rowSkeleton}>
                  <div className={["skeleton", s.skLine].join(" ")} style={{ width: "55%", height: 12 }} />
                  <div className={["skeleton", s.skLine].join(" ")} style={{ width: "25%", height: 11 }} />
                </div>
              ))
            )
          ) : viewMode === "grid" ? (
            sortedChapters.map((ch, idxInSorted) => {
              const inProgress = !ch.isRead && (ch.lastPageRead ?? 0) > 0;
              return (
                <button
                  key={ch.id}
                  className={[
                    s.gridCell,
                    ch.isRead ? s.gridCellRead : "",
                    inProgress ? s.gridCellInProgress : "",
                    ch.isBookmarked ? s.gridCellBookmarked : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => openReader(ch, sortedChapters)}
                  onContextMenu={(e) => openContextMenu(e, ch, idxInSorted)}
                  title={ch.name}
                >
                  <span className={s.gridCellNum}>
                    {ch.chapterNumber % 1 === 0
                      ? ch.chapterNumber.toFixed(0)
                      : ch.chapterNumber.toString()}
                  </span>
                  {ch.isRead && <span className={s.gridCellDot} />}
                  {inProgress && <span className={s.gridCellProgress} style={{ width: `${Math.min(100, ((ch.lastPageRead ?? 0) / 1) * 100)}%` }} />}
                  {ch.isBookmarked && <span className={s.gridCellBookmarkDot} />}
                  {enqueueing.has(ch.id) && (
                    <span className={s.gridCellSpinner}>
                      <CircleNotch size={10} weight="light" className="anim-spin" />
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            pageChapters.map((ch) => {
              const idxInSorted = sortedChapters.indexOf(ch);
              return (
                // div instead of button so the nested download/delete buttons are valid HTML
                <div
                  key={ch.id}
                  role="button"
                  tabIndex={0}
                  className={[s.row, ch.isRead ? s.rowRead : ""].join(" ").trim()}
                  onClick={() => openReader(ch, sortedChapters)}
                  onKeyDown={(e) => e.key === "Enter" && openReader(ch, sortedChapters)}
                  onContextMenu={(e) => openContextMenu(e, ch, idxInSorted)}
                >
                  <div className={s.chLeft}>
                    <span className={s.chName}>{ch.name}</span>
                    <div className={s.chMeta}>
                      {ch.scanlator && <span className={s.chMetaItem}>{ch.scanlator}</span>}
                      {ch.uploadDate && <span className={s.chMetaItem}>{formatDate(ch.uploadDate)}</span>}
                      {ch.lastPageRead != null && ch.lastPageRead > 0 && !ch.isRead && (
                        <span className={s.chMetaItem}>p.{ch.lastPageRead}</span>
                      )}
                    </div>
                  </div>

                  <div className={s.chRight}>
                    {ch.isBookmarked && (
                      <BookmarkSimple size={12} weight="fill" className={s.bookmarkIcon} />
                    )}
                    {/* Read indicator — always shown when read */}
                    {ch.isRead && (
                      <CheckCircle size={14} weight="light" className={s.readIcon} />
                    )}
                    {/* Download / status indicator — independent of read state */}
                    {ch.isDownloaded ? (
                      <button
                        className={s.dlBtn}
                        onClick={(e) => { e.stopPropagation(); deleteDownloaded(ch.id); }}
                        title="Delete download"
                      >
                        <Trash size={13} weight="light" />
                      </button>
                    ) : enqueueing.has(ch.id) ? (
                      <CircleNotch size={14} weight="light" className={[s.enqueuingIcon, "anim-spin"].join(" ")} />
                    ) : (
                      <button
                        className={s.dlBtn}
                        onClick={(e) => enqueue(ch, e)}
                        title="Download"
                      >
                        <Download size={13} weight="light" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className={s.paginationBottom}>
            <button
              className={s.pageBtn}
              onClick={() => setChapterPage((p) => Math.max(1, p - 1))}
              disabled={chapterPage === 1}
            >← Prev</button>
            <span className={s.pageNum}>{chapterPage} / {totalPages}</span>
            <button
              className={s.pageBtn}
              onClick={() => setChapterPage((p) => Math.min(totalPages, p + 1))}
              disabled={chapterPage === totalPages}
            >Next →</button>
          </div>
        )}
      </div>

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={buildCtxItems(ctx.chapter, ctx.indexInSorted)}
          onClose={() => setCtx(null)}
        />
      )}

      {migrateOpen && manga && (
        <MigrateModal
          manga={manga}
          currentChapters={chapters}
          onClose={() => setMigrateOpen(false)}
          onMigrated={(newManga: Manga) => {
            setMigrateOpen(false);
            setActiveManga(newManga);
          }}
        />
      )}
    </div>
  );
}