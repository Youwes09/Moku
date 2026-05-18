export const READ_LINE_PCT = 0.50;

export interface StripChapter {
  chapterId:   number;
  chapterName: string;
  urls:        string[];
}

export interface ScrollHandlerCallbacks {
  onPageChange:    (page: number) => void;
  onChapterChange: (chapterId: number) => void;
  onMarkRead:      (chapterId: number) => void;
  onAppend:        () => void;
  getStripChapters: () => StripChapter[];
  getPageUrls:     () => string[];
  shouldAutoMark:  () => boolean;
}

export function setupScrollTracking(
  containerEl: HTMLElement,
  callbacks: ScrollHandlerCallbacks,
): () => void {
  const {
    onPageChange, onChapterChange, onMarkRead,
    onAppend, getStripChapters, getPageUrls, shouldAutoMark,
  } = callbacks;

  let rafId: number | null = null;

  function tick() {
    rafId = null;

    const imgs = containerEl.querySelectorAll<HTMLElement>("img[data-local-page]");
    if (!imgs.length) return;

    const containerTop = containerEl.getBoundingClientRect().top;
    const readLineY    = containerTop + containerEl.clientHeight * READ_LINE_PCT;

    let lo = 0, hi = imgs.length - 1, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (imgs[mid].getBoundingClientRect().top <= readLineY) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }

    const active   = imgs[best];
    const activePage = Number(active.dataset.localPage);
    const activeChId = Number(active.dataset.chapter);

    onPageChange(activePage);
    if (activeChId) onChapterChange(activeChId);

    if (shouldAutoMark() && activeChId) {
      const chunks = getStripChapters();
      const chunk  = chunks.find(c => c.chapterId === activeChId);
      const total  = chunk ? chunk.urls.length : getPageUrls().length;
      if (total > 0 && activePage >= total) onMarkRead(activeChId);

      const atBottom = containerEl.scrollTop + containerEl.clientHeight >= containerEl.scrollHeight - 40;
      if (atBottom) {
        const last = chunks[chunks.length - 1];
        if (last) onMarkRead(last.chapterId);
      }
    }

    const pct = (containerEl.scrollTop + containerEl.clientHeight) / containerEl.scrollHeight;
    if (pct >= 0.80) onAppend();
  }

  function onScroll() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(tick);
  }

  containerEl.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    containerEl.removeEventListener("scroll", onScroll);
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}

export function appendNextChapter(
  stripChapters: StripChapter[],
  chapterList: { id: number; name: string }[],
  fetchPages: (chapterId: number) => Promise<string[]>,
  preloadImage: (url: string) => void,
  onAppended: (next: StripChapter) => void,
  onDone: () => void,
): void {
  if (!stripChapters.length) return;

  const lastChunk = stripChapters[stripChapters.length - 1];
  const lastIdx   = chapterList.findIndex(c => c.id === lastChunk.chapterId);
  if (lastIdx < 0 || lastIdx >= chapterList.length - 1) return;

  const next = chapterList[lastIdx + 1];
  if (!next || stripChapters.some(c => c.chapterId === next.id)) return;

  fetchPages(next.id)
    .then(urls => {
      urls.slice(0, 6).forEach(preloadImage);
      return urls;
    })
    .then(urls => {
      if (stripChapters.some(c => c.chapterId === next.id)) { onDone(); return; }
      onAppended({ chapterId: next.id, chapterName: next.name, urls });
      onDone();
    })
    .catch(() => onDone());
}