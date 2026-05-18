import { createPinchGesture } from "@core/ui/touchscreen";
import { clampZoom } from "./zoomHelpers";
import { ZOOM_MIN, ZOOM_MAX } from "../store/readerState.svelte";

export interface PinchTrackerOptions {
  getZoom:         () => number;
  setZoom:         (z: number) => void;
  getInspectScale: () => number;
  setInspectScale: (s: number) => void;
  resetInspectPan: () => void;
  isLongstrip:     () => boolean;
}

export type { PinchGesture as PinchTracker } from "@core/ui/touchscreen";

const INSPECT_ZOOM_MAX = 8;

export function createPinchTracker(opts: PinchTrackerOptions) {
  let startZoom    = 0;
  let startInspect = 0;

  return createPinchGesture({
    onPinch(scale) {
      if (startZoom === 0) {
        startZoom    = opts.getZoom();
        startInspect = opts.getInspectScale();
      }
      if (opts.isLongstrip()) {
        opts.setZoom(clampZoom(startZoom * scale));
      } else {
        const next = Math.max(1, Math.min(INSPECT_ZOOM_MAX, startInspect * scale));
        if (next !== opts.getInspectScale()) {
          if (next === 1) opts.resetInspectPan();
          opts.setInspectScale(next);
        }
      }
    },
    onPinchEnd() {
      startZoom    = 0;
      startInspect = 0;
    },
  });
}