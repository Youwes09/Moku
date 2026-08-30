interface Entry<T> {
  promise:   Promise<T>;
  fetchedAt: number;
  fetcher?:  () => Promise<T>;
  ttl?:      number;
}

const store  = new Map<string, Entry<unknown>>();
const subs   = new Map<string, Set<() => void>>();
const keyToGroups = new Map<string, Set<string>>();
const groups      = new Map<string, Set<string>>();

const DEFAULT_TTL_MS = 5 * 60 * 1_000;

function notify(key: string) { subs.get(key)?.forEach(cb => cb()); }

function registerGroups(key: string, group?: string | string[]) {
  if (!group) return;
  for (const tag of Array.isArray(group) ? group : [group]) {
    if (!groups.has(tag)) groups.set(tag, new Set());
    groups.get(tag)!.add(key);
    if (!keyToGroups.has(key)) keyToGroups.set(key, new Set());
    keyToGroups.get(key)!.add(tag);
  }
}

function unregisterKey(key: string) {
  const tags = keyToGroups.get(key);
  if (tags) {
    for (const tag of tags) groups.get(tag)?.delete(key);
    keyToGroups.delete(key);
  }
}

export const cache = {
  get<T>(key: string, fetcher: () => Promise<T>, ttl = DEFAULT_TTL_MS, group?: string | string[]): Promise<T> {
    const existing = store.get(key) as Entry<T> | undefined;
    if (existing && Date.now() - existing.fetchedAt < ttl) return existing.promise;
    const promise = fetcher().catch(err => {
      if (err?.name !== "AbortError") store.delete(key);
      return Promise.reject(err);
    }) as Promise<T>;
    store.set(key, { promise, fetchedAt: Date.now(), fetcher: fetcher as () => Promise<unknown>, ttl });
    registerGroups(key, group);
    promise.then(() => notify(key)).catch(() => {});
    return promise;
  },

  set<T>(key: string, value: T, group?: string | string[]) {
    const existing = store.get(key) as Entry<T> | undefined;
    store.set(key, {
      promise: Promise.resolve(value),
      fetchedAt: Date.now(),
      fetcher: existing?.fetcher,
      ttl: existing?.ttl,
    });
    registerGroups(key, group);
    notify(key);
  },

  update<T>(key: string, fn: (prev: T) => T) {
    const existing = store.get(key) as Entry<T> | undefined;
    if (!existing) return;
    const next = existing.promise.then(fn);
    store.set(key, { ...existing, promise: next, fetchedAt: Date.now() });
    next.then(() => notify(key)).catch(() => {});
  },

  refresh<T>(key: string): Promise<T> | undefined {
    const existing = store.get(key) as Entry<T> | undefined;
    if (!existing?.fetcher) return undefined;
    const promise = (existing.fetcher as () => Promise<T>)().catch(err => {
      if (err?.name !== "AbortError") store.delete(key);
      return Promise.reject(err);
    });
    store.set(key, { ...existing, promise: promise as Promise<unknown>, fetchedAt: Date.now() });
    promise.then(() => notify(key)).catch(() => {});
    return promise;
  },

  refreshGroup(tag: string): void {
    const keys = groups.get(tag);
    if (!keys) return;
    for (const key of [...keys]) {
      const existing = store.get(key);
      if (existing?.fetcher) {
        const promise = existing.fetcher().catch(err => {
          if (err?.name !== "AbortError") store.delete(key);
          return Promise.reject(err);
        });
        store.set(key, { ...existing, promise, fetchedAt: Date.now() });
        promise.then(() => notify(key)).catch(() => {});
      }
    }
  },

  has(key: string): boolean { return store.has(key); },

  ageOf(key: string): number | undefined {
    const e = store.get(key);
    return e ? Date.now() - e.fetchedAt : undefined;
  },

  isStale(key: string): boolean {
    const e = store.get(key);
    if (!e) return true;
    return Date.now() - e.fetchedAt >= (e.ttl ?? DEFAULT_TTL_MS);
  },

  clear(key: string) {
    unregisterKey(key);
    store.delete(key);
    notify(key);
  },

  clearGroup(tag: string) {
    const keys = groups.get(tag);
    if (!keys) return;
    for (const key of [...keys]) {
      keyToGroups.get(key)?.delete(tag);
      if (keyToGroups.get(key)?.size === 0) keyToGroups.delete(key);
      store.delete(key);
      notify(key);
    }
    groups.delete(tag);
  },

  clearAll() {
    const allKeys = [...store.keys()];
    store.clear();
    groups.clear();
    keyToGroups.clear();
    allKeys.forEach(notify);
  },

  subscribe(key: string, cb: () => void): () => void {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key)!.add(cb);
    return () => subs.get(key)?.delete(cb);
  },
};

export const CACHE_GROUPS = {
  LIBRARY: "g:library",
} as const;

export const CACHE_KEYS = {
  LIBRARY:        "library",
  RECENT_UPDATES: "recent_updates",
  MANGA:    (id: string)    => `manga:${id}`,
} as const;

