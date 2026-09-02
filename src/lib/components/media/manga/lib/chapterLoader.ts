import { readerState }                                          from "$lib/state/mangaReader.svelte";
import { seriesState }                                         from "$lib/state/series.svelte";
import { settingsState }                                       from "$lib/state/settings.svelte";
import { fetchPages }                                          from "./pageLoader";
import { cancelQueuedFetches, revokeBlobUrl, preloadBlobUrls } from "$lib/core/cache/imageCache";
import { clearResolvedUrlCache, clearPageCache }               from "$lib/core/cache/pageCache";

function absolutePageUrl(p: string): string {
  if (p.startsWith("http")) return p;
  const url  = settingsState.settings.serverUrl;
  const base = typeof url === "string" && url.trim() ? url.replace(/\/$/, "") : "http://localhost:6007";
  return `${base}${p}`;
}

export function scheduleResumeDismiss() {
  setTimeout(() => { readerState.resumeFading = true; }, 1500);
  setTimeout(() => { readerState.resumeVisible = false; readerState.resumeFading = false; }, 2500);
}

let prefetchedChapterId: string | null = null;
let prefetchedUrls:      string[]      = [];

async function getPagesForChapter(
  mangaId: string,
  chapterId: string,
  useBlob: boolean,
  signal: AbortSignal,
  priorityPage = 0,
): Promise<string[]> {
  const chapter = seriesState.chaptersFor(mangaId).find(c => c.id === chapterId);
  const contentPages = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      absolutePageUrl(`/content/${mangaId}/${chapterId}/pages/${i + 1}`));

  // Downloaded chapters always go through the backend, which decides local-vs-remote.
  // Never hand the reader a pre-resolved source URL for one.
  if (chapter?.downloaded && chapter.pageCount && chapter.pageCount > 0) {
    return contentPages(chapter.pageCount);
  }
  if (chapter?.pages && chapter.pages.length > 0) {
    return chapter.pages.map(absolutePageUrl);
  }
  if (chapter?.pageCount && chapter.pageCount > 0) {
    return contentPages(chapter.pageCount);
  }
  return fetchPages(mangaId, chapterId, useBlob, signal, priorityPage);
}

export async function loadChapter(
  mangaId: string,
  id: string,
  useBlob: boolean,
  abortCtrl: { current: AbortController | null },
  startAtLastPage: { current: boolean },
  markedRead: Set<string>,
  adjacent: { next: { id: string } | null },
) {
  abortCtrl.current?.abort();
  const ctrl = new AbortController();
  abortCtrl.current = ctrl;

  cancelQueuedFetches();
  if (useBlob) {
    clearResolvedUrlCache();
    for (const url of readerState.pageUrls) revokeBlobUrl(url);
    if (prefetchedChapterId !== null && prefetchedChapterId !== id) {
      for (const url of prefetchedUrls) revokeBlobUrl(url);
      clearPageCache(prefetchedChapterId);
    }
    prefetchedChapterId = null;
    prefetchedUrls      = [];
  }

  startAtLastPage.current = false;
  markedRead.clear();
  readerState.resetForChapter();
  readerState.pageUrls = [];

  const bookmark = seriesState.bookmarks.find(b => b.chapterId === id);
  const resumeTo = bookmark ? bookmark.pageNumber : 0;
  readerState.resumePage      = resumeTo > 1 ? resumeTo : 0;
  readerState.resumeDismissed = false;
  readerState.resumeVisible   = false;

  readerState.pageNumber = 1;
  try {
    const urls = await getPagesForChapter(mangaId, id, useBlob, ctrl.signal, resumeTo > 1 ? resumeTo - 1 : 0);
    if (ctrl.signal.aborted) return;
    readerState.pageUrls = urls;
    if (useBlob && resumeTo > 1) {
      const lo = Math.max(0, resumeTo - 2);
      const hi = Math.min(urls.length, resumeTo + 4);
      preloadBlobUrls(urls.slice(lo, hi), 900);
    }
    if (startAtLastPage.current)  readerState.pageNumber = urls.length;
    else if (resumeTo > 1)        readerState.pageNumber = Math.min(resumeTo, urls.length || resumeTo);
    readerState.pageReady = true;
    readerState.loading   = false;
    if (resumeTo > 1) readerState.resumeVisible = true;

    if (adjacent.next) {
      prefetchedChapterId = adjacent.next.id;
      getPagesForChapter(mangaId, adjacent.next.id, useBlob, ctrl.signal)
        .then(fetched => {
          if (!ctrl.signal.aborted && prefetchedChapterId === adjacent.next!.id) {
            prefetchedUrls = fetched;
          }
        })
        .catch(() => {});
    }
  } catch (e: unknown) {
    if (ctrl.signal.aborted) return;
    readerState.error   = e instanceof Error ? e.message : String(e);
    readerState.loading = false;
  }
}
