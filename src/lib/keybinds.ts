import { getCurrentWindow } from "@tauri-apps/api/window";

export interface Keybinds {
  pageRight:              string;
  pageLeft:               string;
  firstPage:              string;
  lastPage:               string;
  chapterRight:           string;
  chapterLeft:            string;
  exitReader:             string;
  toggleReadingDirection: string;
  togglePageStyle:        string;
  toggleFullscreen:       string;
  openSettings:           string;
}

export const DEFAULT_KEYBINDS: Keybinds = {
  pageRight:              "ArrowRight",
  pageLeft:               "ArrowLeft",
  firstPage:              "ctrl+ArrowLeft",
  lastPage:               "ctrl+ArrowRight",
  chapterRight:           "]",
  chapterLeft:            "[",
  exitReader:             "Backspace",
  toggleReadingDirection: "d",
  togglePageStyle:        "q",
  toggleFullscreen:       "f",
  openSettings:           "o",
};

export const KEYBIND_LABELS: Record<keyof Keybinds, string> = {
  pageRight:              "Turn page right",
  pageLeft:               "Turn page left",
  firstPage:              "Jump to first page",
  lastPage:               "Jump to last page",
  chapterRight:           "Next chapter",
  chapterLeft:            "Previous chapter",
  exitReader:             "Exit reader",
  toggleReadingDirection: "Toggle reading direction",
  togglePageStyle:        "Toggle page style",
  toggleFullscreen:       "Toggle fullscreen",
  openSettings:           "Open settings",
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

export async function toggleFullscreen(): Promise<void> {
  const win = getCurrentWindow();
  const isFs = await win.isFullscreen();
  await win.setFullscreen(!isFs);
}