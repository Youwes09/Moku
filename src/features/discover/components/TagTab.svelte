<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { gql }                from "@api/client";
  import { FETCH_SOURCE_MANGA } from "@api/mutations/downloads";
  import { MANGAS_BY_GENRE }    from "@api/queries/manga";
  import { runConcurrent }      from "@core/async/batchRequests";
  import { dedupeSourcesByLang }from "@core/algorithms/filter";
  import { shouldHideNsfw, dedupeMangaById, dedupeMangaByTitle, normalizeTitle } from "@core/util";
  import { store }              from "@store/state.svelte";
  import Thumbnail              from "@shared/manga/Thumbnail.svelte";
  import {
    buildTagFilter,
    filterSourceCache,
    COMMON_GENRES,
    MANGA_STATUSES,
    type TagMode,
    type CachedManga,
  } from "@features/discover/lib/searchFilter";
  import type { Manga, Source } from "@types";

  interface Props {
    allSources:          Source[];
    sourceCache:         Map<number, CachedManga>;
    sourceCacheReady:    boolean;
    sourceCacheLoading:  boolean;
    sourceCacheEnriching: boolean;
    onPreview:           (m: Manga) => void;
  }
  let {
    allSources, sourceCache,
    sourceCacheReady, sourceCacheLoading, sourceCacheEnriching,
    onPreview,
  }: Props = $props();

  const SEARCH_LIMIT  = 200;
  const preferredLang = store.settings?.preferredExtensionLang ?? "en";

  let tag_activeTags:     string[] = $state([]);
  let tag_activeStatuses: string[] = $state([]);
  let tag_tagMode:        TagMode  = $state("AND");
  let tag_tagFilter                = $state("");

  const tag_filteredGenres   = $derived.by(() => {
    const q = tag_tagFilter.trim().toLowerCase();
    return q ? COMMON_GENRES.filter((g) => g.toLowerCase().includes(q)) : [...COMMON_GENRES];
  });
  const tag_hasActiveFilters = $derived(tag_activeTags.length > 0 || tag_activeStatuses.length > 0);

  let tag_localResults:   Manga[]  = $state([]);
  let tag_totalCount               = $state(0);
  let tag_loadingLocal             = $state(false);
  let tag_loadingMoreLocal         = $state(false);
  let tag_localOffset              = $state(0);
  let tag_localHasNext             = $state(false);
  let tag_abortLocal: AbortController | null = null;

  $effect(() => {
    const _tags     = tag_activeTags;
    const _mode     = tag_tagMode;
    const _statuses = tag_activeStatuses;
    untrack(() => tagFetchLocal(_tags, _mode, _statuses));
  });

  $effect(() => {
    if (tag_localHasNext && !tag_loadingMoreLocal && !tag_loadingLocal) tagLoadMoreLocal();
  });

  async function tagFetchLocal(activeTags: string[], tagMode: TagMode, activeStatuses: string[]) {
    if (activeTags.length === 0 && activeStatuses.length === 0) {
      tag_localResults = []; tag_totalCount = 0; tag_localHasNext = false; tag_localOffset = 0;
      return;
    }
    tag_abortLocal?.abort();
    const ctrl = new AbortController();
    tag_abortLocal = ctrl;
    tag_localResults = []; tag_totalCount = 0; tag_localOffset = 0; tag_localHasNext = false;
    tag_loadingLocal = true;
    gql<{ mangas: { nodes: Manga[]; pageInfo: { hasNextPage: boolean }; totalCount: number } }>(
      MANGAS_BY_GENRE,
      { filter: buildTagFilter(activeTags, tagMode, activeStatuses), first: (store.settings.renderLimit ?? 48), offset: 0 },
      ctrl.signal,
    ).then((d) => {
      if (ctrl.signal.aborted) return;
      const nsfwFilter = (m: Manga) => !shouldHideNsfw(m, store.settings);
      tag_localResults = d.mangas.nodes.filter(nsfwFilter);
      tag_totalCount   = d.mangas.totalCount;
      tag_localHasNext = d.mangas.pageInfo.hasNextPage;
      tag_localOffset  = (store.settings.renderLimit ?? 48);
    }).catch((e: any) => {
      if (e?.name !== "AbortError") console.error(e);
    }).finally(() => {
      if (!ctrl.signal.aborted) tag_loadingLocal = false;
    });
  }

  async function tagLoadMoreLocal() {
    if (tag_loadingMoreLocal || !tag_localHasNext) return;
    tag_loadingMoreLocal = true;
    tag_abortLocal?.abort();
    const ctrl = new AbortController();
    tag_abortLocal = ctrl;
    try {
      const d = await gql<{ mangas: { nodes: Manga[]; pageInfo: { hasNextPage: boolean } } }>(
        MANGAS_BY_GENRE,
        { filter: buildTagFilter(tag_activeTags, tag_tagMode, tag_activeStatuses), first: (store.settings.renderLimit ?? 48), offset: tag_localOffset },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      const nsfwFilter = (m: Manga) => !shouldHideNsfw(m, store.settings);
      tag_localResults  = [...tag_localResults, ...d.mangas.nodes.filter(nsfwFilter)];
      tag_localHasNext  = d.mangas.pageInfo.hasNextPage;
      tag_localOffset  += (store.settings.renderLimit ?? 48);
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    } finally {
      if (!ctrl.signal.aborted) tag_loadingMoreLocal = false;
    }
  }

  let tag_searchSources    = $state(false);
  let tag_sourceFiltered:  CachedManga[] = $state([]);

  let tag_sourceFanOut:   Manga[]  = $state([]);
  let tag_fanOutLoading            = $state(false);
  let tag_fanOutAbort: AbortController | null = null;

  $effect(() => {
    const _tags     = tag_activeTags;
    const _mode     = tag_tagMode;
    const _statuses = tag_activeStatuses;
    const _ready    = sourceCacheReady;
    const _search   = tag_searchSources;
    untrack(() => {
      if (_search && _ready && (_tags.length > 0 || _statuses.length > 0)) {
        tag_sourceFiltered = filterSourceCache(sourceCache, _tags, _mode, _statuses, store.settings);
      } else {
        tag_sourceFiltered = [];
      }
    });
  });

  $effect(() => {
    const _tags   = tag_activeTags;
    const _search = tag_searchSources;
    untrack(() => {
      if (_search && _tags.length === 1 && tag_activeStatuses.length === 0) {
        tagStartFanOut(_tags[0]);
      } else {
        tag_fanOutAbort?.abort();
        tag_fanOutAbort = null;
        tag_sourceFanOut = [];
        tag_fanOutLoading = false;
      }
    });
  });

  async function tagStartFanOut(genre: string) {
    tag_fanOutAbort?.abort();
    const ctrl = new AbortController();
    tag_fanOutAbort = ctrl;
    tag_sourceFanOut = [];
    tag_fanOutLoading = true;

    const seenIds    = new Set<number>();
    const seenTitles = new Set<string>();
    const genreLower = genre.toLowerCase();
    const srcs = dedupeSourcesByLang(allSources, preferredLang, store.settings, true);

    await runConcurrent(srcs, async (src) => {
      for (let page = 1; page <= 2; page++) {
        if (ctrl.signal.aborted) return;
        const cacheKey = `${src.id}|SEARCH|${genre}:p${page}`;
        let mangas: Manga[];
        let hasNextPage = false;
        if (store.searchCache?.has(cacheKey)) {
          mangas = store.searchCache.get(cacheKey)!;
        } else {
          const result = await gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
            FETCH_SOURCE_MANGA,
            { source: src.id, type: "SEARCH", page, query: genre },
            ctrl.signal,
          ).then((d) => d.fetchSourceManga).catch(() => null);
          if (!result || ctrl.signal.aborted) return;
          mangas = result.mangas;
          hasNextPage = result.hasNextPage;
          store.searchCache?.set(cacheKey, mangas);
        }
        if (ctrl.signal.aborted) return;
        const matching = mangas.filter((m) =>
          ((m as any).genre ?? []).some((g: string) => g.toLowerCase() === genreLower)
        );
        const candidates = (matching.length ? matching : mangas).filter(
          (m) => !shouldHideNsfw(m, store.settings)
        );
        const toAdd: Manga[] = [];
        for (const m of candidates) {
          if (seenIds.has(m.id)) continue;
          const norm = normalizeTitle(m.title);
          if (seenTitles.has(norm)) continue;
          seenIds.add(m.id);
          seenTitles.add(norm);
          toAdd.push(m);
        }
        if (toAdd.length) {
          tag_sourceFanOut = [...tag_sourceFanOut, ...toAdd].slice(0, SEARCH_LIMIT);
        }
        if (!hasNextPage) return;
      }
    }, ctrl.signal);

    if (!ctrl.signal.aborted) tag_fanOutLoading = false;
  }

  let tag_autoSearchFired = $state(false);
  $effect(() => {
    const _tags     = tag_activeTags;
    const _statuses = tag_activeStatuses;
    untrack(() => { tag_autoSearchFired = false; });
    if (!tag_loadingLocal && tag_hasActiveFilters && !tag_autoSearchFired && !tag_searchSources && sourceCacheReady) {
      if (tag_localResults.length < 20) {
        untrack(() => { tag_autoSearchFired = true; tag_searchSources = true; });
      }
    }
  });

  const tag_localIds = $derived(new Set(tag_localResults.map((m) => m.id)));

  const tag_mergedResults = $derived.by(() => {
    const fanOutMapped = tag_sourceFanOut.filter((m) => !tag_localIds.has(m.id));
    const cacheMapped: Manga[] = tag_sourceFiltered
      .filter((m) => !tag_localIds.has(m.id) && !fanOutMapped.some((f) => f.id === m.id))
      .map((m) => ({ id: m.id, title: m.title, thumbnailUrl: m.thumbnailUrl, inLibrary: m.inLibrary, genre: m.genre, status: m.status } as Manga));
    return dedupeMangaByTitle(
      dedupeMangaById([...tag_localResults, ...fanOutMapped, ...cacheMapped]),
      store.settings.mangaLinks,
    );
  });

  const tag_totalVisible = $derived(tag_mergedResults.length);

  function tagToggleTag(tag: string) {
    tag_activeTags = tag_activeTags.includes(tag)
      ? tag_activeTags.filter((t) => t !== tag)
      : [...tag_activeTags, tag];
  }

  function tagToggleStatus(status: string) {
    tag_activeStatuses = tag_activeStatuses.includes(status)
      ? tag_activeStatuses.filter((s) => s !== status)
      : [...tag_activeStatuses, status];
  }

  onDestroy(() => {
    tag_abortLocal?.abort();
    tag_fanOutAbort?.abort();
  });
