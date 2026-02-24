/**
 * Session-level request cache.
 *
 * Key design decisions:
 * - Stores the Promise itself — concurrent callers await the same fetch (no thundering herd).
 * - On real errors the entry is evicted so the next call retries.
 * - AbortErrors do NOT evict — the request was cancelled by the user, not failed.
 *   This is critical: if we evicted on abort, rapid open/close would drain the browser's
 *   connection pool (Chromium allows only 6 concurrent connections to the same origin).
 * - Subscribers are notified when a key is explicitly cleared (for reactive invalidation).
 */
const store = new Map<string, Promise<unknown>>();
const subs  = new Map<string, Set<() => void>>();

export const cache = {
  get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    if (!store.has(key)) {
      store.set(key, fetcher().catch((err) => {
        // Only evict on real failures, not user cancellations
        if (err?.name !== "AbortError") store.delete(key);
        return Promise.reject(err);
      }));
    }
    return store.get(key) as Promise<T>;
  },
  has(key: string): boolean { return store.has(key); },
  clear(key: string) {
    store.delete(key);
    subs.get(key)?.forEach((cb) => cb());
  },
  clearAll() {
    store.clear();
    subs.forEach((set) => set.forEach((cb) => cb()));
  },
  /** Subscribe to cache invalidation for a key. Returns unsubscribe fn. */
  subscribe(key: string, cb: () => void): () => void {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key)!.add(cb);
    return () => subs.get(key)?.delete(cb);
  },
};

// ── Cache key constants — single source of truth, prevents mismatches ─────────
export const CACHE_KEYS = {
  LIBRARY:  "library",
  SOURCES:  "sources",
  POPULAR:  "popular",
  GENRE:    (genre: string) => `genre:${genre}`,
  MANGA:    (id: number)    => `manga:${id}`,
  CHAPTERS: (id: number)    => `chapters:${id}`,
} as const;

// ── In-flight request deduplication (for non-cached calls) ────────────────────
//
// Some requests (chapter lists, manga detail) are NOT stored in the long-lived
// cache but still get fired multiple times when a user rapidly opens/closes a
// manga. This map deduplicates them so only one network round-trip is active at
// a time per key — regardless of how many components request it simultaneously.
//
const inflight = new Map<string, Promise<unknown>>();

export function deduped<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── Source frecency helpers ────────────────────────────────────────────────────

const FRECENCY_KEY = "moku-source-frecency";
const MAX_FRECENCY_SOURCES = 4;

type FrecencyMap = Record<string, number>;

function loadFrecency(): FrecencyMap {
  try {
    const raw = localStorage.getItem(FRECENCY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveFrecency(map: FrecencyMap) {
  try { localStorage.setItem(FRECENCY_KEY, JSON.stringify(map)); } catch {}
}

export function recordSourceAccess(sourceId: string) {
  if (!sourceId || sourceId === "0") return;
  const map = loadFrecency();
  map[sourceId] = (map[sourceId] ?? 0) + 1;
  saveFrecency(map);
}

export function getTopSources<T extends { id: string }>(sources: T[]): T[] {
  const map = loadFrecency();
  const withScore = sources.map((s) => ({ s, score: map[s.id] ?? 0 }));
  const hasFrecency = withScore.some((x) => x.score > 0);

  if (hasFrecency) {
    return withScore
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FRECENCY_SOURCES)
      .map((x) => x.s);
  }
  return sources.slice(0, MAX_FRECENCY_SOURCES);
}