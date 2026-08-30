import { goto } from "$app/navigation";
import { seriesState } from "$lib/state/series.svelte";
import type { Chapter } from "$lib/types";

export function chapterNav() {
  function adjacent(): { prev: Chapter | null; next: Chapter | null } {
    const list = seriesState.readerChapterList;
    const cur  = seriesState.activeChapter;
    if (!cur) return { prev: null, next: null };
    const i = list.findIndex((c) => c.id === cur.id);
    if (i === -1) return { prev: null, next: null };
    return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
  }

  function open(ch: Chapter | null) {
    if (!ch) return;
    const m = seriesState.activeManga;
    const mediaId = m?.mediaId ?? m?.libraryEntryId ?? m?.id;
    if (!mediaId) return;
    goto(`/media/${encodeURIComponent(mediaId)}/${encodeURIComponent(ch.id)}`, { replaceState: true });
  }

  return {
    get prev() { return adjacent().prev; },
    get next() { return adjacent().next; },
    goPrev() { open(adjacent().prev); },
    goNext() { open(adjacent().next); },
    close() { history.back(); },
  };
}
