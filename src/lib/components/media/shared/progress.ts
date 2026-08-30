import { tsunagu } from "$lib/server-adapters/tsunagu";
import { seriesState } from "$lib/state/series.svelte";

export function reportProgress(
  chapterId: string,
  fraction: number,
  opts: { completed?: boolean; positionSeconds?: number; durationSeconds?: number } = {},
): void {
  const manga = seriesState.activeManga;
  if (!manga) return;
  const mediaId = manga.mediaId ?? manga.libraryEntryId ?? manga.id;

  tsunagu.updateReadingProgress({
    libraryEntryId: mediaId,
    chapterId,
    progress: Math.max(0, Math.min(1, fraction)),
    completed: opts.completed,
    positionSeconds: opts.positionSeconds,
    durationSeconds: opts.durationSeconds,
  }).catch(console.error);
}

export function throttledProgressReporter(minGapMs = 4000) {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  return (chapterId: string, fraction: number, opts?: Parameters<typeof reportProgress>[2]) => {
    const now = Date.now();
    if (pending) { clearTimeout(pending); pending = null; }
    if (now - last >= minGapMs) {
      last = now;
      reportProgress(chapterId, fraction, opts);
    } else {
      pending = setTimeout(() => {
        last = Date.now();
        pending = null;
        reportProgress(chapterId, fraction, opts);
      }, minGapMs - (now - last));
    }
  };
}
