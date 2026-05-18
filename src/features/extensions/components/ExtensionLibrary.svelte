<script lang="ts">
  import { ArrowLeft, MagnifyingGlass, GearSix, Swap, Funnel, Check } from "phosphor-svelte";
  import Thumbnail           from "@shared/manga/Thumbnail.svelte";
  import { resolvedCover }   from "@core/cover/coverResolver";
  import { gql }             from "@api/client";
  import { setPreviewManga } from "@store/state.svelte";
  import { GET_LIBRARY, GET_SOURCES } from "@api/queries";
  import { libraryByExtension, type LibraryManga, type SourceNode, type SourceLibrary } from "../lib/extensionLibrary";
  import SourceMigrateModal  from "../panels/SourceMigrateModal.svelte";

  type SourceEntry = { id: string; displayName: string };

  interface Props {
    pkgName:       string;
    extensionName: string;
    iconUrl:       string;
    cols:          number;
    cropCovers:    boolean;
    statsAlways:   boolean;
    anims:         boolean;
    sources:       SourceEntry[];
    onBack:        () => void;
    onSettings:    () => void;
  }

  let { pkgName, extensionName, iconUrl, cols, cropCovers, statsAlways, anims, sources, onBack, onSettings }: Props = $props();

  let groups:  SourceLibrary[] = $state([]);
  let loading  = $state(true);
  let search   = $state("");

  type ContentFilter = "unread" | "downloaded";
  let activeFilters = $state<Partial<Record<ContentFilter, boolean>>>({});
  let filterOpen    = $state(false);

  const hasActiveFilters = $derived(Object.values(activeFilters).some(Boolean));

  let migrateTarget: { sourceId: string; sourceName: string; iconUrl: string; manga: LibraryManga[] } | null = $state(null);

  const allManga = $derived(groups.flatMap(g => g.manga));

  const filtered = $derived((() => {
    let items = allManga;
    const q = search.trim().toLowerCase();
    if (q) items = items.filter(m => m.title.toLowerCase().includes(q));
    if (activeFilters.unread)     items = items.filter(m => m.unreadCount > 0);
    if (activeFilters.downloaded) items = items.filter(m => m.downloadCount > 0);
    return items;
  })());

  let sourceNodes: SourceNode[] = $state([]);

  $effect(() => { load(); });

  async function load() {
    loading = true;
    try {
      const [libData, srcData] = await Promise.all([
        gql<{ mangas: { nodes: LibraryManga[] } }>(GET_LIBRARY),
        gql<{ sources: { nodes: SourceNode[] } }>(GET_SOURCES),
      ]);
      sourceNodes = srcData.sources.nodes;
      groups = libraryByExtension(libData.mangas.nodes, srcData.sources.nodes, pkgName);
    } finally {
      loading = false;
    }
  }

  function toggleFilter(f: ContentFilter) {
    activeFilters = { ...activeFilters, [f]: !activeFilters[f] };
  }

  function clearFilters() {
    activeFilters = {};
  }

  function openMigrate(group: SourceLibrary) {
    const node = sourceNodes.find(s => s.id === group.sourceId);
    migrateTarget = {
      sourceId:   group.sourceId,
      sourceName: group.displayName,
      iconUrl:    (node as any)?.iconUrl ?? iconUrl,
      manga:      group.manga,
    };
  }

  $effect(() => {
    if (!filterOpen) return;
    function onOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".filter-wrap")) filterOpen = false;
    }
    setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    return () => document.removeEventListener("mousedown", onOutside, true);
  });

  const CONTENT_FILTERS: [ContentFilter, string][] = [
    ["unread",     "Unread"],
    ["downloaded", "Downloaded"],
  ];
</script>

