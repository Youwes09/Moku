<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { gql }                from "@api/client";
  import { GET_SOURCES }        from "@api/queries/extensions";
  import { FETCH_SOURCE_MANGA } from "@api/mutations/downloads";
  import { FETCH_MANGA }        from "@api/mutations/manga";
  import { runConcurrent }      from "@core/async/batchRequests";
  import { deprioritizeQueue }  from "@core/cache/imageCache";
  import { dedupeSourcesByLang }from "@core/algorithms/filter";
  import { shouldHideNsfw }     from "@core/util";
  import { store, setSearchPrefill, setPreviewManga, setSearchQuery } from "@store/state.svelte";
  import {
    toCachedManga,
    type CachedManga,
  } from "@features/discover/lib/searchFilter";
  import type { Manga, Source } from "@types";

  import KeywordTab   from "./KeywordTab.svelte";
  import TagTab       from "./TagTab.svelte";
  import SourceTab    from "./SourceTab.svelte";

  const anims = $derived(store.settings.qolAnimations ?? true);

  const TABS = ["keyword", "tag", "source"] as const;

  let tabsEl = $state<HTMLDivElement | undefined>(undefined);
  let tabIndicator = $state({ left: 0, width: 0 });

  function updateIndicator() {
    if (!tabsEl) return;
    const active = tabsEl.querySelector<HTMLElement>(".tab.tabActive");
    if (!active) return;
    tabIndicator = { left: active.offsetLeft, width: active.offsetWidth };
  }

  $effect(() => { tab; if (anims) requestAnimationFrame(() => requestAnimationFrame(updateIndicator)); });

  const SEARCH_PAGES         = 3;
  const SEARCH_LIMIT         = 200;
  const SEARCH_BATCH         = 20;
  const POPULAR_CACHE_PAGES  = 3;

  type SearchTab = "keyword" | "tag" | "source";
  let tab: SearchTab = $state("keyword");

  let pendingPrefill = $state("");
  $effect(() => {
    if (store.searchPrefill) {
      const prefill = store.searchPrefill;
      untrack(() => {
        pendingPrefill = prefill;
        tab = "keyword";
        setSearchPrefill("");
      });
    }
  });

  let allSources:    Source[] = $state([]);
  let localSource:   Source | null = $state(null);
  let loadingSources           = $state(false);

  const preferredLang   = store.settings?.preferredExtensionLang ?? "en";
  const availableLangs  = $derived(Array.from(new Set<string>(allSources.map((s) => s.lang))).sort());
  const hasMultipleLangs = $derived(availableLangs.length > 1);

  loadingSources = true;
  gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
    .then((d) => {
      const nodes = d.sources.nodes;
      localSource = nodes.find((src: Source) => src.id === "0") ?? null;
      allSources = nodes.filter((src: Source) => src.id !== "0");
      startSourceCacheBuild();
      popularStart(allSources);
    })
    .catch(console.error)
    .finally(() => { loadingSources = false; });

  let popular_raw:    Manga[] = $state([]);
  let popular_loading            = $state(false);
  let popular_moreLoading        = $state(false);
  let popular_abortCtrl: AbortController | null = null;
  let popular_sourcePool: Source[] = $state([]);
  let popular_sourceCursor         = $state(0);
  let popular_hasMore              = $state(false);
  let popular_seenIds    = new Set<number>();
  let popular_seenTitles = new Set<string>();

  const popular_results: (Manga & { _priority: number })[] = $derived(
    popular_raw.map((m, i) => ({ ...m, _priority: Math.max(0, 50 - i) }))
  );

  function popular_push(incoming: Manga[]) {
    const toAdd: Manga[] = [];
    for (const m of incoming) {
      if (shouldHideNsfw(m, store.settings)) continue;
      if (popular_seenIds.has(m.id)) continue;
      const norm = m.title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
      if (popular_seenTitles.has(norm)) continue;
      popular_seenIds.add(m.id);
      popular_seenTitles.add(norm);
      toAdd.push(m);
    }
    if (!toAdd.length) return;
    popular_raw = [...popular_raw, ...toAdd].slice(0, SEARCH_LIMIT);
  }

  async function popular_fanOut(signal: AbortSignal) {
    const batch = popular_sourcePool.slice(popular_sourceCursor, popular_sourceCursor + SEARCH_BATCH);
    if (!batch.length) { popular_hasMore = false; return; }

    await runConcurrent(batch, async (src) => {
      for (let page = 1; page <= SEARCH_PAGES; page++) {
        if (signal.aborted) return;
        const key = `${src.id}|POPULAR|All:p${page}`;
        let mangas: Manga[];
        if (store.searchCache?.has(key)) {
          mangas = store.searchCache.get(key)!;
        } else {
          const result = await gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
            FETCH_SOURCE_MANGA,
            { source: src.id, type: "POPULAR", page, query: null },
            signal,
          ).then((d) => d.fetchSourceManga).catch(() => null);
          if (!result || signal.aborted) break;
          mangas = result.mangas;
          store.searchCache?.set(key, mangas);
          if (!result.hasNextPage) { popular_push(mangas); break; }
        }
        popular_push(mangas);
      }
    }, signal);

    popular_sourceCursor += batch.length;
    popular_hasMore = popular_sourceCursor < popular_sourcePool.length;
  }

  function popularStart(sources: Source[]) {
    if (popular_raw.length > 0) return;
    popular_abortCtrl?.abort();
    const ctrl = new AbortController();
    popular_abortCtrl = ctrl;
    popular_seenIds.clear();
    popular_seenTitles.clear();
    popular_raw = [];
    popular_sourcePool = dedupeSourcesByLang(sources, preferredLang, store.settings, true);
    popular_sourceCursor = 0;
    popular_hasMore = false;
    popular_moreLoading = false;
    popular_loading = true;
    (async () => {
      try {
        while (!ctrl.signal.aborted && popular_sourceCursor < popular_sourcePool.length) {
          await popular_fanOut(ctrl.signal);
        }
      } catch {}
      if (!ctrl.signal.aborted) popular_loading = false;
    })();
  }

  export const sourceCache = new Map<number, CachedManga>();

  let sourceCacheReady     = $state(false);
  let sourceCacheLoading   = $state(false);
  let sourceCacheEnriching = $state(false);
  let sourceCacheAbort: AbortController | null = null;

  async function buildSourceCache(sources: Source[], signal: AbortSignal) {
    const tasks: { src: Source; page: number }[] = [];
    for (const src of sources) {
      for (let p = 1; p <= POPULAR_CACHE_PAGES; p++) tasks.push({ src, page: p });
    }
    await runConcurrent(tasks, async ({ src, page }) => {
      if (signal.aborted) return;
      try {
        const cacheKey = `${src.id}|POPULAR|All:p${page}`;
        let mangas: Manga[];
        if (store.searchCache?.has(cacheKey)) {
          mangas = store.searchCache.get(cacheKey)!;
        } else {
          const d = await gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
            FETCH_SOURCE_MANGA,
            { source: src.id, type: "POPULAR", page },
            signal,
          );
          if (signal.aborted) return;
          mangas = d.fetchSourceManga.mangas;
          store.searchCache?.set(cacheKey, mangas);
        }
        for (const m of mangas) {
          if (!sourceCache.has(m.id)) sourceCache.set(m.id, toCachedManga(m as any, src.id));
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }, signal);
  }

  async function enrichGenres(signal: AbortSignal) {
    const unenriched = [...sourceCache.values()].filter((m) => !m.genreEnriched);
    if (!unenriched.length) return;
    sourceCacheEnriching = true;
    await runConcurrent(unenriched, async (entry) => {
      if (signal.aborted) return;
      try {
        const d = await gql<{ fetchManga: { manga: Manga & { genre: string[]; status: string } } }>(
          FETCH_MANGA, { id: entry.id }, signal,
        );
        if (signal.aborted) return;
        const updated = sourceCache.get(entry.id);
        if (updated) {
          updated.genre         = d.fetchManga.manga.genre ?? [];
          updated.status        = d.fetchManga.manga.status ?? updated.status;
          updated.lowerGenres   = updated.genre.map((g) => g.toLowerCase());
          updated.genreEnriched = true;
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        const updated = sourceCache.get(entry.id);
        if (updated) updated.genreEnriched = true;
      }
    }, signal);
    if (!signal.aborted) sourceCacheEnriching = false;
  }

  function startSourceCacheBuild() {
    if (sourceCacheLoading || sourceCacheReady) return;
    sourceCacheAbort?.abort();
    const ctrl = new AbortController();
    sourceCacheAbort = ctrl;
    sourceCacheLoading = true;
    sourceCache.clear();
    const dedupedSources = dedupeSourcesByLang(allSources, preferredLang, store.settings, true);
    buildSourceCache(dedupedSources, ctrl.signal)
      .then(() => {
        if (ctrl.signal.aborted) return;
        sourceCacheReady   = true;
        sourceCacheLoading = false;
        enrichGenres(ctrl.signal);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") console.error(e);
        sourceCacheLoading = false;
      });
  }

  onDestroy(() => {
    popular_abortCtrl?.abort();
    sourceCacheAbort?.abort();
  });
</script>

<div class="root anim-fade-in">
  <div class="header">
    <span class="heading">Search</span>

    <div class="tabs" class:tabs-anims={anims} bind:this={tabsEl}>
      {#if anims && tabIndicator.width > 0}
        <div class="tab-slide-indicator" style="left:{tabIndicator.left}px;width:{tabIndicator.width}px" aria-hidden="true"></div>
      {/if}
      <button class="tab" class:tabActive={tab === "keyword"} onclick={() => { deprioritizeQueue(); tab = "keyword"; }}>
        <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M229.66,218.34l-50.07-50.07a88,88,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
        </svg>
        Keyword
      </button>
      <button class="tab" class:tabActive={tab === "tag"} onclick={() => { deprioritizeQueue(); tab = "tag"; }}>
        <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M224,104H200l8-48a8,8,0,0,0-15.79-2.67L183.79,104H136l8-48a8,8,0,0,0-15.79-2.67L119.79,104H72a8,8,0,0,0,0,16h45.33L105.6,200H56a8,8,0,0,0,0,16H103l-8,48a8,8,0,0,0,15.79,2.67L119.21,216H168l-8,48a8,8,0,0,0,15.79,2.67L184.21,216H232a8,8,0,0,0,0-16H186.67l11.73-80H224a8,8,0,0,0,0-16Zm-69.33,96H101.6L113.33,120h53.07Z"/>
        </svg>
        Tags
      </button>
      <button class="tab" class:tabActive={tab === "source"} onclick={() => { deprioritizeQueue(); tab = "source"; }}>
        <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"/>
        </svg>
        Sources
      </button>
    </div>
  </div>

  {#if tab === "keyword"}
    <KeywordTab
      {allSources}
      {availableLangs}
      {hasMultipleLangs}
      {loadingSources}
      {pendingPrefill}
      popularResults={popular_results}
      popularLoading={popular_loading}
      {sourceCache}
      query={store.searchQuery}
      onQueryChange={setSearchQuery}
      onPrefillConsumed={() => (pendingPrefill = "")}
      onPreview={setPreviewManga}
    />
  {:else if tab === "tag"}
    <TagTab
      {allSources}
      {sourceCache}
      {sourceCacheReady}
      {sourceCacheLoading}
      {sourceCacheEnriching}
      onPreview={setPreviewManga}
    />
  {:else}
    <SourceTab
      {allSources}
      {availableLangs}
      {loadingSources}
      {localSource}
      onPreview={setPreviewManga}
    />
  {/if}
</div>

<style>
  .root   { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .header { position: relative; z-index: 100; display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4) var(--sp-6); flex-shrink: 0; border-bottom: 1px solid var(--border-dim); }
  .heading { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; flex-shrink: 0; }
  .tabs { margin-left: auto; display: flex; gap: 2px; background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 2px; position: relative; }
  .tab-slide-indicator { position: absolute; top: 2px; bottom: 2px; border-radius: var(--radius-sm); background: var(--accent-muted); border: 1px solid var(--accent-dim); pointer-events: none; z-index: 0; transition: left 0.22s cubic-bezier(0.16,1,0.3,1), width 0.22s cubic-bezier(0.16,1,0.3,1); }
  .tab { position: relative; z-index: 1; display: flex; align-items: center; gap: 5px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; padding: 4px 10px; border-radius: var(--radius-sm); color: var(--text-faint); white-space: nowrap; transition: background var(--t-base), color var(--t-base); cursor: pointer; border: 1px solid transparent; }
  .tab:hover { color: var(--text-muted); }
  .tabActive { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .tabs-anims .tabActive { background: transparent; border-color: transparent; }
  .tabActive:hover { color: var(--accent-fg); }
</style>