import { store, openReader, closeReader } from "@store/state.svelte";
import { readerState }                     from "../store/readerState.svelte";
import type { Chapter }                    from "@types";

interface Adjacent {
  prev: Chapter | null;
  next: Chapter | null;
}

export function advanceGroup(forward: boolean, adjacent: Adjacent, startAtLastPage: () => void) {
  if (!readerState.pageGroups.length) return;
  const gi = readerState.pageGroups.findIndex(g => g.includes(store.pageNumber));
  if (forward) {
    if (gi < readerState.pageGroups.length - 1) store.pageNumber = readerState.pageGroups[gi + 1][0];
    else if (adjacent.next) { store.pageNumber = 1; openReader(adjacent.next, store.activeChapterList); }
    else closeReader();
  } else {
    if (gi > 0) store.pageNumber = readerState.pageGroups[gi - 1][0];
    else if (adjacent.prev) { startAtLastPage(); openReader(adjacent.prev, store.activeChapterList); }
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
    if (adjacent.next) { onMaybeMarkRead(); openReader(adjacent.next, store.activeChapterList); }
    return;
  }
  if (style === "double" && readerState.pageGroups.length) { advanceGroup(true, adjacent, startAtLastPage); return; }
  if (!store.pageUrls.length) return;
  if (store.pageNumber < lastPage) {
    if (style === "fade") animateFade(() => { store.pageNumber++; });
    else store.pageNumber++;
  } else if (adjacent.next) {
    onMaybeMarkRead();
    store.pageNumber = 1;
    openReader(adjacent.next, store.activeChapterList);
  } else closeReader();
}

export function goBack(
  style: string,
  adjacent: Adjacent,
  startAtLastPage: () => void,
) {
  if (readerState.loading) return;
  if (style === "longstrip") {
    if (adjacent.prev) { startAtLastPage(); openReader(adjacent.prev, store.activeChapterList); }
    return;
  }
  if (style === "double" && readerState.pageGroups.length) { advanceGroup(false, adjacent, startAtLastPage); return; }
  if (!store.pageUrls.length) return;
  if (store.pageNumber > 1) {
    if (style === "fade") animateFade(() => { store.pageNumber--; });
    else store.pageNumber--;
  } else if (adjacent.prev) { startAtLastPage(); openReader(adjacent.prev, store.activeChapterList); }
}

export function jumpToPage(page: number, style: string, lastPage: number, containerEl: HTMLElement | null) {
  if (style === "longstrip") {
    const chId = readerState.visibleChapterId ?? store.activeChapter?.id;
    containerEl?.querySelector<HTMLImageElement>(`img[data-local-page="${page}"][data-chapter="${chId}"]`)?.scrollIntoView({ block: "start" });
    return;
  }
  if (style === "double" && readerState.pageGroups.length) {
    const group = readerState.pageGroups[page - 1];
    if (group) store.pageNumber = group[0];
  } else {
    store.pageNumber = Math.max(1, Math.min(lastPage, page));
  }
}
