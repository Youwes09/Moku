<script lang="ts">
  import { onDestroy }          from "svelte";
  import { gql }                from "@api/client";
  import { FETCH_SOURCE_MANGA } from "@api/mutations/downloads";
  import { shouldHideNsfw, shouldHideSource } from "@core/util";
  import { store }              from "@store/state.svelte";
  import Thumbnail              from "@shared/manga/Thumbnail.svelte";
  import ContextMenu            from "@shared/ui/ContextMenu.svelte";
  import { PushPin, PushPinSlash, ArrowRight } from "phosphor-svelte";
  import type { Manga, Source } from "@types";

  interface Props {
    allSources:     Source[];
    availableLangs: string[];
    loadingSources: boolean;
    localSource:    Source | null;
    onPreview:      (m: Manga) => void;
  }
  let { allSources, availableLangs, loadingSources, localSource, onPreview }: Props = $props();

  const preferredLang = store.settings?.preferredExtensionLang ?? "en";

  let src_selectedLang  = $state(preferredLang || "all");
  let src_activeSource: Source | null = $state(null);
  let src_browseResults: Manga[]       = $state([]);
  let src_loadingBrowse                = $state(false);
  let src_browseQuery                  = $state("");
  let src_submitted                    = $state("");
  let src_hasNextPage                  = $state(false);
  let src_currentPage                  = $state(1);
  let src_abortCtrl: AbortController | null = null;

  let ctx_x      = $state(0);
  let ctx_y      = $state(0);
  let ctx_source: Source | null = $state(null);

  const pinnedIds     = $derived(store.settings.pinnedSourceIds ?? []);
  const pinnedSources = $derived(
    pinnedIds
      .map(id => allSources.find(s => s.id === id))
      .filter((s): s is Source => !!s)
  );

  $effect(() => {
    if (!allSources.length) return;
    const langs = new Set(allSources.map((s) => s.lang));
    if (src_selectedLang !== "all" && !langs.has(src_selectedLang)) {
      src_selectedLang = langs.has(preferredLang) ? preferredLang : "all";
    }
  });

  const src_visibleSources = $derived.by(() => {
    const hide = (s: Source) => shouldHideSource(s, store.settings);
    if (src_selectedLang !== "all") {
      return allSources.filter((s) => s.lang === src_selectedLang && !hide(s));
    }
    const map = new Map<string, Source>();
    for (const s of allSources) {
      if (hide(s)) continue;
      const existing = map.get(s.name);
      if (!existing) { map.set(s.name, s); continue; }
      const existingPref = existing.lang === preferredLang;
      const newPref      = s.lang === preferredLang;
      if (newPref && !existingPref) map.set(s.name, s);
      else if (!existingPref && !newPref && s.lang < existing.lang) map.set(s.name, s);
    }
    return Array.from(map.values());
  });

  async function srcFetchBrowse(src: Source, type: "POPULAR" | "SEARCH", q?: string, page = 1) {
    src_abortCtrl?.abort();
    const ctrl = new AbortController();
    src_abortCtrl = ctrl;
    if (page === 1) { src_loadingBrowse = true; src_browseResults = []; }
    try {
      const d = await gql<{ fetchSourceManga: { mangas: Manga[]; hasNextPage: boolean } }>(
        FETCH_SOURCE_MANGA,
        { source: src.id, type, page, query: q ?? null },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      const incoming = d.fetchSourceManga.mangas.filter((m) => !shouldHideNsfw(m, store.settings));
      src_browseResults = page === 1 ? incoming : [...src_browseResults, ...incoming];
      src_hasNextPage   = d.fetchSourceManga.hasNextPage;
      src_currentPage   = page;
    } catch (e: any) {
      if (e?.name !== "AbortError") console.error(e);
    } finally {
      if (!ctrl.signal.aborted) src_loadingBrowse = false;
    }
  }

  function srcSelectSource(src: Source) {
    src_activeSource = src; src_browseQuery = ""; src_submitted = "";
    srcFetchBrowse(src, "POPULAR");
  }

  function srcHandleSearch() {
    if (!src_activeSource || !src_browseQuery.trim()) return;
    src_submitted = src_browseQuery.trim();
    srcFetchBrowse(src_activeSource, "SEARCH", src_browseQuery.trim());
  }

  function srcClearSearch() {
    src_browseQuery = ""; src_submitted = "";
    if (src_activeSource) srcFetchBrowse(src_activeSource, "POPULAR");
  }

  function openCtx(e: MouseEvent, src: Source) {
    e.preventDefault();
    ctx_x = e.clientX; ctx_y = e.clientY; ctx_source = src;
  }
  function closeCtx() { ctx_source = null; }

  onDestroy(() => { src_abortCtrl?.abort(); });
</script>

<div class="splitRoot">
  <div class="splitSidebar">
    <div class="srcLangRow">
      <span class="langPocketLabel">Language</span>
      <select class="langSelect" bind:value={src_selectedLang}>
        <option value="all">All</option>
        {#each availableLangs as lang (lang)}
          <option value={lang}>{lang.toUpperCase()}{lang === preferredLang ? " ★" : ""}</option>
        {/each}
      </select>
    </div>

    {#if loadingSources}
      <div class="splitLoading">
        <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" class="anim-spin" style="color:var(--text-faint)" aria-hidden="true">
          <path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/>
        </svg>
      </div>
    {:else}
      <div class="splitList">
        {#if localSource}
          <button
            class="splitItem splitItemSource"
            class:splitItemActive={src_activeSource?.id === localSource.id}
            onclick={() => srcSelectSource(localSource)}
            oncontextmenu={(e) => openCtx(e, localSource)}
          >
            <div class="localSourceIcon">
              <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                <path d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm44-84a44,44,0,1,1-44-44A44.05,44.05,0,0,1,172,128Z"/>
              </svg>
            </div>
            <span class="splitItemLabel">Local Source</span>
          </button>
          <div class="localDivider"></div>
        {/if}

        {#if pinnedSources.length > 0}
          <p class="sectionLabel">Pinned</p>
          {#each pinnedSources as src (src.id)}
            <button
              class="splitItem splitItemSource"
              class:splitItemActive={src_activeSource?.id === src.id}
              onclick={() => srcSelectSource(src)}
              oncontextmenu={(e) => openCtx(e, src)}
            >
              <Thumbnail src={src.iconUrl} alt="" class="splitSourceIcon" onerror={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span class="splitItemLabel">{src.name}</span>
              <span class="pinIndicator" title="Pinned">
                <PushPin size={9} weight="fill" />
              </span>
              {#if src.isNsfw}<span class="nsfwBadge">18+</span>{/if}
            </button>
          {/each}
          <div class="localDivider"></div>
          <p class="sectionLabel">All Sources</p>
        {/if}

        {#each src_visibleSources as src (src.id)}
          <button
            class="splitItem splitItemSource"
            class:splitItemActive={src_activeSource?.id === src.id}
            onclick={() => srcSelectSource(src)}
            oncontextmenu={(e) => openCtx(e, src)}
          >
            <Thumbnail src={src.iconUrl} alt="" class="splitSourceIcon" onerror={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span class="splitItemLabel">{src.name}</span>
            {#if src_selectedLang === "all"}
              <span class="sourceLang">{src.lang.toUpperCase()}</span>
            {/if}
            {#if src.isNsfw}<span class="nsfwBadge">18+</span>{/if}
          </button>
        {/each}
        {#if src_visibleSources.length === 0}
          <p class="splitEmpty">No sources for this language</p>
        {/if}
      </div>
    {/if}
  </div>

  
  <div class="splitContent">
    {#if !src_activeSource}
      <div class="empty">
        <svg width="32" height="32" viewBox="0 0 256 256" fill="currentColor" class="emptyIcon" aria-hidden="true">
          <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"/>
        </svg>
        <p class="emptyText">Browse a source</p>
        <p class="emptyHint">Select a source to see its popular titles, or search within it.</p>
      </div>
    {:else}
      <div class="splitContentHeader">
        <div class="splitSourceTitle">
          <Thumbnail src={src_activeSource.iconUrl} alt="" class="splitSourceIcon" onerror={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span class="splitContentTitle">{src_activeSource.displayName}</span>
          {#if src_loadingBrowse}
            <svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor" class="anim-spin" style="color:var(--text-faint)" aria-hidden="true">
              <path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/>
            </svg>
          {:else if src_browseResults.length > 0}
            <span class="splitResultCount">{src_browseResults.length} results</span>
          {/if}
        </div>
      </div>

      <div class="sourceBrowseBar">
        <div class="searchBar" style="flex:1">
          <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor" class="searchIcon" aria-hidden="true">
            <path d="M229.66,218.34l-50.07-50.07a88,88,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.31ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/>
          </svg>
          <input
            bind:value={src_browseQuery}
            class="searchInput"
            placeholder="Search {src_activeSource.displayName}…"
            onkeydown={(e) => e.key === "Enter" && srcHandleSearch()}
          />
          {#if src_submitted}
            <button class="clearBtn" title="Clear search" onclick={srcClearSearch}>×</button>
          {/if}
        </div>
        <button class="searchBtn" onclick={srcHandleSearch} disabled={!src_browseQuery.trim() || src_loadingBrowse}>Search</button>
      </div>

      {#if src_loadingBrowse && src_browseResults.length === 0}
        <div class="tagGrid">
          {#each Array(18) as _, i (i)}
            <div class="skCard"><div class="skeleton skCover"></div><div class="skeleton skTitle"></div></div>
          {/each}
        </div>
      {:else if src_browseResults.length > 0}
        <div class="tagGrid">
          {#each src_browseResults as m, i (m.id)}
            <button class="card" onclick={() => onPreview(m)}>
              <div class="coverWrap">
                <Thumbnail src={m.thumbnailUrl} alt={m.title} class="cover" priority={i < 12 ? 12 - i : 0} />
                {#if m.inLibrary}<span class="inLibBadge">Saved</span>{/if}
              </div>
              <p class="cardTitle">{m.title}</p>
            </button>
          {/each}
          {#if src_hasNextPage}
            <div class="showMoreCell">
              <button
                class="showMoreBtn"
                disabled={src_loadingBrowse}
                onclick={() => src_activeSource && srcFetchBrowse(src_activeSource, src_submitted ? "SEARCH" : "POPULAR", src_submitted || undefined, src_currentPage + 1)}
              >
                {src_loadingBrowse ? "Loading…" : "Load more"}
              </button>
            </div>
          {/if}
        </div>
      {:else if !src_loadingBrowse}
        <div class="empty">
          <p class="emptyText">No results</p>
          <p class="emptyHint">Try a different search term.</p>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if ctx_source}
  {@const isPinned = pinnedIds.includes(ctx_source.id)}
  <ContextMenu
    x={ctx_x}
    y={ctx_y}
    onClose={closeCtx}
    items={[
      {
        label: isPinned ? "Unpin source" : "Pin source",
        icon: isPinned ? PushPinSlash : PushPin,
        onClick: () => { store.togglePinnedSource(ctx_source!.id); },
      },
      { separator: true },
      {
        label: "Browse source",
        icon: ArrowRight,
        onClick: () => { srcSelectSource(ctx_source!); },
      },
    ]}
  />
{/if}

<style>
  .splitRoot          { flex: 1; display: flex; overflow: hidden; }
  .splitSidebar       { width: 180px; flex-shrink: 0; border-right: 1px solid var(--border-dim); overflow: hidden; display: flex; flex-direction: column; }
  .srcLangRow         { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; gap: var(--sp-2); }
  .langPocketLabel    { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .langSelect         { appearance: none; -webkit-appearance: none; background: var(--bg-overlay); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); color: var(--text-secondary); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 24px 4px 8px; cursor: pointer; max-width: 110px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 256 256'%3E%3Cpath fill='%23888' d='M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 7px center; transition: border-color var(--t-base), background var(--t-base), color var(--t-base); }
  .langSelect:hover   { border-color: var(--border-strong); background-color: var(--bg-raised); color: var(--text-primary); }
  .langSelect:focus   { outline: none; border-color: var(--accent-dim); color: var(--text-primary); }
  .langSelect option  { background: var(--bg-surface); color: var(--text-secondary); }
  .splitLoading       { flex: 1; display: flex; align-items: center; justify-content: center; padding: var(--sp-6); }
  .splitList          { flex: 1; overflow-y: auto; padding: var(--sp-1); scrollbar-width: thin; scrollbar-color: var(--border-dim) transparent; }
  .localSourceIcon    { width: 20px; height: 20px; border-radius: var(--radius-sm); background: var(--accent-muted); border: 1px solid var(--accent-dim); display: flex; align-items: center; justify-content: center; color: var(--accent-fg); flex-shrink: 0; }
  .localDivider       { height: 1px; background: var(--border-dim); margin: var(--sp-1) var(--sp-2); }
  .splitItem          { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: 7px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; background: none; text-align: left; cursor: pointer; transition: background var(--t-fast), border-color var(--t-fast); }
  .splitItem:hover    { background: var(--bg-raised); border-color: var(--border-dim); }
  .splitItemActive    { background: var(--accent-muted); border-color: var(--accent-dim); }
  .splitItemActive:hover { background: var(--accent-muted); }
  .splitItemSource    { gap: var(--sp-2); }
  .splitItemLabel     { font-size: var(--text-xs); color: var(--text-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .splitItemActive .splitItemLabel { color: var(--accent-fg); font-weight: var(--weight-medium); }
  .splitEmpty         { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); padding: var(--sp-3); margin: 0; }
  .sectionLabel       { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; padding: var(--sp-2) var(--sp-3) var(--sp-1); margin: 0; }
  .pinIndicator       { display: flex; align-items: center; color: var(--accent-fg); opacity: 0.7; flex-shrink: 0; margin-left: auto; margin-right: 2px; }
  .sourceLang         { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); margin-left: auto; margin-right: 4px; }
  .nsfwBadge          { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--color-error); background: var(--color-error-bg, rgba(180,60,60,0.08)); border: 1px solid rgba(180,60,60,0.25); border-radius: var(--radius-sm); padding: 1px 5px; margin-left: auto; flex-shrink: 0; }
  .splitContent       { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .splitContentHeader { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; gap: var(--sp-2); }
  .splitSourceTitle   { display: flex; align-items: center; gap: var(--sp-2); flex: 1; min-width: 0; }
  .splitContentTitle  { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: var(--tracking-tight); }
  .splitResultCount   { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); flex-shrink: 0; }
  :global(.splitSourceIcon) { width: 20px; height: 20px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; background: var(--bg-raised); }
  
  .sourceBrowseBar    { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .searchBar          { display: flex; align-items: center; gap: var(--sp-2); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-lg); padding: var(--sp-2) var(--sp-3); transition: border-color var(--t-base); }
  .searchBar:focus-within { border-color: var(--border-strong); }
  .searchIcon         { color: var(--text-faint); flex-shrink: 0; }
  .searchInput        { flex: 1; background: none; border: none; outline: none; font-size: var(--text-sm); color: var(--text-primary); min-width: 0; }
  .searchInput::placeholder { color: var(--text-faint); }
  .clearBtn           { color: var(--text-faint); font-size: 16px; line-height: 1; background: none; border: none; cursor: pointer; padding: 2px; transition: color var(--t-base); }
  .clearBtn:hover     { color: var(--text-muted); }
  .searchBtn          { padding: 6px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-muted); cursor: pointer; transition: background var(--t-base), color var(--t-base), border-color var(--t-base); flex-shrink: 0; }
  .searchBtn:hover:not(:disabled) { background: var(--bg-overlay); color: var(--text-secondary); border-color: var(--border-strong); }
  .searchBtn:disabled { opacity: 0.4; cursor: default; }
  
  .tagGrid            { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: var(--sp-4); padding: var(--sp-4); overflow-y: auto; flex: 1; align-content: start; }
  .card               { background: none; border: none; padding: 0; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: var(--sp-2); }
  .coverWrap          { position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim); }
  .cardTitle          { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .inLibBadge         { position: absolute; top: var(--sp-2); left: var(--sp-2); font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); border-radius: var(--radius-sm); padding: 1px 5px; }
  .showMoreCell       { grid-column: 1 / -1; display: flex; justify-content: center; padding: var(--sp-2) 0; }
  .showMoreBtn        { display: inline-flex; align-items: center; gap: var(--sp-1); padding: 5px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: none; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-muted); cursor: pointer; transition: background var(--t-base), color var(--t-base), border-color var(--t-base); }
  .showMoreBtn:hover:not(:disabled) { background: var(--bg-raised); color: var(--text-secondary); border-color: var(--border-strong); }
  .showMoreBtn:disabled { opacity: 0.4; cursor: default; }
  
  .skCard             { display: flex; flex-direction: column; gap: var(--sp-2); }
  @keyframes shimmer  { from { background-position: -200% 0 } to { background-position: 200% 0 } }
  .skeleton           { border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-overlay, color-mix(in srgb, var(--bg-raised) 80%, var(--text-primary) 6%)) 50%, var(--bg-raised) 75%); background-size: 200% 100%; animation: shimmer 1.6s ease-in-out infinite; }
  .skCover            { aspect-ratio: 2/3; width: 100%; border-radius: var(--radius-md); }
  .skTitle            { height: 10px; width: 80%; }
  
  .empty              { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); padding: var(--sp-8); }
  .emptyIcon          { color: var(--text-faint); opacity: 0.5; }
  .emptyText          { font-size: var(--text-sm); color: var(--text-muted); font-weight: var(--weight-medium); margin: 0; }
  .emptyHint          { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); margin: 0; }
  
  @keyframes anim-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  .anim-spin          { animation: anim-spin 0.8s linear infinite; }
</style>