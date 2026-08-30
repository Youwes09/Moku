import type { Download, DownloaderStatus } from "$lib/server-adapters/types";

export function isRunning(status: DownloaderStatus | null): boolean {
  return status?.isRunning ?? false;
}

export function getErrored(queue: Download[]): Download[] {
  return queue.filter(i => i.status === "FAILED");
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
  const delta = Math.round(current.progress * current.pages) - Math.round(prev.progress * prev.pages);
  if (delta <= 0) return null;
  return delta / dt;
}

export function estimateEta(pagesPerSec: number, queue: Download[]): number | null {
  if (pagesPerSec <= 0 || !queue.length) return null;
  let remaining = 0;
  for (const item of queue) {
    const pages = item.chapter.pageCount ?? 0;
    remaining  += pages - Math.round(item.progress * pages);
  }
  const eta = remaining / pagesPerSec;
  return eta > 0 ? eta : null;
}

export function estimateQueueBytes(queue: Download[]): number {
  const AVG = 1_500_000;
  let total = 0;
  for (const item of queue) {
    const pages = item.chapter.pageCount ?? 0;
    total += (pages - Math.round(item.progress * pages)) * AVG;
  }
  return total;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i > 0 && v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatEta(seconds: number): string {
  if (seconds < 60)   return `~${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}
