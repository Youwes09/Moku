import { matchesKeybind, toggleFullscreen, DEFAULT_KEYBINDS } from "@core/keybinds";
import type { Keybinds }                                       from "@core/keybinds";

export interface ReaderKeyActions {
  goNext:               () => void;
  goPrev:               () => void;
  closeReader:          () => void;
  goToPage:             (page: number) => void;
  lastPage:             () => number;
  adjustZoom:           (delta: number) => void;
  resetZoom:            () => void;
  cycleStyle:           () => void;
  toggleDirection:      () => void;
  openSettings:         () => void;
  toggleBookmark:       () => void;
  toggleMarker:         () => void;
  toggleAutoScroll:     () => void;
  chapterNext:          () => void;
  chapterPrev:          () => void;
  closePopovers:        () => boolean;
  getKeybinds:          () => Keybinds;
}

const ZOOM_STEP = 0.10;

export function createReaderKeyHandler(actions: ReaderKeyActions): (e: KeyboardEvent) => void {
  return function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

    if (e.key === "Escape") {
      e.preventDefault();
      if (actions.closePopovers()) return;
      actions.closeReader();
      return;
    }

    if (e.ctrlKey) {
      if (e.key === "=" || e.key === "+") { e.preventDefault(); actions.adjustZoom(ZOOM_STEP); return; }
      if (e.key === "-")                  { e.preventDefault(); actions.adjustZoom(-ZOOM_STEP); return; }
      if (e.key === "0")                  { e.preventDefault(); actions.resetZoom(); return; }
    }

    const kb = actions.getKeybinds();

    if      (matchesKeybind(e, kb.exitReader))             { e.preventDefault(); actions.closeReader(); }
    else if (matchesKeybind(e, kb.turnPageRight))          { e.preventDefault(); actions.goNext(); }
    else if (matchesKeybind(e, kb.turnPageLeft))           { e.preventDefault(); actions.goPrev(); }
    else if (matchesKeybind(e, kb.firstPage))              { e.preventDefault(); actions.goToPage(1); }
    else if (matchesKeybind(e, kb.lastPage))               { e.preventDefault(); actions.goToPage(actions.lastPage()); }
    else if (matchesKeybind(e, kb.turnChapterRight))       { e.preventDefault(); actions.chapterNext(); }
    else if (matchesKeybind(e, kb.turnChapterLeft))        { e.preventDefault(); actions.chapterPrev(); }
    else if (matchesKeybind(e, kb.togglePageStyle))        { e.preventDefault(); actions.cycleStyle(); }
    else if (matchesKeybind(e, kb.toggleReadingDirection)) { e.preventDefault(); actions.toggleDirection(); }
    else if (matchesKeybind(e, kb.toggleFullscreen))       { e.preventDefault(); toggleFullscreen().catch(console.error); }
    else if (matchesKeybind(e, kb.openSettings))           { e.preventDefault(); actions.openSettings(); }
    else if (matchesKeybind(e, kb.toggleBookmark))         { e.preventDefault(); actions.toggleBookmark(); }
    else if (matchesKeybind(e, kb.toggleMarker))           { e.preventDefault(); actions.toggleMarker(); }
    else if (matchesKeybind(e, kb.toggleAutoScroll))       { e.preventDefault(); actions.toggleAutoScroll(); }
  };
}