<div class="root">
  <div class="header">
    <button class="header-btn" onclick={onBack}>
      <ArrowLeft size={14} weight="bold" />
    </button>
    {#if iconUrl}
      <Thumbnail src={iconUrl} alt={extensionName} class="header-icon" onerror={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    {/if}
    <div class="title-block">
      <span class="eyebrow">In Library</span>
      <span class="title">{extensionName}</span>
    </div>
    {#if !loading}
      <span class="count-badge">{filtered.length}{filtered.length !== allManga.length ? ` / ${allManga.length}` : ""}</span>
    {/if}
    <div class="header-right">
      <div class="search-wrap">
        <MagnifyingGlass size={12} class="search-icon" weight="light" />
        <input class="search" placeholder="Search" bind:value={search} autocomplete="off" />
      </div>

      <div class="filter-wrap">
        <button
          class="filter-btn"
          class:filter-btn-active={hasActiveFilters}
          title="Filter"
          onclick={() => filterOpen = !filterOpen}
        >
          <Funnel size={13} weight={hasActiveFilters ? "fill" : "bold"} />
        </button>
        {#if filterOpen}
          <div class="filter-panel" role="menu">
            <div class="panel-header">
              <span class="panel-heading">Filter</span>
              {#if hasActiveFilters}
                <button class="panel-clear-btn" onclick={clearFilters}>Clear all</button>
              {/if}
            </div>
            <div class="panel-divider"></div>
            <p class="panel-label">Content</p>
            {#each CONTENT_FILTERS as [f, label]}
              <button
                class="panel-item"
                class:panel-item-active={activeFilters[f]}
                role="menuitem"
                onclick={() => toggleFilter(f)}
              >
                <span class="panel-check" class:panel-check-on={activeFilters[f]}>
                  {#if activeFilters[f]}<Check size={9} weight="bold" />{/if}
                </span>
                {label}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if sources.length > 0}
        <button class="header-btn" onclick={onSettings} title="Extension settings">
          <GearSix size={14} weight="bold" />
        </button>
      {/if}
    </div>
  </div>

  <div class="content">
    {#if loading}
      <div class="grid" style="--cols:{cols}">
        {#each Array(12) as _}
          <div class="card-skeleton">
            <div class="cover-skeleton skeleton"></div>
            <div class="title-skeleton skeleton"></div>
          </div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div class="empty">
        {allManga.length === 0 ? "Nothing from this extension is in your library." : "No matches."}
      </div>
    {:else}
      {#if groups.length > 1}
        <div class="source-groups">
          {#each groups as group}
            <div class="source-group-header">
              <span class="source-group-name">{group.displayName}</span>
              <span class="source-group-count">{group.manga.length}</span>
              <button class="migrate-btn" onclick={() => openMigrate(group)} title="Migrate this source">
                <Swap size={12} weight="bold" />
                Migrate source
              </button>
            </div>
          {/each}
        </div>
      {:else if groups.length === 1}
        <div class="single-source-bar">
          <span class="source-group-name">{groups[0].displayName}</span>
          <button class="migrate-btn" onclick={() => openMigrate(groups[0])} title="Migrate this source">
            <Swap size={12} weight="bold" />
            Migrate source
          </button>
        </div>
      {/if}

      <div class="grid" style="--cols:{cols}">
        {#each filtered as m (m.id)}
          {@const isCompleted = !m.unreadCount && m.downloadCount > 0}
          <button class="card" class:anims onclick={() => setPreviewManga(m as any)}>
            <div class="cover-wrap" class:completed={isCompleted}>
              <Thumbnail
                src={resolvedCover(m.id, m.thumbnailUrl)}
                alt={m.title}
                class="cover"
                style="object-fit:{cropCovers ? 'cover' : 'contain'}"
                draggable="false"
              />
              <div class="card-info-overlay" class:anim={anims} class:instant={!anims} class:always={statsAlways}>
                <div class="overlay-badges">
                  {#if isCompleted}
                    <span class="badge badge-done">✓ Done</span>
                  {:else if m.unreadCount}
                    <span class="badge badge-unread">{m.unreadCount} new</span>
                  {/if}
                  {#if m.downloadCount}
                    <span class="badge badge-dl">↓ {m.downloadCount}</span>
                  {/if}
                </div>
              </div>
            </div>
            <p class="card-title">{m.title}</p>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if migrateTarget}
  <SourceMigrateModal
    sourceId={migrateTarget.sourceId}
    sourceName={migrateTarget.sourceName}
    sourceIconUrl={migrateTarget.iconUrl}
    manga={migrateTarget.manga}
    onClose={() => migrateTarget = null}
    onDone={() => { migrateTarget = null; load(); }}
  />
{/if}

<style>
  .root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  :global(.header-icon) { width: 24px; height: 24px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; background: var(--bg-raised); }

  .header { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-4) var(--sp-6); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .header-right { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }

  .header-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-md); color: var(--text-faint); flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .header-btn:hover { color: var(--text-primary); background: var(--bg-raised); }

  .title-block { display: flex; flex-direction: column; gap: 1px; }
  .eyebrow { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }

  .count-badge { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 2px 8px; border-radius: var(--radius-sm); background: var(--bg-overlay); border: 1px solid var(--border-dim); color: var(--text-muted); flex-shrink: 0; }

  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-wrap :global(.search-icon) { position: absolute; left: 9px; color: var(--text-faint); pointer-events: none; }
  .search { background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 5px 10px 5px 26px; color: var(--text-primary); font-size: var(--text-sm); width: 160px; outline: none; transition: border-color var(--t-base); }
  .search::placeholder { color: var(--text-faint); }
  .search:focus { border-color: var(--border-strong); }

  .filter-wrap { position: relative; }
  .filter-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .filter-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .filter-btn-active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .filter-panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 9999; min-width: 200px; background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); padding: var(--sp-1); box-shadow: 0 8px 32px rgba(0,0,0,0.5); animation: fadeIn 0.1s ease both; }
  .panel-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 4px; }
  .panel-heading { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-secondary); font-weight: var(--weight-medium, 500); }
  .panel-clear-btn { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base); }
  .panel-clear-btn:hover { color: var(--color-error); }
  .panel-divider { height: 1px; background: var(--border-dim); margin: 4px 2px; }
  .panel-label { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--text-faint); padding: 4px 8px 8px; }
  .panel-item { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: 7px 10px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); cursor: pointer; text-align: left; transition: background var(--t-base), color var(--t-base); }
  .panel-item:hover { background: var(--bg-overlay); color: var(--text-primary); }
  .panel-item-active { color: var(--accent-fg); background: var(--accent-muted); font-weight: var(--weight-medium, 500); }
  .panel-item-active:hover { background: var(--accent-dim); }
  .panel-check { width: 13px; height: 13px; border-radius: 2px; border: 1px solid var(--border-strong); background: transparent; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--bg-base); transition: background var(--t-base), border-color var(--t-base); }
  .panel-check-on { background: var(--accent); border-color: var(--accent); }

  .content { flex: 1; overflow-y: auto; padding: var(--sp-4) var(--sp-6) var(--sp-6); will-change: scroll-position; display: flex; flex-direction: column; gap: var(--sp-3); }

  .source-groups { display: flex; flex-direction: column; gap: var(--sp-1); }
  .source-group-header { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) 0; border-bottom: 1px solid var(--border-dim); }
  .single-source-bar { display: flex; align-items: center; gap: var(--sp-2); padding-bottom: var(--sp-2); border-bottom: 1px solid var(--border-dim); }
  .source-group-name { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); font-weight: var(--weight-medium); }
  .source-group-count { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); padding: 1px 6px; border-radius: var(--radius-sm); background: var(--bg-overlay); border: 1px solid var(--border-dim); }
  .migrate-btn { display: flex; align-items: center; gap: 5px; margin-left: auto; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 9px; border-radius: var(--radius-sm); background: none; color: var(--text-faint); border: 1px solid var(--border-dim); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .migrate-btn:hover { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .grid { display: grid; grid-template-columns: repeat(var(--cols, auto-fill), minmax(130px, 1fr)); gap: var(--sp-4); }

  .card { background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
  .card.anims:hover .cover-wrap { transform: translateY(-3px); border-color: var(--border-strong); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
  .card:hover .card-title { color: var(--text-primary); }

  .cover-wrap { position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim); will-change: transform; }
  .card.anims .cover-wrap { transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), border-color var(--t-base), box-shadow 0.18s cubic-bezier(0.16,1,0.3,1); }
  .cover-wrap.completed { box-shadow: inset 0 -2px 0 0 var(--accent); }

  .card-info-overlay { position: absolute; bottom: -4px; left: 0; right: 0; z-index: 2; padding: 32px 6px 10px; background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 50%, transparent 100%); opacity: 0; pointer-events: none; }
  .card-info-overlay.anim { transition: opacity 0.18s ease; }
  .card-info-overlay.instant { transition: none; }
  .card-info-overlay.always { opacity: 1; }
  .card:hover .card-info-overlay { opacity: 1; }

  .overlay-badges { display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; flex-wrap: wrap; }
  .badge { font-family: var(--font-ui); font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; padding: 3px 7px; border-radius: 20px; white-space: nowrap; }
  .badge-unread { background: var(--accent); color: #fff; box-shadow: 0 1px 8px rgba(0,0,0,0.5); }
  .badge-done { background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.25); }
  .badge-dl { background: rgba(0,0,0,0.55); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.18); margin-left: auto; }

  .card-title { margin-top: var(--sp-2); font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2lh; }
  .card.anims .card-title { transition: color var(--t-base); }

  .card-skeleton { padding: 0; }
  .cover-skeleton { aspect-ratio: 2/3; border-radius: var(--radius-md); }
  .title-skeleton { height: 12px; margin-top: var(--sp-2); width: 80%; border-radius: var(--radius-sm); }

  .empty { display: flex; align-items: center; justify-content: center; height: 60%; color: var(--text-muted); font-size: var(--text-sm); }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>