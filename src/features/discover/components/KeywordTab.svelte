<script lang="ts">
  import { onDestroy }          from "svelte";
  import { gql }                from "@api/client";
  import { FETCH_SOURCE_MANGA } from "@api/mutations/downloads";
  import { runConcurrent }      from "@core/async/batchRequests";
  import { shouldHideNsfw, shouldHideSource, dedupeMangaById, dedupeMangaByTitle } from "@core/util";
  import { store }              from "@store/state.svelte";
  import { preloadBlobUrls }    from "@core/cache/imageCache";
  import Thumbnail              from "@shared/manga/Thumbnail.svelte";
  import type { Manga, Source } from "@types";
  import type { CachedManga }   from "@features/discover/lib/searchFilter";

  interface Props {
    allSources:      Source[];
    availableLangs:  string[];
    hasMultipleLangs: boolean;
    loadingSources:  boolean;
    pendingPrefill:  string;
    popularResults:  (Manga & { _priority: number })[];
    popularLoading:  boolean;
    sourceCache:     Map<number, CachedManga>;
    onPrefillConsumed: () => void;
    onPreview:       (m: Manga) => void;
  }
  let {
    allSources, availableLangs, hasMultipleLangs, loadingSources,
    pendingPrefill, popularResults, popularLoading,
    sourceCache,
    onPrefillConsumed, onPreview,
  }: Props = $props();

  const preferredLang = store.settings?.preferredExtensionLang ?? "en";

  let kw_query        = $state("");
  let kw_results:     SourceResult[] = $state([]);
  let kw_showAdvanced = $state(false);
  let kw_selectedLangs: Set<string> = $state(new Set());
  let kw_inputEl:     HTMLInputElement | null = $state(null);
  let kw_abortCtrl:   AbortController | null  = null;
  let kw_debounceTimer: ReturnType<typeof setTimeout> | null = null;

  interface SourceResult {
    source:  Source;
    mangas:  Manga[];
    loading: boolean;
    error:   string | null;
  }

  $effect(() => {
    if (allSources.length) {
      const available = new Set(allSources.map((s) => s.lang));
      kw_selectedLangs = available.has(preferredLang)
        ? new Set([preferredLang])
        : new Set(availableLangs.slice(0, 1));
    }
  });

  $effect(() => {
    if (!loadingSources && pendingPrefill && allSources.length) {
      const q = pendingPrefill;
      onPrefillConsumed();
      kw_query = q;
      kwDoSearch(q);
    }
  });

  $effect(() => {
    const q = kw_query;
    if (kw_debounceTimer) clearTimeout(kw_debounceTimer);
    if (!q.trim()) { kw_abortCtrl?.abort(); kw_results = []; return; }
    kw_debounceTimer = setTimeout(() => kwDoSearch(q), 350);
    return () => { if (kw_debounceTimer) clearTimeout(kw_debounceTimer); };
  });

  function kwGetVisibleSources(): Source[] {
    let filtered = allSources;
    if (kw_selectedLangs.size > 0)
      filtered = filtered.filter((s) => kw_selectedLangs.has(s.lang));
    if (store.settings.contentLevel !== "unrestricted")
      filtered = filtered.filter((s) => !shouldHideSource(s, store.settings));
    return filtered;
  }

  async function kwDoSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const visible = kwGetVisibleSources();
    if (!visible.length) return;
    kw_abortCtrl?.abort();
    const ctrl = new AbortController();
    kw_abortCtrl = ctrl;
    const initial: SourceResult[] = visible.map((src) => ({ source: src, mangas: [], loading: true, error: null }));
    kw_results = initial;
    const indexBySrcId = new Map(visible.map((src, i) => [src.id, i]));
    await runConcurrent(visible, async (src) => {
      if (ctrl.signal.aborted) return;
      const idx = indexBySrcId.get(src.id)!;
      try {
        const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(
          FETCH_SOURCE_MANGA,
          { source: src.id, type: "SEARCH", page: 1, query: trimmed },
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        const mangas = d.fetchSourceManga.mangas.filter((m) => !shouldHideNsfw(m, store.settings));
        preloadBlobUrls(
          mangas.map((m) => sourceCache.get(m.id)?.thumbnailUrl ?? m.thumbnailUrl),
          12,
        );
        const next = [...kw_results];
        next[idx] = { ...next[idx], mangas, loading: false };
        kw_results = next;
      } catch (e: any) {
        if (ctrl.signal.aborted || e?.name === "AbortError") return;
        const next = [...kw_results];
        next[idx] = { ...next[idx], loading: false, error: (e as any).message ?? "Error" };
        kw_results = next;
      }
    }, ctrl.signal);
  }

  function kwToggleLang(lang: string) {
    const next = new Set(kw_selectedLangs);
    if (next.has(lang)) { if (next.size === 1) return; next.delete(lang); }
    else next.add(lang);
    kw_selectedLangs = next;
  }

  const kw_visibleCount = $derived(kwGetVisibleSources().length);
  const kw_hasResults   = $derived(kw_results.some((r) => r.mangas.length > 0));
  const kw_allDone      = $derived(kw_results.length > 0 && kw_results.every((r) => !r.loading));
  const kw_anyLoading   = $derived(kw_results.some((r) => r.loading));

  const kw_flatResults = $derived.by(() => {
    const all = kw_results.flatMap((r) =>
      r.mangas.map((m) => ({ ...m, _sourceName: r.source.displayName }))
    );
    const deduped = dedupeMangaByTitle(dedupeMangaById(all), store.settings.mangaLinks) as (Manga & { _sourceName?: string; _priority: number })[];
    return deduped.map((m, i) => ({ ...m, _priority: i < 12 ? 12 - i : 0 }));
  });

  onDestroy(() => {
    kw_abortCtrl?.abort();
    if (kw_debounceTimer) clearTimeout(kw_debounceTimer);
  });
