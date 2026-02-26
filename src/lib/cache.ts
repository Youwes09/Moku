/**
 * Session-level request cache.
 *
 * Key design decisions (v1, preserved):
 * - Stores the Promise itself — concurrent callers await the same fetch (no thundering herd).
 * - On real errors the entry is evicted so the next call retries.
 * - AbortErrors do NOT evict — the request was cancelled by the user, not failed.
 *   This is critical: if we evicted on abort, rapid open/close would drain the browser's
 *   connection pool (Chromium allows only 6 concurrent connections to the same origin).
 * - Subscribers are notified when a key is explicitly cleared (for reactive invalidation).
 *
 * v2 additions:
 * - TTL-aware get(): stale entries are re-fetched automatically (default 5 min).
 *   Pass Infinity to pin an entry for the session (source list, extension list).
 * - getPageSet(): lightweight page-number tracker for multi-page browse sessions.
 *   Mirrors Suwayomi's CACHE_PAGES_KEY pattern so GenreDrillPage / Search TagTab
 *   can resume a session without re-fetching pages already in memory.
 * - Stable multi-tag cache keys: tag arrays are sorted before joining so
 *   ["Action","Romance"] and ["Romance","Action"] share the same bucket.
 */

interface Entry<T> {
  promise:   Promise<T>;
  fetchedAt: number; // ms since epoch
}

const store = new Map<string, Entry<unknown>>();
const subs  = new Map<string, Set<() => void>>();

/** Default revalidation window: 5 min (matches Suwayomi's browse-page TTL). */
export const DEFAULT_TTL_MS = 5 * 60 * 1_000;

export const cache = {
  /**
   * Return a cached promise.
   * Re-fetches automatically once the entry is older than `ttl` ms.
   * Pass `Infinity` to cache for the entire session (e.g. source/extension lists).
   */
  get<T>(key: string, fetcher: () => Promise<T>, ttl: number = DEFAULT_TTL_MS): Promise<T> {
    const existing = store.get(key) as Entry<T> | undefined;
    if (existing && Date.now() - existing.fetchedAt < ttl) return existing.promise;

    const promise = fetcher().catch((err) => {
      // Only evict on real failures, not user cancellations
      if (err?.name !== "AbortError") store.delete(key);
      return Promise.reject(err);
    }) as Promise<T>;

    store.set(key, { promise, fetchedAt: Date.now() });
    return promise;
  },

  has(key: string): boolean { return store.has(key); },

  /** How old (ms) a cached entry is, or undefined if absent. */
  ageOf(key: string): number | undefined {
    const e = store.get(key);
    return e ? Date.now() - e.fetchedAt : undefined;
  },

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

// ── Cache key constants ───────────────────────────────────────────────────────

export const CACHE_KEYS = {
  LIBRARY:  "library",
  SOURCES:  "sources",
  POPULAR:  "popular",
  GENRE:    (genre: string) => `genre:${genre}`,
  MANGA:    (id: number)    => `manga:${id}`,
  CHAPTERS: (id: number)    => `chapters:${id}`,

  /**
   * Stable key for a browse session's page-number set.
   * Tag arrays are sorted so order never creates duplicate buckets —
   * ["Action","Romance"] and ["Romance","Action"] share one key.
   *
   * Examples:
   *   CACHE_KEYS.sourceMangaPages("src123", "POPULAR")
   *   CACHE_KEYS.sourceMangaPages("src123", "SEARCH", "naruto")
   *   CACHE_KEYS.sourceMangaPages("src123", "SEARCH", ["Action","Romance"])
   */
  sourceMangaPages(
    sourceId: string,
    type:     "POPULAR" | "LATEST" | "SEARCH",
    query?:   string | string[],
  ): string {
    const q = Array.isArray(query) ? [...query].sort().join("+") : (query ?? "");
    return `pages:${sourceId}:${type}:${q}`;
  },

  /** Per-page result key. Always pair with sourceMangaPages(). */
  sourceMangaPage(
    sourceId: string,
    type:     "POPULAR" | "LATEST" | "SEARCH",
    page:     number,
    query?:   string | string[],
  ): string {
    const q = Array.isArray(query) ? [...query].sort().join("+") : (query ?? "");
    return `page:${sourceId}:${type}:${page}:${q}`;
  },
} as const;

// ── In-flight request deduplication (for non-cached calls) ───────────────────
//
// Some requests (chapter lists, manga detail) are NOT stored in the long-lived
// cache but still get fired multiple times when a user rapidly opens/closes a
// manga. This map deduplicates them so only one network round-trip is active at
// a time per key.

const inflight = new Map<string, Promise<unknown>>();

export function deduped<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── PageSet: per-session page-number tracker ──────────────────────────────────
//
// Tracks which page numbers have been fetched for a (source, type, query) bucket.
// Lives in a separate map from the TTL store so it never gets TTL-evicted while
// a browse session is actively paginating.
//
// Usage:
//   const ps = getPageSet(sourceId, "SEARCH", ["Action", "Romance"]);
//   ps.add(1);     // after fetching page 1
//   ps.next();     // → 2
//   ps.pages();    // → Set {1}
//   ps.clear();    // call when query/tags change

const _pageSets = new Map<string, Set<number>>();

export interface PageSet {
  add(page: number): void;
  pages(): Set<number>;
  /** Next page to fetch: max fetched + 1, or 1 if nothing fetched yet. */
  next(): number;
  clear(): void;
}

export function getPageSet(
  sourceId: string,
  type:     "POPULAR" | "LATEST" | "SEARCH",
  query?:   string | string[],
): PageSet {
  const key = CACHE_KEYS.sourceMangaPages(sourceId, type, query);
  return {
    add(page)  {
      if (!_pageSets.has(key)) _pageSets.set(key, new Set());
      _pageSets.get(key)!.add(page);
    },
    pages()    { return new Set(_pageSets.get(key) ?? []); },
    next()     { const s = _pageSets.get(key); return s?.size ? Math.max(...s) + 1 : 1; },
    clear()    { _pageSets.delete(key); },
  };
}

// ── Source frecency helpers ───────────────────────────────────────────────────

const FRECENCY_KEY         = "moku-source-frecency";
const MAX_FRECENCY_SOURCES = 4;

type FrecencyMap = Record<string, number>;

function loadFrecency(): FrecencyMap {
  try { const r = localStorage.getItem(FRECENCY_KEY); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
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