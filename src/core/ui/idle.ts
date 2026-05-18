import { store } from "@store/state.svelte";

const IDLE_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

export function mountIdleDetection(onIdle: () => void, onActive: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function reset() {
    if (timer) clearTimeout(timer);
    const ms = (store.settings.idleTimeoutMin ?? 5) * 60 * 1000;
    if (ms === 0) return;
    timer = setTimeout(onIdle, ms);
    onActive();
  }

  IDLE_EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
  reset();

  return () => {
    if (timer) clearTimeout(timer);
    IDLE_EVENTS.forEach(e => window.removeEventListener(e, reset));
  };
}
