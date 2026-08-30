import { getBlobUrl, preloadBlobUrls, revokeBlobUrl } from "$lib/core/cache/imageCache";
import { settingsState }                              from "$lib/state/settings.svelte";

const pageCache        = new Map<string, string[]>();
const inflight         = new Map<string, Promise<string[]>>();
const resolvedUrlCache = new Map<string, Promise<string>>();
const aspectCache      = new Map<string, number>();

function getServerUrl(): string {
  const u = settingsState.settings.serverUrl;
  return typeof u === "string" && u.trim() ? u.replace(/\/$/, "") : "http://localhost:6007";
}
export { getServerUrl as pageServerUrl };

async function fetchChapterPagesFromServer(_mediaId: string, chapterId: string): Promise<string[]> {
  const base  = getServerUrl();
  const query = `query ChapterPages($id: ID!) { chapter(id: $id) { pages } }`;
  const res   = await fetch(`${base}/api/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: chapterId } }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  const pages = (json.data?.chapter?.pages as string[] | null) ?? [];
  return pages.map(p => (p.startsWith("http") ? p : `${base}${p}`));
}

export function resolveUrl(url: string, useBlob: boolean, priority = 0): Promise<string> {
  if (!useBlob) return Promise.resolve(url);
  const cached = resolvedUrlCache.get(url);
  if (cached) return cached;
  const p = getBlobUrl(url, priority).catch(err => {
    resolvedUrlCache.delete(url);
    return Promise.reject(err);
  });
  resolvedUrlCache.set(url, p);
  return p;
}

export function fetchPages(
  mediaId: string,
  chapterId: string,
  useBlob: boolean,
  signal?: AbortSignal,
  priorityPage = 0,
): Promise<string[]> {
  const cached = pageCache.get(chapterId);
  if (cached) return Promise.resolve(cached);
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

  if (!inflight.has(chapterId)) {
    const p = fetchChapterPagesFromServer(mediaId, chapterId)
      .then(urls => {
        if (useBlob && urls[priorityPage]) getBlobUrl(urls[priorityPage], 999);
        pageCache.set(chapterId, urls);
        return urls;
      })
      .finally(() => inflight.delete(chapterId));
    inflight.set(chapterId, p);
  }

  const base = inflight.get(chapterId)!;
  if (!signal) return base;
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    base.then(resolve, reject);
  });
}

export function measureAspect(url: string, useBlob: boolean): Promise<number> {
  if (aspectCache.has(url)) return Promise.resolve(aspectCache.get(url)!);
  return resolveUrl(url, useBlob).then(src => new Promise(res => {
    const img   = new Image();
    img.onload  = () => { const r = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0.67; aspectCache.set(url, r); res(r); };
    img.onerror = () => res(0.67);
    img.src     = src;
  }));
}

export function preloadImage(url: string, useBlob: boolean): void {
  if (useBlob) { preloadBlobUrls([url], 0); return; }
  resolveUrl(url, useBlob).then(src => { new Image().src = src; }).catch(() => {});
}

export function clearResolvedUrlCache(): void {
  for (const promise of resolvedUrlCache.values()) {
    promise.then(blobUrl => { if (blobUrl) revokeBlobUrl(blobUrl); }).catch(() => {});
  }
  resolvedUrlCache.clear();
  aspectCache.clear();
}

export function getCachedAspect(url: string): number | undefined {
  return aspectCache.get(url);
}

export function clearPageCache(chapterId?: string): void {
  if (chapterId !== undefined) {
    pageCache.delete(chapterId);
    inflight.delete(chapterId);
  } else {
    pageCache.clear();
    inflight.clear();
    resolvedUrlCache.clear();
    aspectCache.clear();
  }
}
