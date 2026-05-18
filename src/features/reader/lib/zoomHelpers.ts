import { clampZoom as _clampZoom, captureZoomAnchor, restoreZoomAnchor } from "@core/ui/zoom";
import { ZOOM_MIN, ZOOM_MAX } from "../store/readerState.svelte";

export { captureZoomAnchor, restoreZoomAnchor };

export function clampZoom(z: number): number {
  return _clampZoom(z, ZOOM_MIN, ZOOM_MAX);
}