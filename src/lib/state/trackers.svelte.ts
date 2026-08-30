import { tsunagu } from "$lib/server-adapters/tsunagu";
import type { ContentType, Tracker } from "$lib/server-adapters/types";

export const TRACK_STATUSES: { value: number; label: string }[] = [
  { value: 1, label: "Reading" },
  { value: 2, label: "Plan to read" },
  { value: 3, label: "Completed" },
  { value: 4, label: "On hold" },
  { value: 5, label: "Dropped" },
  { value: 6, label: "Rereading" },
];

const TRACK_STATUSES_ANIME: { value: number; label: string }[] = [
  { value: 1, label: "Watching" },
  { value: 2, label: "Plan to watch" },
  { value: 3, label: "Completed" },
  { value: 4, label: "On hold" },
  { value: 5, label: "Dropped" },
  { value: 6, label: "Rewatching" },
];

export function statusesFor(
  tracker?: Tracker | null,
  contentType?: ContentType | string | null,
): { value: number; label: string }[] {
  const anime = contentType === "ANIME";
  const opts = tracker?.statusOptions;
  if (opts && opts.length) {
    return opts.map((s) => ({ value: s.value, label: anime ? s.animeName || s.name : s.name }));
  }
  return anime ? TRACK_STATUSES_ANIME : TRACK_STATUSES;
}

export function statusLabel(
  value: number,
  tracker?: Tracker | null,
  contentType?: ContentType | string | null,
): string {
  return statusesFor(tracker, contentType).find((s) => s.value === value)?.label ?? String(value);
}

class TrackerState {
  list    = $state<Tracker[]>([]);
  loading = $state(false);
  error   = $state<string | null>(null);

  private loaded = false;
  private inFlight: Promise<void> | null = null;

  get configured(): boolean  { return this.list.some(t => t.configured); }
  get anyLoggedIn(): boolean { return this.list.some(t => t.isLoggedIn); }

  byKey(key: string): Tracker | undefined {
    return this.list.find(t => t.key === key);
  }

  async load(force = false): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!force && this.loaded) return;
    this.loading = true;
    this.error = null;
    this.inFlight = (async () => {
      try {
        this.list = await tsunagu.trackers();
        this.loaded = true;
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.loading = false;
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  patch(t: Tracker) {
    this.list = this.list.map(x => x.key === t.key ? t : x);
  }
}

export const trackerState = new TrackerState();
