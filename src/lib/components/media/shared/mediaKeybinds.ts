import { mediaViewState } from "$lib/state/mediaView.svelte";

export interface MediaKeyActions {
  close:   () => void;
  next:    () => void;
  prev:    () => void;
}

export function createMediaKeyHandler(actions: MediaKeyActions): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;

    switch (e.key) {
      case "Escape":                          e.preventDefault(); actions.close(); break;
      case "ArrowRight": case "PageDown": case "n": e.preventDefault(); actions.next(); break;
      case "ArrowLeft":  case "PageUp":   case "p": e.preventDefault(); actions.prev(); break;
      case "f":                               e.preventDefault(); mediaViewState.toggleFullscreen(); break;
      case "h": case "Tab":                   e.preventDefault(); mediaViewState.toggleUi(); break;
    }
  };
}
