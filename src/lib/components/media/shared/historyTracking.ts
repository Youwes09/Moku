import { untrack } from "svelte";
import { historyState } from "$lib/state/history.svelte";
import { seriesState } from "$lib/state/series.svelte";

const TICK_MS = 2_000;

export function trackHistory(position: () => number): void {
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTick = 0;

  $effect(() => {
    const m = seriesState.activeManga;
    const ch = seriesState.activeChapter;
    if (!m || !ch) return;
    const kind = (m.contentType ?? "MANGA") as "MANGA" | "NOVEL" | "ANIME";
    untrack(() =>
      historyState.openSession(m.id, m.title, m.thumbnailUrl, ch.id, ch.name, position(), kind),
    );
  });

  $effect(() => {
    const m = seriesState.activeManga;
    const ch = seriesState.activeChapter;
    const p = position();
    if (!m || !ch) return;
    const now = Date.now();
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
    if (now - lastTick >= TICK_MS) {
      lastTick = now;
      historyState.tickSession(ch.id, ch.name, Math.round(p));
    } else {
      tickTimer = setTimeout(() => {
        lastTick = Date.now();
        tickTimer = null;
        historyState.tickSession(ch.id, ch.name, Math.round(position()));
      }, TICK_MS - (now - lastTick));
    }
    return () => { if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; } };
  });

  $effect(() => () => historyState.closeSession());
}
