import { settingsState } from "$lib/state/settings.svelte";
import { mediaViewState } from "$lib/state/mediaView.svelte";

interface BarRevealOptions {
  edgePx?: number;
  hideMs?: number;
}

export function createBarReveal(opts: BarRevealOptions = {}) {
  const edgePx = opts.edgePx ?? 60;
  const hideMs = opts.hideMs ?? 3000;

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let tapTimer: ReturnType<typeof setTimeout> | null = null;

  const tapMode = () => settingsState.settings.tapToToggleBar ?? false;

  function clearHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function show() {
    mediaViewState.uiVisible = true;
    clearHide();
    if (!tapMode()) hideTimer = setTimeout(() => { mediaViewState.uiVisible = false; }, hideMs);
  }

  function hide() {
    clearHide();
    mediaViewState.uiVisible = false;
  }

  function toggle() {
    mediaViewState.uiVisible ? hide() : show();
  }

  function onClick() {
    if (!tapMode()) return;
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; return; }
    tapTimer = setTimeout(() => { tapTimer = null; }, 220);
  }

  function onDblClick() {
    if (!tapMode()) return;
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
    toggle();
  }

  function onMove(e: MouseEvent) {
    if (tapMode() || mediaViewState.uiVisible) return;
    const y = e.clientY;
    const h = window.innerHeight;
    if (y < edgePx || h - y < edgePx) show();
  }

  function destroy() {
    clearHide();
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
  }

  return { show, hide, toggle, onClick, onDblClick, onMove, destroy };
}
