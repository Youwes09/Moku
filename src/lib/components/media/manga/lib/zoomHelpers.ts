import { ZOOM_MIN, ZOOM_MAX } from "$lib/state/mangaReader.svelte";

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

export function captureZoomAnchor(
  containerEl: HTMLElement | null,
  style: string,
  anchor: { el: HTMLElement | null; offset: number },
) {
  if (!containerEl || style !== "longstrip") return;
  const imgs = containerEl.querySelectorAll<HTMLElement>("img[data-local-page]");
  let best: HTMLElement | null = null;
  let bestTop = -Infinity;
  const readY = containerEl.getBoundingClientRect().top + containerEl.clientHeight * 0.5;
  for (const img of imgs) {
    const top = img.getBoundingClientRect().top;
    if (top <= readY && top > bestTop) { bestTop = top; best = img; }
  }
  anchor.el     = best;
  anchor.offset = best ? readY - best.getBoundingClientRect().top : 0;
}

export function restoreZoomAnchor(
  containerEl: HTMLElement | null,
  anchor: { el: HTMLElement | null; offset: number },
) {
  if (!containerEl || !anchor.el) return;
  requestAnimationFrame(() => {
    if (!anchor.el) return;
    const rect   = anchor.el.getBoundingClientRect();
    const readY  = containerEl.getBoundingClientRect().top + containerEl.clientHeight * 0.5;
    const delta  = (readY - rect.top) - anchor.offset;
    containerEl.scrollTop -= delta;
    anchor.el = null;
  });
}
