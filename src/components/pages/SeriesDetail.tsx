import { useEffect, useState, useMemo, useCallback } from "react";
import {
  ArrowLeft, BookmarkSimple, Download, CheckCircle,
  ArrowSquareOut, BookOpen, CircleNotch, Play,
  SortAscending, SortDescending, CaretDown, ArrowsClockwise,
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

export default function SeriesDetail() {
  const activeManga     = useStore((state) => state.activeManga);
  const setActiveManga  = useStore((state) => state.setActiveManga);
  const openReader      = useStore((state) => state.openReader);
  const settings        = useStore((state) => state.settings);
  const updateSettings  = useStore((state) => state.updateSettings);

  const [manga, setManga]               = useState<Manga | null>(activeManga);
  const [chapters, setChapters]         = useState<Chapter[]>([]);
  const [loadingManga, setLoadingManga] = useState(true);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [enqueueing, setEnqueueing]     = useState<Set<number>>(new Set());
  const [dlOpen, setDlOpen]             = useState(false);
  const [detailsOpen, setDetailsOpen]   = useState(false);
  const [migrateOpen, setMigrateOpen]   = useState(false);
  const [togglingLibrary, setTogglingLibrary] = useState(false);
  const [chapterPage, setChapterPage]   = useState(1);
  const [ctx, setCtx]                   = useState<CtxState | null>(null);

  const sortDir = settings.chapterSortDir;

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

  useEffect(() => {
    if (!activeManga) return;
    setLoadingChapters(true);
    setChapters([]);
    setChapterPage(1);

    loadChapters(activeManga.id)
      .catch(console.error)
      .finally(() => setLoadingChapters(false));

    gql(FETCH_CHAPTERS, { mangaId: activeManga.id })
      .then(() => loadChapters(activeManga.id))
      .catch(console.error);
  }, [activeManga?.id]);

  const sortedChapters = useMemo(() =>
    sortDir === "desc" ? [...chapters].reverse() : [...chapters],
    [chapters, sortDir]
  );

  const totalPages = Math.ceil(sortedChapters.length / CHAPTERS_PER_PAGE);
  const pageChapters = sortedChapters.slice(
    (chapterPage - 1) * CHAPTERS_PER_PAGE,
    chapterPage * CHAPTERS_PER_PAGE
  );

  const readCount = chapters.filter((c) => c.isRead).length;
  const totalCount = chapters.length;
  const progressPct = totalCount > 0 ? (readCount / totalCount) * 100 : 0;

  const continueChapter = useMemo(() => {
    if (!chapters.length) return null;
    const asc = [...chapters].sort((a, b) => a.sourceOrder - b.sourceOrder);
    const inProgress = asc.find((c) => !c.isRead && (c.lastPageRead ?? 0) > 0);
    if (inProgress) return { chapter: inProgress, type: "continue" as const };
    const firstUnread = asc.find((c) => !c.isRead);
    if (firstUnread) return { chapter: firstUnread, type: "start" as const };
    return { chapter: asc[0], type: "reread" as const };
  }, [chapters]);

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
    setEnqueueing((prev) => { const n = new Set(prev); n.delete(chapter.id); return n; });
    if (activeManga) loadChapters(activeManga.id);
  }

  async function markRead(chapterId: number, isRead: boolean) {
    await gql(MARK_CHAPTER_READ, { id: chapterId, isRead }).catch(console.error);
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, isRead } : c));
  }

  async function markAllAboveRead(indexInSorted: number) {
    const targets = sortedChapters.slice(0, indexInSorted + 1);
    const ids = targets.filter((c) => !c.isRead).map((c) => c.id);
    if (!ids.length) return;
    await gql(MARK_CHAPTERS_READ, { ids, isRead: true }).catch(console.error);
    setChapters((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, isRead: true } : c));
  }

  async function deleteDownloaded(chapterId: number) {
    await gql(DELETE_DOWNLOADED_CHAPTERS, { ids: [chapterId] }).catch(console.error);
    setChapters((prev) => prev.map((c) => c.id === chapterId ? { ...c, isDownloaded: false } : c));
  }

  async function enqueueMultiple(chapterIds: number[]) {
    await gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds }).catch(console.error);
    if (activeManga) loadChapters(activeManga.id);
  }

  function openContextMenu(e: React.MouseEvent, chapter: Chapter, indexInSorted: number) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, chapter, indexInSorted });
  }

  function buildCtxItems(ch: Chapter, indexInSorted: number): ContextMenuEntry[] {
    return [
      {
        label: ch.isRead ? "Mark as unread" : "Mark as read",
        onClick: () => markRead(ch.id, !ch.isRead),
      },
      {
        label: "Mark all above as read",
        onClick: () => markAllAboveRead(indexInSorted),
        disabled: indexInSorted === 0,
      },
      { separator: true },
      {
        label: ch.isDownloaded ? "Delete download" : "Download",
        onClick: () => ch.isDownloaded
          ? deleteDownloaded(ch.id)
          : gql(ENQUEUE_DOWNLOAD, { chapterId: ch.id }).catch(console.error),
        danger: ch.isDownloaded,
      },
      { separator: true },
      {
        label: "Download all from here",
        onClick: () => {
          const fromHere = sortedChapters
            .slice(indexInSorted)
            .filter((c) => !c.isDownloaded)
            .map((c) => c.id);
          enqueueMultiple(fromHere);
        },
      },
    ];
  }

  if (!activeManga) return null;

  const statusLabel = manga?.status
    ? manga.status.charAt(0) + manga.status.slice(1).toLowerCase()
    : null;

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
              <span className={[s.statusBadge, manga?.status === "ONGOING" ? s.statusOngoing : s.statusEnded].join(" ").trim()}>
                {statusLabel}
              </span>
            )}

            {manga?.genre && manga.genre.length > 0 && (
              <div className={s.genres}>
                {manga.genre.map((g) => <span key={g} className={s.genre}>{g}</span>)}
              </div>
            )}

            {manga?.description && <p className={s.description}>{manga.description}</p>}
          </div>
        )}

        {/* Progress bar */}
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

        {chapters.length > 0 && (
          <div className={s.downloadSection}>
            <button className={s.downloadToggle} onClick={() => setDlOpen((p) => !p)}>
              <Download size={13} weight="light" />
              Download
            </button>
            {dlOpen && (
              <div className={s.downloadMenu}>
                {continueChapter && (
                  <button className={s.dlItem}
                    onClick={() => {
                      const from = sortedChapters.indexOf(continueChapter.chapter);
                      const ids = sortedChapters.slice(from).filter((c) => !c.isDownloaded).map((c) => c.id);
                      enqueueMultiple(ids);
                      setDlOpen(false);
                    }}>
                    <span>From current</span>
                    <span className={s.dlItemSub}>Ch.{continueChapter.chapter.chapterNumber} onwards</span>
                  </button>
                )}
                <button className={s.dlItem}
                  onClick={() => {
                    const ids = sortedChapters.filter((c) => !c.isRead && !c.isDownloaded).map((c) => c.id);
                    enqueueMultiple(ids);
                    setDlOpen(false);
                  }}>
                  <span>Unread chapters</span>
                  <span className={s.dlItemSub}>{sortedChapters.filter((c) => !c.isRead && !c.isDownloaded).length} remaining</span>
                </button>
                <button className={s.dlItem}
                  onClick={() => {
                    const ids = sortedChapters.filter((c) => !c.isDownloaded).map((c) => c.id);
                    enqueueMultiple(ids);
                    setDlOpen(false);
                  }}>
                  <span>Download all</span>
                  <span className={s.dlItemSub}>{sortedChapters.filter((c) => !c.isDownloaded).length} not downloaded</span>
                </button>
              </div>
            )}
          </div>
        )}

        <p className={s.chapterCount}>
          {totalCount} {totalCount === 1 ? "chapter" : "chapters"}
        </p>

        {/* ── Details (collapsible) ── */}
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
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Chapter list ── */}
      <div className={s.listWrap}>
        <div className={s.listHeader}>
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

        <div className={s.list}>
          {loadingChapters && chapters.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={s.rowSkeleton}>
                <div className={["skeleton", s.skLine].join(" ")} style={{ width: "55%", height: 12 }} />
                <div className={["skeleton", s.skLine].join(" ")} style={{ width: "25%", height: 11 }} />
              </div>
            ))
          ) : (
            pageChapters.map((ch) => {
              const idxInSorted = sortedChapters.indexOf(ch);
              return (
                <button
                  key={ch.id}
                  className={[s.row, ch.isRead ? s.rowRead : ""].join(" ").trim()}
                  onClick={() => openReader(ch, sortedChapters)}
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
                    {ch.isRead ? (
                      <CheckCircle size={14} weight="light" className={s.readIcon} />
                    ) : ch.isDownloaded ? (
                      <BookOpen size={14} weight="light" className={s.downloadedIcon} />
                    ) : enqueueing.has(ch.id) ? (
                      <CircleNotch size={14} weight="light" className={[s.enqueuingIcon, "anim-spin"].join(" ")} />
                    ) : (
                      <button className={s.dlBtn} onClick={(e) => enqueue(ch, e)} title="Download">
                        <Download size={13} weight="light" />
                      </button>
                    )}
                  </div>
                </button>
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
          onMigrated={(newManga) => {
            setMigrateOpen(false);
            setActiveManga(newManga);
          }}
        />
      )}
    </div>
  );
}