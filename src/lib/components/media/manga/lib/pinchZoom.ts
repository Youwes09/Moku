import { createPinchGesture }  from "$lib/core/ui/touchscreen";
import { clampZoom }           from "./zoomHelpers";

export type { PinchGesture as PinchTracker } from "$lib/core/ui/touchscreen";

const INSPECT_ZOOM_MAX = 8;

export interface PinchTrackerOptions {
  getZoom:         () => number;
  setZoom:         (z: number) => void;
  getInspectScale: () => number;
  setInspectScale: (s: number) => void;
  resetInspectPan: () => void;
  isLongstrip:     () => boolean;
}

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
