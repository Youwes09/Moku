import { store } from "@store/state.svelte";

let _appliedZoom: number = -1;
let _vhRafId: number | null = null;

export function applyZoom() {
  const uiZoom = store.settings.uiZoom ?? 1.0;
  if (uiZoom === _appliedZoom) return;
  _appliedZoom = uiZoom;
  document.documentElement.style.setProperty("--ui-zoom", String(uiZoom));
  document.documentElement.style.setProperty("--ui-scale", String(uiZoom));
  document.documentElement.style.zoom = `${uiZoom * 100}%`;
  if (_vhRafId !== null) cancelAnimationFrame(_vhRafId);
  _vhRafId = requestAnimationFrame(() => {
    _vhRafId = null;
    document.documentElement.style.setProperty("--visual-vh", `${window.innerHeight / uiZoom}px`);
  });
}

export function handleZoomKey(e: KeyboardEvent) {
  if (!e.ctrlKey) return;
  const current = store.settings.uiZoom ?? 1.0;
  if (e.key === "=" || e.key === "+") { e.preventDefault(); store.settings.uiZoom = Math.min(2.0, Math.round((current + 0.1) * 10) / 10); }
  else if (e.key === "-")             { e.preventDefault(); store.settings.uiZoom = Math.max(0.5, Math.round((current - 0.1) * 10) / 10); }
  else if (e.key === "0")             { e.preventDefault(); store.settings.uiZoom = 1.0; }
}

export function mountZoomKey(): () => void {
  window.addEventListener("keydown", handleZoomKey);
  return () => window.removeEventListener("keydown", handleZoomKey);
}

export function clampZoom(z: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, z)) * 1000) / 1000;
}

export function captureZoomAnchor(
  containerEl: HTMLElement | null,
  style: string,
  out: { el: HTMLElement | null; offset: number },
) {
  if (!containerEl || style !== "longstrip") return;
  const containerTop = containerEl.getBoundingClientRect().top;
  for (const img of containerEl.querySelectorAll<HTMLElement>("img[data-local-page]")) {
    const rect = img.getBoundingClientRect();
    if (rect.bottom > containerTop) { out.el = img; out.offset = rect.top - containerTop; return; }
  }
}

export function restoreZoomAnchor(
  containerEl: HTMLElement | null,
  out: { el: HTMLElement | null; offset: number },
) {
  if (!out.el || !containerEl) return;
  const el = out.el;
  out.el = null;
  requestAnimationFrame(() => {
    const containerTop = containerEl!.getBoundingClientRect().top;
    containerEl!.scrollTop += (el.getBoundingClientRect().top - containerTop) - out.offset;
  });
}