</script>

<div class="splitRoot">
  
  <div class="splitSidebar">
    <div class="splitSearchWrap">
      <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" class="splitSearchIcon" aria-hidden="true">
        <path d="M229.66,218.34l-50.07-50.07a88,88,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
      </svg>
      <input bind:value={tag_tagFilter} class="splitSearchInput" placeholder="Filter genres…" />
      {#if tag_tagFilter}
        <button class="splitSearchClear" title="Clear" onclick={() => (tag_tagFilter = "")}>×</button>
      {/if}
    </div>
    <div class="splitList">
      <div class="splitSectionLabel">Status</div>
      {#each MANGA_STATUSES as { value, label } (value)}
        <button class="splitItem" class:splitItemActive={tag_activeStatuses.includes(value)} onclick={() => tagToggleStatus(value)}>
          <span class="splitItemLabel">{label}</span>
          {#if tag_activeStatuses.includes(value)}<span class="tagCheckMark">✓</span>{/if}
        </button>
      {/each}
      <div class="splitSectionLabel splitSectionLabelSpaced">Genre</div>
      {#each tag_filteredGenres as tag (tag)}
        <button class="splitItem" class:splitItemActive={tag_activeTags.includes(tag)} onclick={() => tagToggleTag(tag)}>
          <span class="splitItemLabel">{tag}</span>
          {#if tag_activeTags.includes(tag)}<span class="tagCheckMark">✓</span>{/if}
        </button>
      {/each}
      {#if tag_filteredGenres.length === 0}
        <p class="splitEmpty">No matching genres</p>
      {/if}
    </div>
  </div>

  
  <div class="splitContent">
    {#if !tag_hasActiveFilters}
      <div class="empty">
        <svg width="32" height="32" viewBox="0 0 256 256" fill="currentColor" class="emptyIcon" aria-hidden="true">
          <path d="M224,104H200l8-48a8,8,0,0,0-15.79-2.67L183.79,104H136l8-48a8,8,0,0,0-15.79-2.67L119.79,104H72a8,8,0,0,0,0,16h45.33L105.6,200H56a8,8,0,0,0,0,16H103l-8,48a8,8,0,0,0,15.79,2.67L119.21,216H168l-8,48a8,8,0,0,0,15.79,2.67L184.21,216H232a8,8,0,0,0,0-16H186.67l11.73-80H224a8,8,0,0,0,0-16Zm-69.33,96H101.6L113.33,120h53.07Z"/>
        </svg>
        <p class="emptyText">Browse by tag</p>
        <p class="emptyHint">Select a status or genre to find matching manga.</p>
      </div>
    {:else}
      
      <div class="tagActiveBar">
        <div class="tagPillRow">
          {#each tag_activeStatuses as status (status)}
            <span class="tagPill tagPillStatus">
              {MANGA_STATUSES.find((s) => s.value === status)?.label ?? status}
              <button class="tagPillRemove" title="Remove {status}" onclick={() => tagToggleStatus(status)}>×</button>
            </span>
          {/each}
          {#each tag_activeTags as tag (tag)}
            <span class="tagPill">
              {tag}
              <button class="tagPillRemove" title="Remove {tag}" onclick={() => tagToggleTag(tag)}>×</button>
            </span>
          {/each}
        </div>
        <div class="tagBarRight">
          {#if tag_activeTags.length > 1}
            <div class="tagModeToggle">
              <button class="tagModeBtn" class:tagModeBtnActive={tag_tagMode === "AND"} title="Match ALL tags" onclick={() => (tag_tagMode = "AND")}>AND</button>
              <button class="tagModeBtn" class:tagModeBtnActive={tag_tagMode === "OR"}  title="Match ANY tag"  onclick={() => (tag_tagMode = "OR")}>OR</button>
            </div>
          {/if}
          <button
            class="tagModeBtn"
            class:tagModeBtnActive={tag_searchSources}
            title={sourceCacheLoading ? "Building source cache…" : sourceCacheReady ? "Search across sources" : "Sources unavailable"}
            disabled={!sourceCacheReady && !sourceCacheLoading}
            onclick={() => (tag_searchSources = !tag_searchSources)}
          >
            {#if sourceCacheLoading || tag_fanOutLoading}
              <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" class="anim-spin" aria-hidden="true">
                <path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/>
              </svg>
            {:else}
              <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor" style="margin-right:3px;vertical-align:middle" aria-hidden="true">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM101.63,168h52.74C149,186.34,140,202.87,128,215.89,116,202.87,107,186.34,101.63,168ZM98,152a145.72,145.72,0,0,1,0-48h60a145.72,145.72,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.79a161.79,161.79,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154.37,88H101.63C107,69.66,116,53.13,128,40.11,140,53.13,149,69.66,154.37,88ZM174.21,104h38.46a88.15,88.15,0,0,1,0,48H174.21a161.79,161.79,0,0,0,0-48Zm32.32-16H170.71a133.32,133.32,0,0,0-22.7-45.8A88.21,88.21,0,0,1,206.53,88ZM108,42.2A133.32,133.32,0,0,0,85.29,88H49.47A88.21,88.21,0,0,1,108,42.2ZM49.47,168H85.29A133.32,133.32,0,0,0,108,213.8,88.21,88.21,0,0,1,49.47,168Zm98.53,45.8A133.32,133.32,0,0,0,170.71,168h35.82A88.21,88.21,0,0,1,148,213.8Z"/>
              </svg>
            {/if}
            Sources{sourceCacheEnriching ? " ·" : ""}
          </button>
          <button class="tagClearAll" onclick={() => { tag_activeTags = []; tag_activeStatuses = []; }}>Clear all</button>
        </div>
      </div>

      
      <div class="splitContentHeader">
        <span class="splitContentTitle">
          {#if tag_activeStatuses.length > 0 && tag_activeTags.length === 0}
            {tag_activeStatuses.map((s) => MANGA_STATUSES.find((x) => x.value === s)?.label ?? s).join(" · ")}
          {:else if tag_activeTags.length === 1 && tag_activeStatuses.length === 0}
            {tag_activeTags[0]}
          {:else}
            {[...tag_activeStatuses.map((s) => MANGA_STATUSES.find((x) => x.value === s)?.label ?? s), ...tag_activeTags].join(` ${tag_tagMode} `)}
          {/if}
          {#if tag_searchSources}
            <span style="margin-left:6px;font-weight:400;opacity:0.55;font-size:0.9em">+ sources</span>
          {/if}
        </span>
        {#if tag_loadingLocal}
          <svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor" class="anim-spin" style="color:var(--text-faint)" aria-hidden="true">
            <path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/>
          </svg>
        {:else}
          <span class="splitResultCount">
            {tag_totalVisible}{tag_localHasNext ? "+" : ""} results
            {#if tag_searchSources && sourceCacheReady}
              · {sourceCache.size} cached
            {/if}
          </span>
        {/if}
      </div>

      
      {#if tag_loadingLocal}
        <div class="tagGrid">
          {#each Array(48) as _, i (i)}
            <div class="skCard"><div class="skeleton skCover"></div><div class="skeleton skTitle"></div></div>
          {/each}
        </div>
      {:else if tag_mergedResults.length > 0}
        <div class="tagGrid">
          {#each tag_mergedResults as m, i (m.id)}
            <button class="card" onclick={() => onPreview(m)}>
              <div class="coverWrap">
                <Thumbnail src={m.thumbnailUrl} alt={m.title} class="cover" priority={i < 12 ? 12 - i : 0} />
                {#if m.inLibrary}<span class="inLibBadge">Saved</span>{/if}
              </div>
              <p class="cardTitle">{m.title}</p>
            </button>
          {/each}
          {#if tag_loadingMoreLocal}
            {#each Array(12) as _, i (i)}
              <div class="skCard"><div class="skeleton skCover"></div><div class="skeleton skTitle"></div></div>
            {/each}
          {/if}
        </div>
      {:else}
        <div class="empty">
          <p class="emptyText">No results</p>
          <p class="emptyHint">
            {#if tag_searchSources}Try OR mode or broader tags.
            {:else}Try OR mode, enable Sources, or check your library.
            {/if}
          </p>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .splitRoot            { flex: 1; display: flex; overflow: hidden; }
  .splitSidebar         { width: 180px; flex-shrink: 0; border-right: 1px solid var(--border-dim); overflow: hidden; display: flex; flex-direction: column; }
  .splitSearchWrap      { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .splitSearchIcon      { color: var(--text-faint); flex-shrink: 0; }
  .splitSearchInput     { flex: 1; background: none; border: none; outline: none; font-size: var(--text-xs); color: var(--text-primary); font-family: var(--font-ui); min-width: 0; }
  .splitSearchInput::placeholder { color: var(--text-faint); }
  .splitSearchClear     { color: var(--text-faint); font-size: 13px; line-height: 1; background: none; border: none; cursor: pointer; padding: 2px; transition: color var(--t-base); }
  .splitSearchClear:hover { color: var(--text-muted); }
  .splitList            { flex: 1; overflow-y: auto; padding: var(--sp-1); scrollbar-width: thin; scrollbar-color: var(--border-dim) transparent; }
  .splitSectionLabel    { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--text-faint); padding: var(--sp-2) var(--sp-3) var(--sp-1); pointer-events: none; user-select: none; }
  .splitSectionLabelSpaced { margin-top: var(--sp-2); border-top: 1px solid var(--border-dim); padding-top: var(--sp-3); }
  .splitItem            { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: 7px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; background: none; text-align: left; cursor: pointer; transition: background var(--t-fast), border-color var(--t-fast); }
  .splitItem:hover      { background: var(--bg-raised); border-color: var(--border-dim); }
  .splitItemActive      { background: var(--accent-muted); border-color: var(--accent-dim); }
  .splitItemActive:hover { background: var(--accent-muted); }
  .splitItemLabel       { font-size: var(--text-xs); color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .splitItemActive .splitItemLabel { color: var(--accent-fg); font-weight: var(--weight-medium); }
  .splitEmpty           { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); padding: var(--sp-3); margin: 0; }
  .splitContent         { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .splitContentHeader   { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; gap: var(--sp-2); }
  .splitContentTitle    { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: var(--tracking-tight); }
  .splitResultCount     { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); flex-shrink: 0; }
  
  .tagActiveBar         { display: flex; align-items: flex-start; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; flex-wrap: wrap; }
  .tagPillRow           { display: flex; flex-wrap: wrap; gap: var(--sp-1); flex: 1; min-width: 0; }
  .tagPill              { display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; background: var(--accent-muted); border: 1px solid var(--accent-dim); border-radius: var(--radius-sm); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--accent-fg); }
  .tagPillStatus        { background: color-mix(in srgb, var(--color-info, #4a90d9) 12%, transparent); border-color: color-mix(in srgb, var(--color-info, #4a90d9) 30%, transparent); color: var(--color-info, #4a90d9); }
  .tagPillRemove        { color: currentColor; opacity: 0.6; font-size: 13px; line-height: 1; background: none; border: none; cursor: pointer; padding: 0; transition: opacity var(--t-base); }
  .tagPillRemove:hover  { opacity: 1; }
  .tagBarRight          { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .tagModeToggle        { display: flex; border: 1px solid var(--border-dim); border-radius: var(--radius-md); overflow: hidden; }
  .tagModeBtn           { display: flex; align-items: center; gap: 4px; padding: 4px 8px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); background: none; border: none; border-right: 1px solid var(--border-dim); cursor: pointer; transition: color var(--t-base), background var(--t-base); }
  .tagModeBtn:last-child { border-right: none; }
  .tagModeBtn:hover     { color: var(--text-muted); background: var(--bg-raised); }
  .tagModeBtnActive     { color: var(--accent-fg); background: var(--accent-muted); }
  .tagModeBtnActive:hover { color: var(--accent-fg); background: var(--accent-muted); }
  .tagClearAll          { display: flex; align-items: center; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); padding: 4px 8px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: none; cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .tagClearAll:hover    { color: var(--color-error); border-color: color-mix(in srgb, var(--color-error) 40%, transparent); background: var(--color-error-bg, color-mix(in srgb, var(--color-error) 8%, transparent)); }
  .tagCheckMark         { font-size: var(--text-xs); color: var(--accent-fg); margin-left: auto; }
  
  .tagGrid              { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: var(--sp-4); padding: var(--sp-4); overflow-y: auto; flex: 1; align-content: start; will-change: scroll-position; }
  .card                 { background: none; border: none; padding: 0; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: var(--sp-2); }
  .coverWrap            { position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim); }
  .cardTitle            { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: color var(--t-base); }
  .inLibBadge           { position: absolute; top: var(--sp-2); left: var(--sp-2); font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); border-radius: var(--radius-sm); padding: 1px 5px; }
  
  .skCard               { display: flex; flex-direction: column; gap: var(--sp-2); }
  @keyframes shimmer { from { background-position: -200% 0 } to { background-position: 200% 0 } }
  .skeleton             { border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-overlay, color-mix(in srgb, var(--bg-raised) 80%, var(--text-primary) 6%)) 50%, var(--bg-raised) 75%); background-size: 200% 100%; animation: shimmer 1.6s ease-in-out infinite; }
  .skCover              { aspect-ratio: 2/3; width: 100%; border-radius: var(--radius-md); }
  .skTitle              { height: 10px; width: 80%; }
  
  .empty                { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); padding: var(--sp-8); }
  .emptyIcon            { color: var(--text-faint); opacity: 0.5; }
  .emptyText            { font-size: var(--text-sm); color: var(--text-muted); font-weight: var(--weight-medium); margin: 0; }
  .emptyHint            { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); margin: 0; }
  
  @keyframes anim-spin  { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  .anim-spin            { animation: anim-spin 0.8s linear infinite; }
</style>