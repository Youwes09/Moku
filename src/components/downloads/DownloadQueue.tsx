import { useEffect, useState } from "react";
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
  const [status, setStatus] = useState<DownloadStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const setActiveDownloads = useStore((s) => s.setActiveDownloads);

  async function poll() {
    gql<{ downloadStatus: DownloadStatus }>(GET_DOWNLOAD_STATUS)
      .then((d) => {
        setStatus(d.downloadStatus);
        setActiveDownloads(
          d.downloadStatus.queue.map((item) => ({
            chapterId: item.chapter.id,
            mangaId: item.chapter.mangaId,
            progress: item.progress,
          }))
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, []);

  async function start() { await gql(START_DOWNLOADER).catch(console.error); poll(); }
  async function stop()  { await gql(STOP_DOWNLOADER).catch(console.error);  poll(); }
  async function clear() { await gql(CLEAR_DOWNLOADER).catch(console.error); poll(); }
  async function dequeue(chapterId: number) {
    await gql(DEQUEUE_DOWNLOAD, { chapterId }).catch(console.error);
    poll();
  }

  const queue = status?.queue ?? [];
  const isRunning = status?.state === "STARTED";

  function pagesDownloaded(progress: number, pageCount: number): number {
    return Math.round(progress * pageCount);
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h1 className={s.heading}>Downloads</h1>
        <div className={s.headerActions}>
          {isRunning ? (
            <button className={s.iconBtn} onClick={stop} title="Pause">
              <Pause size={14} weight="fill" />
            </button>
          ) : (
            <button className={s.iconBtn} onClick={start} disabled={queue.length === 0} title="Resume">
              <Play size={14} weight="fill" />
            </button>
          )}
          <button className={s.iconBtn} onClick={clear} disabled={queue.length === 0} title="Clear queue">
            <Trash size={14} weight="regular" />
          </button>
        </div>
      </div>

      <div className={s.statusBar}>
        <div className={[s.statusDot, isRunning ? s.statusDotActive : ""].join(" ").trim()} />
        <span className={s.statusText}>{isRunning ? "Downloading" : "Paused"}</span>
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
            const isActive = i === 0 && isRunning;
            const pages = item.chapter.pageCount ?? 0;
            const done = pagesDownloaded(item.progress, pages);
            const manga = item.chapter.manga;

            return (
              <div
                key={item.chapter.id}
                className={[s.row, isActive ? s.rowActive : ""].join(" ").trim()}
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
                      title="Remove from queue"
                    >
                      <X size={12} weight="light" />
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