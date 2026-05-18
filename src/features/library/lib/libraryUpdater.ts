import { gql } from "@api/client";
import { LIBRARY_UPDATE_STATUS } from "@api/queries/manga";
import { UPDATE_LIBRARY, FETCH_MANGA } from "@api/mutations/manga";
import { GET_LIBRARY } from "@api/queries/manga";
import type { LibraryUpdateEntry } from "@store/state.svelte";

const POLL_INTERVAL_MS = 2000;
const POLL_INITIAL_MS  = 500;

export interface UpdateProgress {
  finished:      number;
  total:         number;
  skippedManga:  number;
  skippedCategories: number;
}

export interface UpdateResult {
  entries:      LibraryUpdateEntry[];
  totalUpdated: number;
  newChapters:  number;
}

export interface LibraryUpdaterCallbacks {
  onProgress: (p: UpdateProgress) => void;
  onDone:     (r: UpdateResult)   => void;
  onError:    (e?: unknown)       => void;
}

export async function refreshLibraryMetadata(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const data = await gql<{ mangas: { nodes: { id: number }[] } }>(GET_LIBRARY, {});
  const ids = data.mangas.nodes.map(m => m.id);
  let done = 0;
  for (const id of ids) {
    try {
      await gql(FETCH_MANGA, { id });
    } catch {}
    onProgress?.(++done, ids.length);
  }
}

export function startLibraryUpdate(callbacks: LibraryUpdaterCallbacks): () => void {
  let timer:    ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  function cancel() {
    cancelled = true;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function buildEntries(
    mangaUpdates: { status: string; manga: { id: number; title: string; thumbnailUrl: string; unreadCount: number } }[]
  ): LibraryUpdateEntry[] {
    const byManga = new Map<number, LibraryUpdateEntry>();
    for (const u of mangaUpdates) {
      if (u.status !== "UPDATED") continue;
      const existing = byManga.get(u.manga.id);
      if (existing) {
        existing.newChapters++;
      } else {
        byManga.set(u.manga.id, {
          mangaId:      u.manga.id,
          mangaTitle:   u.manga.title,
          thumbnailUrl: u.manga.thumbnailUrl,
          newChapters:  1,
          checkedAt:    Date.now(),
        });
      }
    }
    return [...byManga.values()];
  }

  async function run() {
    let jobsStarted = false;

    try {
      const res = await gql<{
        updateLibrary: {
          updateStatus: {
            jobsInfo: {
              isRunning:             boolean;
              totalJobs:             number;
              finishedJobs:          number;
              skippedMangasCount:    number;
              skippedCategoriesCount: number;
            }
          }
        }
      }>(UPDATE_LIBRARY, {});
      if (cancelled) return;

      const { jobsInfo } = res.updateLibrary.updateStatus;
      jobsStarted = jobsInfo.totalJobs > 0;

      callbacks.onProgress({
        finished:          jobsInfo.finishedJobs,
        total:             jobsInfo.totalJobs,
        skippedManga:      jobsInfo.skippedMangasCount,
        skippedCategories: jobsInfo.skippedCategoriesCount,
      });

      if (!jobsStarted) {
        callbacks.onDone({ entries: [], totalUpdated: 0, newChapters: 0 });
        return;
      }

      if (jobsStarted && !jobsInfo.isRunning) {
        callbacks.onDone({ entries: [], totalUpdated: 0, newChapters: 0 });
        return;
      }
    } catch (e) {
      console.error("[libraryUpdater] failed to start update", e);
      if (!cancelled) callbacks.onError(e);
      return;
    }

    function poll() {
      gql<{
        libraryUpdateStatus: {
          jobsInfo: {
            isRunning:             boolean;
            finishedJobs:          number;
            totalJobs:             number;
            skippedMangasCount:    number;
            skippedCategoriesCount: number;
          };
          mangaUpdates: {
            status: string;
            manga: { id: number; title: string; thumbnailUrl: string; unreadCount: number };
          }[];
        }
      }>(LIBRARY_UPDATE_STATUS, {})
        .then(async d => {
          if (cancelled) return;
          const { jobsInfo, mangaUpdates } = d.libraryUpdateStatus;

          if (jobsInfo.totalJobs > 0) jobsStarted = true;
          callbacks.onProgress({
            finished:          jobsInfo.finishedJobs,
            total:             jobsInfo.totalJobs,
            skippedManga:      jobsInfo.skippedMangasCount,
            skippedCategories: jobsInfo.skippedCategoriesCount,
          });

          if (!jobsInfo.isRunning && jobsStarted) {
            const entries     = buildEntries(mangaUpdates);
            const newChapters = entries.reduce((s, e) => s + e.newChapters, 0);
            callbacks.onDone({ entries, totalUpdated: entries.length, newChapters });
            return;
          }

          timer = setTimeout(poll, POLL_INTERVAL_MS);
        })
        .catch((e) => {
          console.error("[libraryUpdater] poll error", e);
          if (!cancelled) callbacks.onError(e);
        });
    }

    timer = setTimeout(poll, POLL_INITIAL_MS);
  }

  run();
  return cancel;
}