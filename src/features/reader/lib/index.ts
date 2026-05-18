export { readerState }                from "./store/readerState.svelte";
export type { PageStyle }             from "./store/readerState.svelte";
export { PAGE_STYLES, MARKER_COLORS, MARKER_COLOR_HEX, ZOOM_STEP, ZOOM_MIN, ZOOM_MAX } from "./store/readerState.svelte";

export { fetchPages, resolveUrl, preloadImage, measureAspect, buildPageGroups, clearPageCache } from "./lib/pageLoader";
export { setupScrollTracking, appendNextChapter }    from "./lib/scrollHandler";
export type { StripChapter, ScrollHandlerCallbacks } from "./lib/scrollHandler";
export { createReaderKeyHandler }     from "./lib/readerKeybinds";
export type { ReaderKeyActions }      from "./lib/readerKeybinds";

export { markChapterRead, getMangaPrefs, toggleBookmark } from "./lib/chapterActions";
export { goForward, goBack, jumpToPage, animateFade }     from "./lib/navigation";
export { clampZoom, captureZoomAnchor, restoreZoomAnchor } from "./lib/zoomHelpers";
export { loadChapter, scheduleResumeDismiss }              from "./lib/chapterLoader";