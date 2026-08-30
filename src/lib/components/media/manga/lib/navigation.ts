import { readerState, openReader, closeReader } from "$lib/state/mangaReader.svelte";
import type { Chapter } from "$lib/types";

interface Adjacent {
  prev: Chapter | null;
  next: Chapter | null;
}

function advanceGroup(forward: boolean, adjacent: Adjacent, startAtLastPage: () => void) {
  if (!readerState.pageGroups.length) return;
  const gi = readerState.pageGroups.findIndex(g => g.includes(readerState.pageNumber));
  if (forward) {
    if (gi < readerState.pageGroups.length - 1) readerState.pageNumber = readerState.pageGroups[gi + 1][0];
    else if (adjacent.next) { readerState.pageNumber = 1; openReader(adjacent.next); }
    else closeReader();
  } else {
    if (gi > 0) readerState.pageNumber = readerState.pageGroups[gi - 1][0];
    else if (adjacent.prev) { startAtLastPage(); openReader(adjacent.prev); }
  }
}

export async function animateFade(fn: () => void) {
  readerState.fadingOut = true;
  await new Promise(r => setTimeout(r, 100));
  fn();
  readerState.fadingOut = false;
}

export function goForward(
  style: string,
  adjacent: Adjacent,
  lastPage: number,
  onMaybeMarkRead: () => void,
  startAtLastPage: () => void,
) {
  if (readerState.loading) return;
  if (style === "longstrip") {
    if (adjacent.next) { onMaybeMarkRead(); openReader(adjacent.next); }
    return;
  }
  if (style === "double" && readerState.pageGroups.length) { advanceGroup(true, adjacent, startAtLastPage); return; }
  if (!readerState.pageUrls.length) return;
  if (readerState.pageNumber < lastPage) {
    if (style === "fade") animateFade(() => { readerState.pageNumber++; });
    else readerState.pageNumber++;
  } else if (adjacent.next) {
    onMaybeMarkRead();
    readerState.pageNumber = 1;
    openReader(adjacent.next);
  } else closeReader();
}

export function goBack(style: string, adjacent: Adjacent, startAtLastPage: () => void) {
  if (readerState.loading) return;
  if (style === "longstrip") {
    if (adjacent.prev) { startAtLastPage(); openReader(adjacent.prev); }
    return;
  }
  if (style === "double" && readerState.pageGroups.length) { advanceGroup(false, adjacent, startAtLastPage); return; }
  if (!readerState.pageUrls.length) return;
  if (readerState.pageNumber > 1) {
    if (style === "fade") animateFade(() => { readerState.pageNumber--; });
    else readerState.pageNumber--;
  } else if (adjacent.prev) { startAtLastPage(); openReader(adjacent.prev); }
}

export function jumpToPage(
  page: number,
  style: string,
  lastPage: number,
  scrollToFlatIndex: ((idx: number) => void) | null,
  activeChapterId: string,
  chunks: { chapterId: string; urls: string[] }[],
) {
  if (style === "longstrip") {
    if (!scrollToFlatIndex || !chunks.length) return;
    let offset = 0;
    for (const chunk of chunks) {
      if (chunk.chapterId === activeChapterId) {
        scrollToFlatIndex(offset + Math.max(0, page - 1));
        return;
      }
      offset += chunk.urls.length;
    }
    scrollToFlatIndex(Math.max(0, page - 1));
    return;
  }
  if (style === "double" && readerState.pageGroups.length) {
    const group = readerState.pageGroups.find(g => g.includes(page)) ?? readerState.pageGroups.findLast(g => g[0] <= page);
    if (group) readerState.pageNumber = group[0];
  } else {
    readerState.pageNumber = Math.max(1, Math.min(lastPage, page));
  }
}