</script>

<div class="keywordBar">
  <div class="searchBar">
    <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" class="searchIcon" aria-hidden="true">
      <path d="M229.66,218.34l-50.07-50.07a88,88,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
    </svg>
    <input
      bind:this={kw_inputEl}
      bind:value={kw_query}
      class="searchInput"
      placeholder="Search across sources…"
      use:focusOnMount
    />
    {#if kw_anyLoading}
      <svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor" class="anim-spin" style="color:var(--text-faint);flex-shrink:0" aria-hidden="true">
        <path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/>
      </svg>
    {:else if kw_query}
      <button class="clearBtn" title="Clear" onclick={() => { kw_query = ""; kw_results = []; kw_inputEl?.focus(); }}>×</button>
    {/if}
    {#if hasMultipleLangs}
      <button
        class="advancedBtn"
        class:advancedBtnActive={kw_showAdvanced}
        title="Language & filter options"
        onclick={() => (kw_showAdvanced = !kw_showAdvanced)}
      >
        <svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
          <path d="M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H183a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h81a32,32,0,0,0,62,0h33a8,8,0,0,0,0-16Zm-64,24a16,16,0,1,1,16-16A16,16,0,0,1,152,192Z"/>
        </svg>
      </button>
    {/if}
  </div>

  {#if hasMultipleLangs && kw_showAdvanced}
    <div class="advancedPanel">
      <div class="advancedHeader">
        <span class="advancedTitle">Languages</span>
        <div class="advancedActions">
          <button class="advancedLink" onclick={() => (kw_selectedLangs = new Set(availableLangs))}>All</button>
          <button class="advancedLink" onclick={() => (kw_selectedLangs = new Set([preferredLang]))}>Reset</button>
        </div>
      </div>
      <div class="langGrid">
        {#each availableLangs as lang (lang)}
          <button class="langChip" class:langChipActive={kw_selectedLangs.has(lang)} onclick={() => kwToggleLang(lang)}>
            {lang === preferredLang ? `${lang.toUpperCase()} ★` : lang.toUpperCase()}
          </button>
        {/each}
      </div>
      <div class="advancedDivider"></div>
      <div class="advancedFooter">
        Searching <strong>{kw_visibleCount}</strong> source{kw_visibleCount !== 1 ? "s" : ""}
      </div>
    </div>
  {/if}
</div>

{#if !kw_query.trim()}
  {#if popularLoading && popularResults.length === 0}
    <div class="searchGrid">
      {#each Array(24) as _, i (i)}<div class="skCard"><div class="skeleton skCover"></div></div>{/each}
    </div>
  {:else if popularResults.length > 0}
    <div class="searchHeader">
      <span class="searchLabel">Popular right now</span>
    </div>
    <div class="searchGrid">
      {#each popularResults as m (m.id)}
        <button class="srchCard" onclick={() => onPreview(m)}>
          <div class="srchCoverWrap">
            <Thumbnail src={m.thumbnailUrl} alt={m.title} class="cover" priority={m._priority} />
            <div class="srchGradient"></div>
            {#if m.inLibrary}<span class="inLibBadge">Saved</span>{/if}
            <div class="srchFooter">
              <p class="srchTitle">{m.title}</p>
              {#if m.source?.displayName}<p class="srchSource">{m.source.displayName}</p>{/if}
            </div>
          </div>
        </button>
      {/each}
      {#if popularLoading}
        {#each Array(12) as _, i (i)}<div class="skCard"><div class="skeleton skCover"></div></div>{/each}
      {/if}
    </div>
  {:else}
    <div class="empty">
      <svg width="36" height="36" viewBox="0 0 256 256" fill="currentColor" class="emptyIcon" aria-hidden="true">
        <path d="M229.66,218.34l-50.07-50.07a88,88,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
      </svg>
      <p class="emptyText">Search across sources</p>
      <p class="emptyHint">
        {#if hasMultipleLangs}
          {kw_visibleCount} source{kw_visibleCount !== 1 ? "s" : ""} · {kw_selectedLangs.size} language{kw_selectedLangs.size !== 1 ? "s" : ""}
        {:else}
          {kw_visibleCount} source{kw_visibleCount !== 1 ? "s" : ""}
        {/if}
      </p>
    </div>
  {/if}
{:else}
  {#if kw_flatResults.length > 0}
    <div class="searchHeader">
      <span class="searchLabel">{kw_flatResults.length} result{kw_flatResults.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="searchGrid">
      {#each kw_flatResults as m (m.id)}
        <button class="srchCard" onclick={() => onPreview(m)}>
          <div class="srchCoverWrap">
            <Thumbnail src={m.thumbnailUrl} alt={m.title} class="cover" priority={m._priority} />
            <div class="srchGradient"></div>
            {#if m.inLibrary}<span class="inLibBadge">Saved</span>{/if}
            <div class="srchFooter">
              <p class="srchTitle">{m.title}</p>
              {#if (m as any)._sourceName}<p class="srchSource">{(m as any)._sourceName}</p>{/if}
            </div>
          </div>
        </button>
      {/each}
      {#if kw_anyLoading}
        {#each Array(6) as _, i (i)}<div class="skCard"><div class="skeleton skCover"></div></div>{/each}
      {/if}
    </div>
  {:else if kw_anyLoading}
    <div class="searchGrid">
      {#each Array(12) as _, i (i)}<div class="skCard"><div class="skeleton skCover"></div></div>{/each}
    </div>
  {:else if kw_allDone && !kw_hasResults}
    <div class="empty">
      <p class="emptyText">No results for "{kw_query.trim()}"</p>
      <p class="emptyHint">Try a different spelling or fewer words</p>
    </div>
  {/if}
{/if}

<script module>
  function focusOnMount(node: HTMLElement) { node.focus(); }
</script>

<style>
  .keywordBar    { padding: var(--sp-3) var(--sp-4) var(--sp-2); flex-shrink: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
  .searchBar     { display: flex; align-items: center; gap: var(--sp-2); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-lg); padding: var(--sp-2) var(--sp-3); transition: border-color var(--t-base); }
  .searchBar:focus-within { border-color: var(--border-strong); }
  .searchIcon    { color: var(--text-faint); flex-shrink: 0; }
  .searchInput   { flex: 1; background: none; border: none; outline: none; font-size: var(--text-sm); color: var(--text-primary); min-width: 0; }
  .searchInput::placeholder { color: var(--text-faint); }
  .clearBtn      { color: var(--text-faint); font-size: 16px; line-height: 1; background: none; border: none; cursor: pointer; padding: 2px; transition: color var(--t-base); }
  .clearBtn:hover { color: var(--text-muted); }

  .advancedBtn   { display: flex; align-items: center; padding: 4px; border-radius: var(--radius-sm); border: 1px solid transparent; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-base), background var(--t-base), border-color var(--t-base); }
  .advancedBtn:hover { color: var(--text-muted); background: var(--bg-overlay); }
  .advancedBtnActive { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .advancedPanel { background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: var(--radius-lg); padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }
  .advancedHeader { display: flex; align-items: center; justify-content: space-between; }
  .advancedTitle { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); }
  .advancedActions { display: flex; gap: var(--sp-2); }
  .advancedLink  { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--accent-fg); background: none; border: none; cursor: pointer; padding: 0; transition: opacity var(--t-base); }
  .advancedLink:hover { opacity: 0.75; }
  .langGrid      { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
  .langChip      { padding: 3px 8px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: none; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); cursor: pointer; transition: color var(--t-base), background var(--t-base), border-color var(--t-base); }
  .langChip:hover { color: var(--text-muted); background: var(--bg-raised); }
  .langChipActive { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .advancedDivider { height: 1px; background: var(--border-dim); }
  .advancedFooter { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); }

  .searchHeader  { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-3) var(--sp-4) var(--sp-1); flex-shrink: 0; }
  .searchLabel   { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .searchGrid    { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(90px, 11vw, 130px), 1fr)); gap: var(--sp-2); padding: var(--sp-2) var(--sp-4) var(--sp-6); overflow-y: auto; flex: 1; align-content: start; will-change: scroll-position; }

  .srchCard      { background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
  .srchCard:hover .srchCoverWrap { filter: brightness(1.08) saturate(1.05); }
  .srchCoverWrap { position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim); transform: translateZ(0); transition: filter var(--t-base); }
  .srchGradient  { position: absolute; inset: 0; z-index: 1; background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.15) 50%, transparent 72%); pointer-events: none; }
  .srchFooter    { position: absolute; bottom: 0; left: 0; right: 0; z-index: 2; padding: var(--sp-2); pointer-events: none; }
  .srchTitle     { font-size: var(--text-xs); font-weight: var(--weight-medium); color: rgba(255,255,255,0.92); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-shadow: 0 1px 4px rgba(0,0,0,0.7); }
  .srchSource    { font-family: var(--font-ui); font-size: 9px; color: rgba(255,255,255,0.45); letter-spacing: var(--tracking-wide); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inLibBadge    { position: absolute; top: var(--sp-2); left: var(--sp-2); z-index: 2; font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); border-radius: var(--radius-sm); padding: 1px 5px; }

  .skCard        { display: flex; flex-direction: column; gap: var(--sp-2); flex-shrink: 0; width: 100%; }
  @keyframes shimmer { from { background-position: -200% 0 } to { background-position: 200% 0 } }
  .skeleton      { border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-overlay, color-mix(in srgb, var(--bg-raised) 80%, var(--text-primary) 6%)) 50%, var(--bg-raised) 75%); background-size: 200% 100%; animation: shimmer 1.6s ease-in-out infinite; }
  .skCover       { aspect-ratio: 2 / 3; width: 100%; border-radius: var(--radius-md); }

  .empty         { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); padding: var(--sp-8); }
  .emptyIcon     { color: var(--text-faint); opacity: 0.5; }
  .emptyText     { font-size: var(--text-sm); color: var(--text-muted); font-weight: var(--weight-medium); margin: 0; }
  .emptyHint     { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); margin: 0; }

  @keyframes anim-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  .anim-spin     { animation: anim-spin 0.8s linear infinite; }
</style>