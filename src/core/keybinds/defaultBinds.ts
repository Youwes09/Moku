export interface Keybinds {
  turnPageRight:          string;
  turnPageLeft:           string;
  firstPage:              string;
  lastPage:               string;
  turnChapterRight:       string;
  turnChapterLeft:        string;
  exitReader:             string;
  toggleReadingDirection: string;
  togglePageStyle:        string;
  toggleFullscreen:       string;
  openSettings:           string;
  toggleBookmark:         string;
  toggleMarker:           string;
  toggleAutoScroll:       string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  turnPageRight:          "ArrowRight",
  turnPageLeft:           "ArrowLeft",
  firstPage:              "ctrl+ArrowLeft",
  lastPage:               "ctrl+ArrowRight",
  turnChapterRight:       "]",
  turnChapterLeft:        "[",
  exitReader:             "Backspace",
  toggleReadingDirection: "d",
  togglePageStyle:        "q",
  toggleFullscreen:       "f",
  openSettings:           "o",
  toggleBookmark:         "m",
  toggleMarker:           "n",
  toggleAutoScroll:       "s",
};

export const KEYBIND_LABELS: Record<keyof Keybinds, string> = {
  turnPageRight:          "Turn page right (→)",
  turnPageLeft:           "Turn page left (←)",
  firstPage:              "Jump to first page",
  lastPage:               "Jump to last page",
  turnChapterRight:       "Turn chapter right (→)",
  turnChapterLeft:        "Turn chapter left (←)",
  exitReader:             "Exit reader",
  toggleReadingDirection: "Toggle reading direction",
  togglePageStyle:        "Toggle page style",
  toggleFullscreen:       "Toggle fullscreen",
  openSettings:           "Open settings",
  toggleBookmark:         "Toggle bookmark",
  toggleMarker:           "Toggle marker",
  toggleAutoScroll:       "Toggle auto scroll",
};