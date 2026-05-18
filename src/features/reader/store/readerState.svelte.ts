import type { MarkerColor } from "@store/state.svelte";
import type { StripChapter } from "../lib/scrollHandler";

export const PAGE_STYLES   = ["single", "fade", "double", "longstrip"] as const;
export type  PageStyle     = typeof PAGE_STYLES[number];

export const MARKER_COLORS: MarkerColor[] = ["yellow", "red", "blue", "green", "purple"];
export const MARKER_COLOR_HEX: Record<MarkerColor, string> = {
  yellow: "#c4a94a",
  red:    "#c47a7a",
  blue:   "#7a9ec4",
  green:  "#7aab7a",
  purple: "#a07ac4",
};

export const ZOOM_STEP = 0.05;
export const ZOOM_MIN  = 0.1;
export const ZOOM_MAX  = 1.0;

class ReaderState {
  loading          = $state(true);
  error            = $state<string | null>(null);
  pageReady        = $state(false);
  pageGroups       = $state<number[][]>([]);
  stripChapters    = $state<StripChapter[]>([]);
  visibleChapterId = $state<number | null>(null);

  uiVisible        = $state(true);
  isFullscreen     = $state(false);

  dlOpen           = $state(false);
  zoomOpen         = $state(false);
  winOpen          = $state(false);
  presetOpen       = $state(false);
  presetNameInput  = $state("");
  nextN            = $state(5);
  dlBusy           = $state(false);

  fadingOut        = $state(false);
  sliderDragging   = $state(false);
  sliderHover      = $state(false);

  resumePage       = $state(0);
  resumeDismissed  = $state(false);
  resumeFading     = $state(false);
  resumeVisible    = $state(false);
  stripResumeReady = $state(false);

  markerOpen       = $state(false);
  markerNote       = $state("");
  markerColor      = $state<MarkerColor>("yellow");
  markerEditId     = $state("");

  inspectScale     = $state(1);
  inspectPanX      = $state(0);
  inspectPanY      = $state(0);

  containerWidth   = $state(0);

  resetForChapter() {
    this.loading          = true;
    this.error            = null;
    this.pageReady        = false;
    this.pageGroups       = [];
    this.stripChapters    = [];
    this.visibleChapterId = null;
    this.fadingOut        = false;
    this.markerOpen       = false;
  }

  resetResume() {
    this.resumePage      = 0;
    this.resumeDismissed = false;
    this.resumeVisible   = false;
    this.stripResumeReady = false;
  }

  resetInspect() {
    this.inspectScale = 1;
    this.inspectPanX  = 0;
    this.inspectPanY  = 0;
  }

  closeAllPopovers(): boolean {
    if (this.markerOpen)  { this.markerOpen  = false; return true; }
    if (this.zoomOpen)    { this.zoomOpen    = false; return true; }
    if (this.dlOpen)      { this.dlOpen      = false; return true; }
    if (this.winOpen)     { this.winOpen     = false; return true; }
    if (this.presetOpen)  { this.presetOpen  = false; return true; }
    return false;
  }

  openMarker(editId: string, note: string, color: MarkerColor) {
    this.markerEditId = editId;
    this.markerNote   = note;
    this.markerColor  = color;
    this.markerOpen   = true;
    this.zoomOpen     = false;
    this.dlOpen       = false;
    this.winOpen      = false;
  }

  clearMarkerPopover() {
    this.markerOpen   = false;
    this.markerNote   = "";
    this.markerEditId = "";
  }
}

export const readerState = new ReaderState();