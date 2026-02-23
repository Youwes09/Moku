import { useEffect, useState, useCallback } from "react";
import { Play, Pause, Trash, CircleNotch, X } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import {
  GET_DOWNLOAD_STATUS, START_DOWNLOADER, STOP_DOWNLOADER,
  CLEAR_DOWNLOADER, DEQUEUE_DOWNLOAD,
} from "../../lib/queries";
import { useStore } from "../../store";
import type { DownloadStatus } from "../../lib/types";
import s from "./DownloadQueue.module.css";

export default function DownloadQueue() {
  const [status, setStatus]         = useState<DownloadStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [togglingPlay, setTogglingPlay] = useState(false);
  const [clearing, setClearing]     = useState(false);
  const [dequeueing, setDequeueing] = useState<Set<number>>(new Set());
  const setActiveDownloads          = useStore((s) => s.setActiveDownloads);

  // Apply status to local state + global store
  const applyStatus = useCallback((ds: DownloadStatus) => {
    setStatus(ds);
    setActiveDownloads(
      ds.queue.map((item) => ({
        chapterId: item.chapter.id,
        mangaId:   item.chapter.mangaId,
        progress:  item.progress,
      }))
    );
  }, [setActiveDownloads]);

  async function poll() {
    gql<{ downloadStatus: DownloadStatus }>(GET_DOWNLOAD_STATUS)
      .then((d) => applyStatus(d.downloadStatus))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function togglePlay() {
    if (togglingPlay) return;
    setTogglingPlay(true);
    // Optimistic flip so button responds instantly
    const wasRunning = status?.state === "STARTED";
    setStatus((prev) => prev ? { ...prev, state: wasRunning ? "STOPPED" : "STARTED" } : prev);
    try {
      if (wasRunning) {
        const d = await gql<{ stopDownloader: { downloadStatus: DownloadStatus } }>(STOP_DOWNLOADER);
        applyStatus(d.stopDownloader.downloadStatus);
      } else {
        const d = await gql<{ startDownloader: { downloadStatus: DownloadStatus } }>(START_DOWNLOADER);
        applyStatus(d.startDownloader.downloadStatus);
      }
    } catch (e) {
      console.error(e);
      poll(); // resync on error
    } finally {
      setTogglingPlay(false);
    }
  }

  async function clear() {
    if (clearing) return;
    setClearing(true);
    // Optimistic clear
    setStatus((prev) => prev ? { ...prev, queue: [] } : prev);
    setActiveDownloads([]);
    try {
      const d = await gql<{ clearDownloader: { downloadStatus: DownloadStatus } }>(CLEAR_DOWNLOADER);
      applyStatus(d.clearDownloader.downloadStatus);
    } catch (e) {
      console.error(e);
      poll(); // resync on error
    } finally {
      setClearing(false);
    }
  }

  async function dequeue(chapterId: number) {
    if (dequeueing.has(chapterId)) return;
    setDequeueing((prev) => new Set(prev).add(chapterId));
    // Optimistic remove
    setStatus((prev) =>
      prev ? { ...prev, queue: prev.queue.filter((i) => i.chapter.id !== chapterId) } : prev
    );
    try {
      await gql(DEQUEUE_DOWNLOAD, { chapterId });
      // Sync authoritative state after dequeue
      poll();
    } catch (e) {
      console.error(e);
      poll();
    } finally {
      setDequeueing((prev) => {
        const next = new Set(prev);
        next.delete(chapterId);
        return next;
      });
    }
  }

  const queue     = status?.queue ?? [];
  const isRunning = status?.state === "STARTED";

  function pagesDownloaded(progress: number, pageCount: number): number {
    return Math.round(progress * pageCount);
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h1 className={s.heading}>Downloads</h1>
        <div className={s.headerActions}>
          {/* Play / Pause toggle */}
          <button
            className={[s.iconBtn, togglingPlay ? s.iconBtnLoading : ""].join(" ").trim()}
            onClick={togglePlay}
            disabled={togglingPlay || (queue.length === 0 && !isRunning)}
            title={isRunning ? "Pause" : "Resume"}
          >
            {togglingPlay ? (
              <CircleNotch size={14} weight="light" className="anim-spin" />
            ) : isRunning ? (
              <Pause size={14} weight="fill" />
            ) : (
              <Play size={14} weight="fill" />
            )}
          </button>

          {/* Clear queue */}
          <button
            className={[s.iconBtn, clearing ? s.iconBtnLoading : ""].join(" ").trim()}
            onClick={clear}
            disabled={clearing || queue.length === 0}
            title="Clear queue"
          >
            {clearing ? (
              <CircleNotch size={14} weight="light" className="anim-spin" />
            ) : (
              <Trash size={14} weight="regular" />
            )}
          </button>
        </div>
      </div>

      <div className={s.statusBar}>
        <div className={[s.statusDot, isRunning ? s.statusDotActive : ""].join(" ").trim()} />
        <span className={s.statusText}>
          {togglingPlay
            ? (isRunning ? "Pausing…" : "Starting…")
            : isRunning ? "Downloading" : "Paused"}
        </span>
        <span className={s.statusCount}>{queue.length} queued</span>
      </div>

      {loading ? (
        <div className={s.empty}>
          <CircleNotch size={16} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
        </div>
      ) : queue.length === 0 ? (
        <div className={s.empty}>Queue is empty.</div>
      ) : (
        <div className={s.list}>
          {queue.map((item, i) => {
            const isActive  = i === 0 && isRunning;
            const pages     = item.chapter.pageCount ?? 0;
            const done      = pagesDownloaded(item.progress, pages);
            const manga     = item.chapter.manga;
            const isRemoving = dequeueing.has(item.chapter.id);

            return (
              <div
                key={item.chapter.id}
                className={[s.row, isActive ? s.rowActive : "", isRemoving ? s.rowRemoving : ""].join(" ").trim()}
              >
                {manga?.thumbnailUrl && (
                  <div className={s.thumb}>
                    <img
                      src={thumbUrl(manga.thumbnailUrl)}
                      alt={manga.title}
                      className={s.thumbImg}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                )}

                <div className={s.info}>
                  {manga?.title && (
                    <span className={s.mangaTitle}>{manga.title}</span>
                  )}
                  <span className={s.chapterName}>{item.chapter.name}</span>

                  {pages > 0 && (
                    <span className={s.pagesLabel}>
                      {isActive ? `${done} / ${pages} pages` : `${pages} pages`}
                    </span>
                  )}

                  {isActive && (
                    <div className={s.progressWrap}>
                      <div
                        className={s.progressBar}
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className={s.rowRight}>
                  <span className={s.stateLabel}>{item.state}</span>
                  {!isActive && (
                    <button
                      className={s.removeBtn}
                      onClick={() => dequeue(item.chapter.id)}
                      disabled={isRemoving}
                      title="Remove from queue"
                    >
                      {isRemoving
                        ? <CircleNotch size={11} weight="light" className="anim-spin" />
                        : <X size={12} weight="light" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}