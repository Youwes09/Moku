<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { page }               from "$app/stores";
  import { goto }               from "$app/navigation";
  import { tsunagu }            from "$lib/server-adapters/tsunagu";
  import { settingsState }      from "$lib/state/settings.svelte";
  import { setPreviewManga }    from "$lib/state/series.svelte";
  import { toCachedManga, toBrowseManga, toSource, shouldHideNsfw, runConcurrent, type CachedManga } from "$lib/components/browse/lib/searchFilter";
  import type { Manga, Source } from "$lib/types";

  import KeywordTab from "$lib/components/browse/KeywordTab.svelte";
  import TagTab     from "$lib/components/browse/TagTab.svelte";
  import SourceTab  from "$lib/components/browse/SourceTab.svelte";

  interface Props {
    initialTab?:          "keyword" | "tag" | "source";
    preselectedSourceId?: string;
  }
  let { initialTab, preselectedSourceId }: Props = $props();

  const anims = $derived(settingsState.settings.qolAnimations ?? true);

  type SearchTab = "keyword" | "tag" | "source";

  const urlTab   = $derived(($page.url.searchParams.get("tab") as SearchTab | null) ?? initialTab ?? "keyword");
  const urlQuery = $derived($page.url.searchParams.get("q") ?? "");

  function setTab(next: SearchTab) {
    const u = new URL($page.url);
    u.searchParams.set("tab", next);
    goto(u.toString(), { replaceState: true, noScroll: true });
  }

  function setQuery(next: string) {
    const u = new URL($page.url);
    if (next) u.searchParams.set("q", next);
    else u.searchParams.delete("q");
    goto(u.toString(), { replaceState: true, noScroll: true });
  }

  let pendingPrefill = $state("");

  let tabsEl       = $state<HTMLDivElement | undefined>(undefined);
  let tabIndicator = $state({ left: 0, width: 0 });

  function updateIndicator() {
    if (!tabsEl) return;
    const active = tabsEl.querySelector<HTMLElement>(".tab.tabActive");
    if (!active) return;
    tabIndicator = { left: active.offsetLeft, width: active.offsetWidth };
  }

  $effect(() => { urlTab; if (anims) requestAnimationFrame(() => requestAnimationFrame(updateIndicator)); });

  const SEARCH_PAGES        = 3;
  const SEARCH_LIMIT        = 200;
  const SEARCH_BATCH        = 20;
  const POPULAR_CACHE_PAGES = 3;

  let allSourcesRaw:  Source[] = $state([]);
  let localSource:   Source | null = $state(null);
  let loadingSources             = $state(false);

  const contentTypeFilter = $derived(settingsState.settings.contentTypeFilter ?? "all");
  const allSources = $derived(
    contentTypeFilter === "all"
      ? allSourcesRaw
      : allSourcesRaw.filter((s) => s.contentType === contentTypeFilter)
  );

  const preferredLang    = $derived(settingsState.settings.preferredExtensionLang ?? "en");
  const availableLangs   = $derived(Array.from(new Set<string>(allSources.map((s) => s.lang))).sort());
  const hasMultipleLangs = $derived(availableLangs.length > 1);

  let sourcesAbort: AbortController | null = null;

  $effect(() => {
    sourcesAbort?.abort();
    const ctrl = new AbortController();
    sourcesAbort = ctrl;
    loadingSources = true;
    tsunagu.installedExtensions()
      .then((exts) => {
        if (ctrl.signal.aborted) return;
        localSource   = null;
        allSourcesRaw = exts.map(toSource);
      })
      .catch(console.error)
      .finally(() => { if (!ctrl.signal.aborted) loadingSources = false; });
    return () => { ctrl.abort(); };
  });

  let popular_raw:          Manga[] = $state([]);
  let popular_loading                  = $state(false);
  let popular_abortCtrl: AbortController | null = null;
  let popular_sourcePool:   Source[] = [];
  let popular_sourceCursor             = 0;
  let popular_seenIds    = new Set<string>();
  let popular_seenTitles = new Set<string>();

  const popular_results = $derived(popular_raw.map((m, i) => ({ ...m, _priority: Math.max(0, 50 - i) })));

  function popular_push(incoming: Manga[]) {
    const toAdd: Manga[] = [];
    for (const m of incoming) {
      if (shouldHideNsfw(m as any, settingsState.settings)) continue;
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
    if (signal.aborted) return;
    const batch = popular_sourcePool.slice(popular_sourceCursor, popular_sourceCursor + SEARCH_BATCH);
    if (!batch.length) {
      popular_sourceCursor = popular_sourcePool.length;
      return;
    }
    await runConcurrent(batch, async (src) => {
      for (let p = 1; p <= SEARCH_PAGES; p++) {
        if (signal.aborted) return;
        try {
          const result = await tsunagu.popularManga(src.id, p, signal);
          if (signal.aborted) return;
          popular_push(result.results.map((r) => toBrowseManga(r, src.id, undefined, src.contentType)));
          if (!result.hasNextPage) break;
        } catch { break; }
      }
    }, signal);
    popular_sourceCursor += batch.length;
  }

  function popularStart(sources: Source[]) {
    if (popular_raw.length > 0) return;
    popular_abortCtrl?.abort();
    const ctrl = new AbortController();
    popular_abortCtrl = ctrl;
    popular_seenIds.clear();
    popular_seenTitles.clear();
    popular_raw = [];
    popular_sourcePool   = sources;
    popular_sourceCursor = 0;
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

  export const sourceCache = new Map<string, CachedManga>();
  let sourceCacheReady     = $state(false);
  let sourceCacheLoading   = $state(false);
  let sourceCacheEnriching = $state(false);
  let sourceCacheAbort: AbortController | null = null;

  async function buildSourceCache(sources: Source[], signal: AbortSignal) {
    const tasks: { src: Source; page: number }[] = [];
    for (const src of sources) {
      for (let p = 1; p <= POPULAR_CACHE_PAGES; p++) tasks.push({ src, page: p });
    }
    await runConcurrent(tasks, async ({ src, page: p }) => {
      if (signal.aborted) return;
      try {
        const result = await tsunagu.popularManga(src.id, p, signal);
        if (signal.aborted) return;
        for (const r of result.results) {
          const m = toBrowseManga(r, src.id, undefined, src.contentType);
          if (!sourceCache.has(m.id)) sourceCache.set(m.id, toCachedManga(m as any, src.id));
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }, signal);
  }

  async function enrichGenres(_signal: AbortSignal) {}

  function startSourceCacheBuild() {
    if (sourceCacheLoading || sourceCacheReady) return;
    sourceCacheAbort?.abort();
    const ctrl = new AbortController();
    sourceCacheAbort  = ctrl;
    sourceCacheLoading = true;
    sourceCache.clear();
    buildSourceCache(allSources, ctrl.signal)
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

  let prevContentType = untrack(() => contentTypeFilter);
  $effect(() => {
    const ct = contentTypeFilter;
    if (ct === prevContentType) return;
    prevContentType = ct;
    untrack(() => {
      popular_abortCtrl?.abort();
      popular_raw = [];
      popular_seenIds.clear();
      popular_seenTitles.clear();
      popular_sourceCursor = 0;
      sourceCacheAbort?.abort();
      sourceCache.clear();
      sourceCacheReady   = false;
      sourceCacheLoading = false;
    });
  });

  $effect(() => {
    if ($page.url.pathname !== "/browse") return;
    const tab = urlTab;
    const sources = allSources;
    if (!sources.length) return;
    untrack(() => {
      if (tab === "keyword") popularStart(sources);
      else if (tab === "tag") startSourceCacheBuild();
    });
  });

  onDestroy(() => {
    sourcesAbort?.abort();
    popular_abortCtrl?.abort();
    sourceCacheAbort?.abort();
  });
</script>

<div class="root">
  <div class="header">
    <span class="heading">Search</span>

    <div class="tabs" class:tabs-anims={anims} bind:this={tabsEl}>
      {#if anims && tabIndicator.width > 0}
        <div class="tab-slide-indicator" style="left:{tabIndicator.left}px;width:{tabIndicator.width}px" aria-hidden="true"></div>
      {/if}
      <button class="tab" class:tabActive={urlTab === "keyword"} onclick={() => setTab("keyword")}>
        <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M229.66,218.34l-50.07-50.07a88,88,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
        </svg>
        Keyword
      </button>
      <button class="tab" class:tabActive={urlTab === "tag"} onclick={() => setTab("tag")}>
        <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M224,104H200l8-48a8,8,0,0,0-15.79-2.67L183.79,104H136l8-48a8,8,0,0,0-15.79-2.67L119.79,104H72a8,8,0,0,0,0,16h45.33L105.6,200H56a8,8,0,0,0,0,16H103l-8,48a8,8,0,0,0,15.79,2.67L119.21,216H168l-8,48a8,8,0,0,0,15.79,2.67L184.21,216H232a8,8,0,0,0,0-16H186.67l11.73-80H224a8,8,0,0,0,0-16Zm-69.33,96H101.6L113.33,120h53.07Z"/>
        </svg>
        Tags
      </button>
      <button class="tab" class:tabActive={urlTab === "source"} onclick={() => setTab("source")}>
        <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"/>
        </svg>
        Sources
      </button>
    </div>
  </div>

  {#if urlTab === "keyword"}
    <KeywordTab
      {allSources}
      {availableLangs}
      {hasMultipleLangs}
      {loadingSources}
      {pendingPrefill}
      popularResults={popular_results}
      popularLoading={popular_loading}
      {sourceCache}
      query={urlQuery}
      onQueryChange={setQuery}
      onPrefillConsumed={() => { pendingPrefill = ""; }}
      onPreview={(m) => setPreviewManga(m)}
    />
  {:else if urlTab === "tag"}
    <TagTab
      {allSources}
      {sourceCache}
      {sourceCacheReady}
      {sourceCacheLoading}
      {sourceCacheEnriching}
      onPreview={(m) => setPreviewManga(m)}
    />
  {:else}
    <SourceTab
      {allSources}
      {availableLangs}
      {loadingSources}
      {localSource}
      {preselectedSourceId}
      onPreview={(m) => setPreviewManga(m)}
    />
  {/if}
</div>

<style>
  .root   { display: flex; flex-direction: column; height: 100%; overflow: hidden; animation: fadeIn 0.14s ease both; }
  .header { position: relative; z-index: 100; display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4) var(--sp-6); flex-shrink: 0; border-bottom: 1px solid var(--border-dim); }
  .heading { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; flex-shrink: 0; }
  .tabs { margin-left: auto; display: flex; gap: 2px; background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 2px; position: relative; }
  .tab-slide-indicator { position: absolute; top: 2px; bottom: 2px; border-radius: var(--radius-sm); background: var(--accent-muted); border: 1px solid var(--accent-dim); pointer-events: none; z-index: 0; transition: left 0.22s cubic-bezier(0.16,1,0.3,1), width 0.22s cubic-bezier(0.16,1,0.3,1); }
  .tab { position: relative; z-index: 1; display: flex; align-items: center; gap: 5px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; padding: 4px 10px; border-radius: var(--radius-sm); color: var(--text-faint); white-space: nowrap; transition: background var(--t-base), color var(--t-base); cursor: pointer; border: 1px solid transparent; }
  .tab:hover { color: var(--text-muted); }
  .tabActive { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .tabs-anims .tabActive { background: transparent; border-color: transparent; }
  .tabActive:hover { color: var(--accent-fg); }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
