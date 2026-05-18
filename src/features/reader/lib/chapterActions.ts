import { gql }                   from "@api/client";
import { store, addHistory, addBookmark, removeBookmark,
         checkAndMarkCompleted, DEFAULT_MANGA_PREFS } from "@store/state.svelte";
import { MARK_CHAPTER_READ, DELETE_DOWNLOADED_CHAPTERS } from "@api/mutations/chapters";
import { ENQUEUE_CHAPTERS_DOWNLOAD }                     from "@api/mutations/downloads";
import { trackingState }                                 from "@features/tracking/store/trackingState.svelte";

const AVG_MIN_PER_PAGE = 0.33;

export function getMangaPrefs() {
  const mangaId = store.activeManga?.id;
  if (!mangaId) return DEFAULT_MANGA_PREFS;
  return { ...DEFAULT_MANGA_PREFS, ...(store.settings.mangaPrefs?.[mangaId] ?? {}) };
}

export function markChapterRead(id: number, markedRead: Set<number>) {
  if (markedRead.has(id)) return;
  markedRead.add(id);
  const chapter = store.activeChapterList.find(c => c.id === id) ?? store.activeChapter;
  const pages   = chapter?.pageCount ?? store.pageUrls.length ?? 15;
  const minutes = Math.max(1, Math.round(pages * AVG_MIN_PER_PAGE));
  if (store.activeManga && chapter) {
    addHistory(
      { mangaId: store.activeManga.id, mangaTitle: store.activeManga.title, thumbnailUrl: store.activeManga.thumbnailUrl, chapterId: id, chapterName: chapter.name, readAt: Date.now() },
      true, minutes,
    );
  }
  gql(MARK_CHAPTER_READ, { id, isRead: true })
    .then(() => {
      const mangaId = store.activeManga?.id;
      if (!mangaId) return;
      const updated = store.activeChapterList.map(c => c.id === id ? { ...c, isRead: true } : c);
      checkAndMarkCompleted(mangaId, updated);
      const ch = store.activeChapterList.find(c => c.id === id) ?? store.activeChapter;
      const prefs = getMangaPrefs();
      if (ch) trackingState.updateFromRead(mangaId, ch, store.activeChapterList, prefs);
      if (prefs.deleteOnRead) {
        const ch = store.activeChapterList.find(c => c.id === id);
        if (ch?.isDownloaded) {
          const delayMs = (prefs.deleteDelayHours ?? 0) * 3_600_000;
          const doDelete = () => gql(DELETE_DOWNLOADED_CHAPTERS, { ids: [id] }).catch(console.error);
          if (delayMs === 0) doDelete(); else setTimeout(doDelete, delayMs);
        }
      }
      if (prefs.downloadAhead > 0) {
        const list = store.activeChapterList;
        const idx  = list.findIndex(c => c.id === id);
        if (idx >= 0) {
          const toQueue = list.slice(idx + 1, idx + 1 + prefs.downloadAhead).filter(c => !c.isDownloaded && !c.isRead).map(c => c.id);
          if (toQueue.length) gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: toQueue }).catch(console.error);
        }
      }
      if (prefs.maxKeepChapters > 0) {
        const downloaded = store.activeChapterList.filter(c => c.isDownloaded).sort((a, b) => a.sourceOrder - b.sourceOrder);
        const excess = downloaded.slice(0, Math.max(0, downloaded.length - prefs.maxKeepChapters));
        if (excess.length) gql(DELETE_DOWNLOADED_CHAPTERS, { ids: excess.map(c => c.id) }).catch(console.error);
      }
    })
    .catch(e => { markedRead.delete(id); console.error(e); });
}

export function toggleBookmark(
  displayChapter: import("@types").Chapter | null | undefined,
  pageNumber: number,
) {
  const ch    = displayChapter;
  const manga = store.activeManga;
  if (!ch || !manga) return;
  const isBookmarked = !!store.bookmarks.find(
    b => b.mangaId === manga.id && b.chapterId === ch.id && b.pageNumber === pageNumber,
  );
  if (isBookmarked) {
    removeBookmark(ch.id);
  } else {
    const existing = store.bookmarks.find(b => b.mangaId === manga.id && b.chapterId !== ch.id);
    if (existing) removeBookmark(existing.chapterId);
    addBookmark({ mangaId: manga.id, mangaTitle: manga.title, thumbnailUrl: manga.thumbnailUrl, chapterId: ch.id, chapterName: ch.name, pageNumber });
  }
}