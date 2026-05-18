import type { DownloadQueueItem, ActiveDownload } from "@types/index";

export function toActiveDownloads(queue: DownloadQueueItem[]): ActiveDownload[] {
  return queue.map((item) => ({
    chapterId: item.chapter.id,
    mangaId:   item.chapter.mangaId,
    progress:  item.progress,
  }));
}

export function optimisticRemove(queue: DownloadQueueItem[], chapterId: number): DownloadQueueItem[] {
  return queue.filter((i) => i.chapter.id !== chapterId);
}

export function optimisticRemoveMany(queue: DownloadQueueItem[], chapterIds: Set<number>): DownloadQueueItem[] {
  return queue.filter((i) => !chapterIds.has(i.chapter.id));
}

export function isRunning(state: string | undefined): boolean {
  return state === "STARTED";
}

export function getErrored(queue: DownloadQueueItem[]): DownloadQueueItem[] {
  return queue.filter((i) => i.state === "ERROR");
}

export function pageProgress(progress: number, pageCount: number): { done: number; total: number } {
  return { done: Math.round(progress * pageCount), total: pageCount };
}

export interface SpeedSample {
  ts:       number;
  progress: number;
  pages:    number;
}

export function calcSpeed(prev: SpeedSample | null, current: SpeedSample): number | null {
  if (!prev) return null;
  const dt = (current.ts - prev.ts) / 1000;
  if (dt <= 0) return null;
  const prevDone = Math.round(prev.progress * prev.pages);
  const curDone  = Math.round(current.progress * current.pages);
  const delta    = curDone - prevDone;
  if (delta <= 0) return null;
  return delta / dt;
}

export function estimateEta(pagesPerSec: number, queue: DownloadQueueItem[]): number | null {
  if (pagesPerSec <= 0 || queue.length === 0) return null;
  let remaining = 0;
  for (const item of queue) {
    const pages = item.chapter.pageCount ?? 0;
    remaining += pages - Math.round(item.progress * pages);
  }
  return remaining / pagesPerSec;
}

export function reorderSelectedToEdge(
  queue: DownloadQueueItem[],
  selected: Set<number>,
  edge: "top" | "bottom",
): DownloadQueueItem[] {
  const pinned   = queue.filter((i) => selected.has(i.chapter.id));
  const rest     = queue.filter((i) => !selected.has(i.chapter.id));
  return edge === "top" ? [...pinned, ...rest] : [...rest, ...pinned];
}

export function formatEta(seconds: number): string {
  if (seconds < 60)  return `~${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}