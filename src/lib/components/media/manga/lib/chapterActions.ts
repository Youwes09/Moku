import { readerState } from "$lib/state/mangaReader.svelte";
import { DEFAULT_MANGA_PREFS } from "$lib/types/settings";
import { seriesState }                      from "$lib/state/series.svelte";
import { settingsState }                    from "$lib/state/settings.svelte";
import { tsunagu }                          from "$lib/server-adapters/tsunagu";
import type { MangaPrefs }                  from "$lib/types/settings";

export function getMangaPrefs(mangaId?: string): MangaPrefs {
  const id = mangaId ?? readerState.activeManga?.id;
  if (!id) return { ...DEFAULT_MANGA_PREFS };
  return { ...DEFAULT_MANGA_PREFS, ...(settingsState.settings.mangaPrefs?.[id] ?? {}) };
}

export function markChapterRead(id: string, markedRead: Set<string>) {
  if (markedRead.has(id)) return;
  markedRead.add(id);

  const chapter = readerState.activeChapterList.find(c => c.id === id) ?? readerState.activeChapter;
  const manga   = readerState.activeManga;

  if (manga && chapter) {
    seriesState.setBookmark({
      mangaId:      manga.id,
      mangaTitle:   manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterId:    id,
      chapterName:  chapter.name,
      pageNumber:   readerState.pageUrls.length,
    });
  }

  if (!manga) { markedRead.delete(id); return; }
  const realMediaId = manga.mediaId ?? manga.libraryEntryId ?? manga.id;

  tsunagu.markChapterRead(realMediaId, id)
    .then(() => {
      const mangaId = readerState.activeManga?.id;
      if (!mangaId) return;

      seriesState.patchChapters(mangaId, chapters =>
        chapters.map(c => c.id === id ? { ...c, read: true } : c),
      );

      const prefs = getMangaPrefs(mangaId);


      if (prefs.deleteOnRead) {
        const ch = readerState.activeChapterList.find(c => c.id === id);
        if (ch?.downloaded) {
          const delayMs = (prefs.deleteDelayHours ?? 0) * 3_600_000;
          const doDelete = () => tsunagu.deleteDownloads(realMediaId, [id]).catch(console.error);
          if (delayMs === 0) doDelete(); else setTimeout(doDelete, delayMs);
        }
      }

      if (prefs.downloadAhead > 0) {
        const list = readerState.activeChapterList;
        const idx  = list.findIndex(c => c.id === id);
        if (idx >= 0) {
          const toQueue = list
            .slice(idx + 1, idx + 1 + prefs.downloadAhead)
            .filter(c => !c.downloaded && !c.read)
            .map(c => c.id);
          if (toQueue.length) tsunagu.enqueueDownloads(realMediaId, toQueue).catch(console.error);
        }
      }

      if (prefs.maxKeepChapters > 0) {
        const downloaded = readerState.activeChapterList
          .filter(c => c.downloaded)
          .sort((a, b) => a.sourceOrder - b.sourceOrder);
        const excess = downloaded.slice(0, Math.max(0, downloaded.length - prefs.maxKeepChapters));
        if (excess.length) {
          tsunagu.deleteDownloads(realMediaId, excess.map(c => c.id)).catch(console.error);
        }
      }
    })
    .catch(e => { markedRead.delete(id); console.error(e); });
}

export function toggleBookmark(chapter: typeof readerState.activeChapter, pageNumber: number) {
  const manga = readerState.activeManga;
  if (!chapter || !manga) return;

  const existing = seriesState.bookmarks.find(
    b => b.mangaId === manga.id && b.chapterId === chapter.id && b.pageNumber === pageNumber,
  );
  if (existing) {
    seriesState.removeBookmark(chapter.id);
  } else {
    seriesState.setBookmark({
      mangaId:      manga.id,
      mangaTitle:   manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterId:    chapter.id,
      chapterName:  chapter.name,
      pageNumber,
    });
  }
}

