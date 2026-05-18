import { getCurrentWindow } from "@tauri-apps/api/window";

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
  try {
    const win = getCurrentWindow();
    await win.setFullscreen(!await win.isFullscreen());
  } catch (e) {
    console.warn("toggleFullscreen unavailable:", e);
  }
}
