export interface Keybinds {
  pageRight:                 string;
  pageLeft:                  string;
  firstPage:                 string;
  lastPage:                  string;
  chapterRight:              string;
  chapterLeft:               string;
  exitReader:                string;
  close:                     string;
  toggleReadingDirection:    string;
  togglePageStyle:           string;
  toggleOffsetDoubleSpreads: string;
  toggleFullscreen:          string;
  openSettings:              string;
  toggleSidebar:             string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  pageRight:                 "ArrowRight",
  pageLeft:                  "ArrowLeft",
  firstPage:                 "ctrl+ArrowLeft",
  lastPage:                  "ctrl+ArrowRight",
  chapterRight:              "]",
  chapterLeft:               "[",
  exitReader:                "Backspace",
  close:                     "Escape",
  toggleReadingDirection:    "d",
  togglePageStyle:           "q",
  toggleOffsetDoubleSpreads: "u",
  toggleFullscreen:          "f",
  openSettings:              "o",
  toggleSidebar:             "s",
};

export const KEYBIND_LABELS: Record<keyof Keybinds, string> = {
  pageRight:                 "Turn page right",
  pageLeft:                  "Turn page left",
  firstPage:                 "First page",
  lastPage:                  "Last page",
  chapterRight:              "Change chapter right",
  chapterLeft:               "Change chapter left",
  exitReader:                "Exit reader",
  close:                     "Close",
  toggleReadingDirection:    "Toggle reading direction",
  togglePageStyle:           "Toggle page style",
  toggleOffsetDoubleSpreads: "Toggle double page offset",
  toggleFullscreen:          "Toggle fullscreen",
  openSettings:              "Show settings menu",
  toggleSidebar:             "Toggle sidebar",
};

export function eventToKeybind(e: KeyboardEvent): string {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return "";
  const parts: string[] = [];
  if (e.ctrlKey)  parts.push("ctrl");
  if (e.altKey)   parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey)  parts.push("meta");
  parts.push(e.key);
  return parts.join("+");
}

export function matchesKeybind(e: KeyboardEvent, bind: string): boolean {
  return eventToKeybind(e) === bind;
}