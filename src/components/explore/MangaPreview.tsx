import { useEffect, useRef, useState, useCallback } from "react";
import {
  X, BookmarkSimple, ArrowSquareOut, Play,
  CircleNotch, Books, CaretDown, FolderSimplePlus, Folder,
} from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import {
  GET_MANGA, GET_CHAPTERS, FETCH_MANGA, FETCH_CHAPTERS, UPDATE_MANGA, ENQUEUE_CHAPTERS_DOWNLOAD,
} from "../../lib/queries";
import { cache, CACHE_KEYS } from "../../lib/cache";
import { useStore } from "../../store";
import type { Manga, Chapter } from "../../lib/types";
import s from "./MangaPreview.module.css";

export default function MangaPreview() {
  const previewManga          = useStore((st) => st.previewManga);
  const setPreviewManga       = useStore((st) => st.setPreviewManga);
  const setActiveManga        = useStore((st) => st.setActiveManga);
  const setNavPage            = useStore((st) => st.setNavPage);
  const openReader            = useStore((st) => st.openReader);
  const addToast              = useStore((st) => st.addToast);
  const folders               = useStore((st) => st.settings.folders);
  const addFolder             = useStore((st) => st.addFolder);
  const assignMangaToFolder   = useStore((st) => st.assignMangaToFolder);
  const removeMangaFromFolder = useStore((st) => st.removeMangaFromFolder);

  const [manga, setManga]                     = useState<Manga | null>(null);
  const [chapters, setChapters]               = useState<Chapter[]>([]);
  const [loadingDetail, setLoadingDetail]     = useState(false);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [togglingLib, setTogglingLib]         = useState(false);
  const [descExpanded, setDescExpanded]       = useState(false);
  const [folderOpen, setFolderOpen]           = useState(false);
  const [newFolderName, setNewFolderName]     = useState("");
  const [creatingFolder, setCreatingFolder]   = useState(false);
  const [queueingAll, setQueueingAll]         = useState(false);
  const [fetchError, setFetchError]           = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);
  const detailAbort = useRef<AbortController | null>(null);
  const chapterAbort = useRef<AbortController | null>(null);
  const folderRef   = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    detailAbort.current?.abort();
    chapterAbort.current?.abort();
    setPreviewManga(null);
    setManga(null);
    setChapters([]);
    setDescExpanded(false);
    setFolderOpen(false);
    setCreatingFolder(false);
    setNewFolderName("");
    setFetchError(null);
  }, [setPreviewManga]);

  // ── Fetch detail + chapters on open ──────────────────────────────────────
  useEffect(() => {
    if (!previewManga) return;

    // Abort any in-flight requests from previous manga
    detailAbort.current?.abort();
    chapterAbort.current?.abort();

    const dCtrl = new AbortController();
    const cCtrl = new AbortController();
    detailAbort.current  = dCtrl;
    chapterAbort.current = cCtrl;

    setManga(null);
    setChapters([]);
    setDescExpanded(false);
    setFetchError(null);
    setLoadingDetail(true);
    setLoadingChapters(true);

    const id = previewManga.id;

    // ── Detail fetch strategy ─────────────────────────────────────────────
    // For source/explore manga we must call FETCH_MANGA (mutation that
    // hits the source and syncs to the local DB). GET_MANGA only works for
    // manga already in the local DB with full metadata.
    //
    // Fast path: if we already cached a full record, use it directly.
    // Slow path: always try FETCH_MANGA first — it never fails for valid IDs
    //   and returns the richest data. Fall back to GET_MANGA if it errors.
    //
    (async (): Promise<Manga> => {
      const cacheKey = CACHE_KEYS.MANGA(id);

      // Already have a cached rich record — no network needed
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey, () =>
          Promise.resolve(previewManga as Manga)
        ) as Promise<Manga>;
      }

      // Try FETCH_MANGA first — works for all manga regardless of whether
      // they are in the local DB yet (it fetches from source and syncs).
      try {
        const d = await gql<{ fetchManga: { manga: Manga } }>(
          FETCH_MANGA, { id }, dCtrl.signal
        );
        return d.fetchManga.manga;
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        // FETCH_MANGA failed (e.g. source offline) — fall back to local DB
        const local = await gql<{ manga: Manga }>(
          GET_MANGA, { id }, dCtrl.signal
        ).then((d) => d.manga);
        if (local) return local;
        throw new Error("Could not load manga details");
      }
    })()
      .then((fullManga) => {
        if (dCtrl.signal.aborted) return;
        // Cache the rich record so re-opening is instant
        if (!cache.has(CACHE_KEYS.MANGA(id))) {
          cache.get(CACHE_KEYS.MANGA(id), () => Promise.resolve(fullManga));
        }
        setManga(fullManga);
        setLoadingDetail(false);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        console.error("MangaPreview detail fetch:", e);
        // Show whatever sparse data we have from previewManga
        setManga(previewManga as Manga);
        setFetchError("Could not load full details — showing cached data");
        setLoadingDetail(false);
      });

    // ── Chapter fetch — local DB first, fall back to source fetch ────────
    gql<{ chapters: { nodes: Chapter[] } }>(
      GET_CHAPTERS, { mangaId: id }, cCtrl.signal
    )
      .then(async (d) => {
        if (cCtrl.signal.aborted) return;
        let nodes = [...d.chapters.nodes].sort((a, b) => a.sourceOrder - b.sourceOrder);
        // If no local chapters yet (explore/source manga), fetch from source
        if (nodes.length === 0) {
          try {
            const fetched = await gql<{ fetchChapters: { chapters: Chapter[] } }>(
              FETCH_CHAPTERS, { mangaId: id }, cCtrl.signal
            );
            if (!cCtrl.signal.aborted)
              nodes = [...fetched.fetchChapters.chapters].sort((a, b) => a.sourceOrder - b.sourceOrder);
          } catch (e: any) {
            if (e?.name === "AbortError") return;
            // Leave nodes empty — not a fatal error
          }
        }
        if (!cCtrl.signal.aborted) setChapters(nodes);
      })
      .catch((e) => { if (e?.name !== "AbortError") console.error(e); })
      .finally(() => { if (!cCtrl.signal.aborted) setLoadingChapters(false); });

    return () => { dCtrl.abort(); cCtrl.abort(); };
  }, [previewManga?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard close ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!previewManga) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewManga, close]);

  // ── Folder outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!folderOpen) return;
    const handler = (e: MouseEvent) => {
      if (folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setFolderOpen(false); setCreatingFolder(false); setNewFolderName("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [folderOpen]);

  if (!previewManga) return null;

  // Always show title/cover from previewManga immediately; upgrade to fetched manga when ready
  const displayManga    = manga ?? previewManga;
  const totalCount      = chapters.length;
  const readCount       = chapters.filter((c) => c.isRead).length;
  const unreadCount     = totalCount - readCount;
  const downloadedCount = chapters.filter((c) => c.isDownloaded).length;
  const bookmarkCount   = chapters.filter((c) => c.isBookmarked).length;
  const inLibrary       = manga?.inLibrary ?? previewManga.inLibrary ?? false;

  // Scanlators — deduplicated, non-empty
  const scanlators = [...new Set(
    chapters.map((c) => c.scanlator).filter((sc): sc is string => !!sc?.trim())
  )];

  // Publication date range from chapter upload dates
  const uploadDates = chapters
    .map((c) => c.uploadDate ? new Date(c.uploadDate).getTime() : null)
    .filter((d): d is number => d !== null && !isNaN(d));
  const firstUpload = uploadDates.length ? new Date(Math.min(...uploadDates)) : null;
  const lastUpload  = uploadDates.length ? new Date(Math.max(...uploadDates)) : null;

  function formatDate(d: Date) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  const statusLabel = displayManga.status
    ? displayManga.status.charAt(0) + displayManga.status.slice(1).toLowerCase()
    : null;

  const continueChapter = (() => {
    if (!chapters.length) return null;
    const asc = [...chapters];
    const inProgress = asc.find((c) => !c.isRead && (c.lastPageRead ?? 0) > 0);
    if (inProgress) return { ch: inProgress, label: `Continue · Ch.${inProgress.chapterNumber}` };
    const firstUnread = asc.find((c) => !c.isRead);
    if (firstUnread) return { ch: firstUnread, label: `Start · Ch.${firstUnread.chapterNumber}` };
    return { ch: asc[0], label: "Read again" };
  })();

  async function toggleLibrary() {
    if (!manga) return;
    setTogglingLib(true);
    const next = !manga.inLibrary;
    await gql(UPDATE_MANGA, { id: manga.id, inLibrary: next }).catch(console.error);
    const updated = { ...manga, inLibrary: next };
    setManga(updated);
    // Update cache so subsequent opens reflect new state
    cache.clear(CACHE_KEYS.MANGA(manga.id));
    cache.get(CACHE_KEYS.MANGA(manga.id), () => Promise.resolve(updated));
    cache.clear(CACHE_KEYS.LIBRARY);
    setTogglingLib(false);
    addToast({ kind: "success", title: next ? "Added to library" : "Removed from library" });
  }

  async function downloadAll() {
    const ids = chapters.filter((c) => !c.isDownloaded && !c.isRead).map((c) => c.id);
    if (!ids.length) return;
    setQueueingAll(true);
    await gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: ids }).catch(console.error);
    addToast({ kind: "download", title: "Downloading", body: `${ids.length} chapters queued` });
    setQueueingAll(false);
  }

  function openSeriesDetail() {
    setActiveManga(displayManga);
    setNavPage("library");
    close();
  }

  function handleFolderCreate() {
    const name = newFolderName.trim();
    if (!name || !previewManga) return;
    const newId = addFolder(name);
    assignMangaToFolder(newId, previewManga.id);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  const assignedFolders = folders.filter((f) => f.mangaIds.includes(previewManga.id));

  return (
    <div
      className={s.backdrop}
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) close(); }}
    >
      <div className={s.modal} role="dialog" aria-label="Manga preview">

        {/* ── Cover column ── */}
        <div className={s.coverCol}>
          <div className={s.coverWrap}>
            <img
              src={thumbUrl(previewManga.thumbnailUrl)}
              alt={displayManga.title}
              className={s.cover}
            />
            {loadingDetail && (
              <div className={s.coverSpinner}>
                <CircleNotch size={18} weight="light" className="anim-spin" />
              </div>
            )}
          </div>

          <div className={s.coverActions}>
            <button
              className={[s.actionBtn, inLibrary ? s.actionBtnActive : ""].join(" ")}
              onClick={toggleLibrary}
              disabled={togglingLib || loadingDetail}
            >
              <BookmarkSimple size={13} weight={inLibrary ? "fill" : "light"} />
              {togglingLib ? "…" : inLibrary ? "In Library" : "Add to Library"}
            </button>

            <button className={s.actionBtn} onClick={openSeriesDetail}>
              <Books size={13} weight="light" />
              Series Detail
            </button>

            {/* Folder picker */}
            <div className={s.folderWrap} ref={folderRef}>
              <button
                className={[s.actionBtn, assignedFolders.length > 0 ? s.actionBtnFolder : ""].join(" ")}
                onClick={() => setFolderOpen((p) => !p)}
              >
                <FolderSimplePlus size={13} weight={assignedFolders.length > 0 ? "fill" : "light"} />
                <span className={s.actionBtnLabel}>
                  {assignedFolders.length > 0 ? assignedFolders.map((f) => f.name).join(", ") : "Add to folder"}
                </span>
              </button>

              {folderOpen && (
                <div className={s.folderMenu}>
                  {folders.length === 0 && !creatingFolder && (
                    <p className={s.folderEmpty}>No folders yet</p>
                  )}
                  {folders.map((f) => {
                    const isIn = f.mangaIds.includes(previewManga.id);
                    return (
                      <button key={f.id}
                        className={[s.folderItem, isIn ? s.folderItemOn : ""].join(" ")}
                        onClick={() => isIn
                          ? removeMangaFromFolder(f.id, previewManga.id)
                          : assignMangaToFolder(f.id, previewManga.id)}
                      >
                        <Folder size={12} weight={isIn ? "fill" : "light"} />
                        {isIn ? "✓ " : ""}{f.name}
                      </button>
                    );
                  })}
                  <div className={s.folderDivider} />
                  {creatingFolder ? (
                    <div className={s.folderCreateRow}>
                      <input autoFocus className={s.folderInput} placeholder="Folder name…"
                        value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleFolderCreate();
                          if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                        }}
                      />
                      <button className={s.folderOkBtn} onClick={handleFolderCreate} disabled={!newFolderName.trim()}>Add</button>
                    </div>
                  ) : (
                    <button className={s.folderNewBtn} onClick={() => setCreatingFolder(true)}>+ New folder</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Content column ── */}
        <div className={s.content}>

          {/* Header — title visible immediately from previewManga */}
          <div className={s.contentHeader}>
            <div className={s.titleBlock}>
              <h2 className={s.title}>{displayManga.title}</h2>
              {loadingDetail
                ? <div className={s.skByline} />
                : (displayManga.author || displayManga.artist)
                  ? <p className={s.byline}>
                      {[displayManga.author, displayManga.artist]
                        .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
                    </p>
                  : null}
            </div>
            <button className={s.closeBtn} onClick={close}><X size={15} weight="light" /></button>
          </div>

          {/* Scrollable body */}
          <div className={s.contentBody}>

            {/* Error banner */}
            {fetchError && (
              <div className={s.errorBanner}>{fetchError}</div>
            )}

            {/* ── Badges ── */}
            {loadingDetail ? (
              <div className={s.skRow}>
                <div className={s.skBadge} />
                <div className={s.skBadge} style={{ width: 72 }} />
              </div>
            ) : (
              <div className={s.badges}>
                {statusLabel && (
                  <span className={[s.badge,
                    displayManga.status === "ONGOING" ? s.badgeGreen : s.badgeDim
                  ].join(" ")}>{statusLabel}</span>
                )}
                {displayManga.source && (
                  <span className={[s.badge, (displayManga.source as any).isNsfw ? s.badgeNsfw : ""].join(" ").trim()}>
                    {displayManga.source.displayName}{(displayManga.source as any).isNsfw ? " · 18+" : ""}
                  </span>
                )}
                {inLibrary && <span className={[s.badge, s.badgeAccent].join(" ")}>In Library</span>}
                {!loadingChapters && unreadCount > 0 && (
                  <span className={[s.badge, s.badgeUnread].join(" ")}>{unreadCount} unread</span>
                )}
                {!loadingChapters && bookmarkCount > 0 && (
                  <span className={s.badge}>{bookmarkCount} bookmarked</span>
                )}
              </div>
            )}

            {/* ── Chapter section — visually separated box ── */}
            <div className={s.chapterBox}>
              {loadingChapters ? (
                <div className={s.chapterLoading}>
                  <CircleNotch size={13} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
                  <span className={s.chapterLoadingLabel}>Loading chapters…</span>
                </div>
              ) : totalCount > 0 ? (
                <>
                  <div className={s.chapterMeta}>
                    <span className={s.chapterLabel}>
                      {totalCount} {totalCount === 1 ? "chapter" : "chapters"}
                      {readCount > 0 && ` · ${readCount} read`}
                      {unreadCount > 0 && readCount > 0 && ` · ${unreadCount} left`}
                      {downloadedCount > 0 && ` · ${downloadedCount} dl`}
                    </span>
                    {unreadCount > 0 && (
                      <button className={s.dlAllBtn} onClick={downloadAll} disabled={queueingAll}>
                        {queueingAll && <CircleNotch size={11} weight="light" className="anim-spin" />}
                        {queueingAll ? "Queuing…" : "Download unread"}
                      </button>
                    )}
                  </div>
                  {readCount > 0 && (
                    <div className={s.progressTrack}>
                      <div className={s.progressFill} style={{ width: `${(readCount / totalCount) * 100}%` }} />
                    </div>
                  )}
                  {continueChapter && (
                    <button className={s.readBtn}
                      onClick={() => { openReader(continueChapter.ch, chapters); close(); }}
                    >
                      <Play size={12} weight="fill" />
                      {continueChapter.label}
                    </button>
                  )}
                </>
              ) : !loadingDetail ? (
                <span className={s.chapterLabel} style={{ color: "var(--text-faint)" }}>
                  No chapters in local library
                </span>
              ) : null}
            </div>

            {/* ── Description — clearly separated from chapter block ── */}
            {loadingDetail ? (
              <div className={s.skDesc}>
                <div className={s.skLine} style={{ width: "100%" }} />
                <div className={s.skLine} style={{ width: "88%" }} />
                <div className={s.skLine} style={{ width: "70%" }} />
              </div>
            ) : displayManga.description ? (
              <div className={s.descBlock}>
                <p className={[s.desc, descExpanded ? s.descOpen : ""].join(" ")}>
                  {displayManga.description}
                </p>
                {displayManga.description.length > 220 && (
                  <button className={s.descToggle} onClick={() => setDescExpanded((p) => !p)}>
                    {descExpanded ? "Show less" : "Show more"}
                    <CaretDown size={10} weight="light" style={{
                      transform: descExpanded ? "rotate(180deg)" : "none",
                      transition: "transform 0.15s ease",
                    }} />
                  </button>
                )}
              </div>
            ) : null}

            {/* ── Genre tags ── */}
            {!loadingDetail && displayManga.genre && displayManga.genre.length > 0 && (
              <div className={s.genres}>
                {displayManga.genre.map((g) => <span key={g} className={s.genreTag}>{g}</span>)}
              </div>
            )}

            {/* ── Metadata table ── */}
            {!loadingDetail && (
              <div className={s.metaTable}>
                {displayManga.author && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Author</span>
                    <span className={s.metaVal}>{displayManga.author}</span>
                  </div>
                )}
                {displayManga.artist && displayManga.artist !== displayManga.author && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Artist</span>
                    <span className={s.metaVal}>{displayManga.artist}</span>
                  </div>
                )}
                {statusLabel && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Status</span>
                    <span className={s.metaVal}>{statusLabel}</span>
                  </div>
                )}
                {displayManga.source && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Source</span>
                    <span className={s.metaVal}>{displayManga.source.displayName}</span>
                  </div>
                )}
                {!loadingChapters && scanlators.length > 0 && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>{scanlators.length === 1 ? "Scanlator" : "Scanlators"}</span>
                    <span className={s.metaVal}>{scanlators.join(", ")}</span>
                  </div>
                )}
                {!loadingChapters && firstUpload && lastUpload && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Published</span>
                    <span className={s.metaVal}>
                      {firstUpload.getTime() === lastUpload.getTime()
                        ? formatDate(firstUpload)
                        : `${formatDate(firstUpload)} – ${formatDate(lastUpload)}`}
                    </span>
                  </div>
                )}
                {!loadingChapters && downloadedCount > 0 && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Downloaded</span>
                    <span className={s.metaVal}>{downloadedCount} / {totalCount} chapters</span>
                  </div>
                )}
                {!loadingChapters && bookmarkCount > 0 && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Bookmarks</span>
                    <span className={s.metaVal}>{bookmarkCount} chapter{bookmarkCount !== 1 ? "s" : ""}</span>
                  </div>
                )}
                {displayManga.realUrl && (
                  <div className={s.metaRow}>
                    <span className={s.metaKey}>Link</span>
                    <a href={displayManga.realUrl} target="_blank" rel="noreferrer" className={s.metaLink}>
                      Open <ArrowSquareOut size={11} weight="light" />
                    </a>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}