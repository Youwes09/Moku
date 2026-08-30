<script lang="ts">
  import { CheckSquare, Trash, Folder, FolderPlus, FolderMinus, ImageSquare, BookOpenText, FilmSlate } from 'phosphor-svelte'
  import Thumbnail from '$lib/components/shared/manga/Thumbnail.svelte'
  import { settingsState } from '$lib/state/settings.svelte'
  import type { Manga } from '$lib/types'
  import type { Folder as FolderType } from '$lib/server-adapters/types'
  import type { LibraryViewMode } from '$lib/state/library.svelte'

  interface Props {
    items:                  Manga[]
    loading:                boolean
    selectMode:             boolean
    selected:               Set<string>
    tab:                    string
    visibleFolders:         FolderType[]
    bulkWorking:            boolean
    viewMode:               LibraryViewMode
    onCardClick:            (e: MouseEvent, m: Manga) => void
    onCardContextMenu:      (e: MouseEvent, m: Manga) => void
    onSelectAll:            () => void
    onExitSelect:           () => void
    onBulkRemove:           () => void
    onBulkRemoveFromFolder: () => void
    onBulkMove:             (folder: FolderType) => void
    onViewModeChange:       (mode: LibraryViewMode) => void
  }

  let {
    items, loading, selectMode, selected, tab,
    visibleFolders, bulkWorking, viewMode,
    onCardClick, onCardContextMenu, onSelectAll, onExitSelect,
    onBulkRemove, onBulkRemoveFromFolder, onBulkMove, onViewModeChange,
  }: Props = $props()

  const isFolderTab = $derived(tab !== 'library' && tab !== 'downloaded')

  let movePanelOpen = $state(false)

  const statsAlways = $derived(settingsState.settings.libraryStatsAlways ?? false)
  const cropCovers  = $derived(settingsState.settings.libraryCropCovers  ?? true)

  const showTypeTag = $derived(
    !settingsState.settings.contentTypeFilter || settingsState.settings.contentTypeFilter === 'all',
  )

  const PAGE = 48
  let visibleCount = $state(PAGE)
  let sentinel: HTMLDivElement | undefined = $state()
  let observer: IntersectionObserver | null = null

  const renderedItems = $derived(items.slice(0, visibleCount))
  const hasMore       = $derived(visibleCount < items.length)

  $effect(() => {
    items
    visibleCount = PAGE
  })

  $effect(() => {
    observer?.disconnect()
    if (!sentinel) return
    observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore) {
        visibleCount = Math.min(visibleCount + PAGE, items.length)
      }
    }, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer?.disconnect()
  })

  function onDocDown(e: MouseEvent) {
    if (movePanelOpen && !(e.target as HTMLElement).closest('.move-wrap')) movePanelOpen = false
  }

  $effect(() => {
    document.addEventListener('mousedown', onDocDown, true)
    return () => document.removeEventListener('mousedown', onDocDown, true)
  })
</script>

{#if selectMode}
  <div class="select-bar">
    <span class="sel-count">{selected.size} selected</span>
    <button class="sel-text-btn" onclick={onSelectAll}>Select all</button>
    <div class="sel-right">
      {#if visibleFolders.length > 0}
        <div class="move-wrap">
          <button
            class="sel-icon-btn"
            title="Move to folder"
            disabled={selected.size === 0 || bulkWorking}
            onclick={() => movePanelOpen = !movePanelOpen}
          >
            <FolderPlus size={14} weight="bold" />
          </button>
          {#if movePanelOpen}
            <div class="move-panel" role="menu">
              {#each visibleFolders as cat}
                <button
                  class="move-item"
                  role="menuitem"
                  onclick={() => { onBulkMove(cat); movePanelOpen = false }}
                >
                  <Folder size={12} weight="bold" />
                  {cat.name}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if isFolderTab}
        <button
          class="sel-icon-btn"
          title="Remove from folder"
          disabled={selected.size === 0 || bulkWorking}
          onclick={onBulkRemoveFromFolder}
        >
          <FolderMinus size={14} weight="bold" />
        </button>
      {/if}

      <button
        class="sel-icon-btn sel-icon-danger"
        title="Remove from library"
        disabled={selected.size === 0 || bulkWorking}
        onclick={onBulkRemove}
      >
        <Trash size={14} weight="bold" />
      </button>
    </div>
  </div>
{/if}

<div
  class="content"
  role="presentation"
  onclick={(e) => {
    if (selectMode && !(e.target as HTMLElement).closest('.card')) onExitSelect()
  }}
>
  {#if loading}
    <div class="grid">
      {#each Array(12) as _}
        <div class="card-skeleton">
          <div class="cover-skeleton skeleton"></div>
          <div class="title-skeleton skeleton"></div>
        </div>
      {/each}
    </div>

  {:else if items.length === 0}
    <div class="empty">
      {tab === 'downloaded'
        ? 'No downloaded manga.'
        : 'No manga in this library — browse sources to add some.'}
    </div>

  {:else if viewMode === 'list'}
    <div class="list">
    {#each renderedItems as m (m.id)}
      {@const isSelected  = selected.has(m.id)}
      {@const isCompleted = m.status === 'COMPLETED' || (!m.unreadCount && (m.chapters?.totalCount ?? 0) > 0)}
        <button
          class="row"
          class:row-selected={isSelected}
          class:select-mode={selectMode}
          onclick={(e) => onCardClick(e, m)}
          oncontextmenu={(e) => onCardContextMenu(e, m)}
        >
          <div class="thumb" class:cover-contain={!cropCovers}>
            <Thumbnail src={m.thumbnailUrl} alt={m.title} class="thumb-img" id={m.id} />
          </div>
          <div class="info">
            <span class="row-title">{m.title}</span>
            <div class="row-badges">
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
          {#if selectMode}
            <div class="row-select" aria-hidden="true">
              <div class="select-check" class:checked={isSelected}>
                {#if isSelected}
                  <CheckSquare size={18} weight="fill" />
                {:else}
                  <div class="check-empty"></div>
                {/if}
              </div>
            </div>
          {/if}
        </button>
      {/each}
    </div>
    {#if hasMore}
      <div bind:this={sentinel} class="sentinel" aria-hidden="true"></div>
    {/if}
  {:else}
    <div class="grid">
    {#each renderedItems as m (m.id)}
      {@const isSelected  = selected.has(m.id)}
      {@const isCompleted = m.status === 'COMPLETED' || (!m.unreadCount && (m.chapters?.totalCount ?? 0) > 0)}
        <button
          class="card"
          class:card-selected={isSelected}
          class:select-mode={selectMode}
          class:stats-always={statsAlways}
          onclick={(e) => onCardClick(e, m)}
          oncontextmenu={(e) => onCardContextMenu(e, m)}
        >
          <div class="cover-wrap" class:completed={isCompleted} class:cover-contain={!cropCovers}>
            <Thumbnail src={m.thumbnailUrl} alt={m.title} class="cover" id={m.id} />
            {#if showTypeTag && m.contentType}
              <span class="type-tag" title={m.contentType}>
                {#if m.contentType === 'ANIME'}<FilmSlate size={12} weight="fill" />
                {:else if m.contentType === 'NOVEL'}<BookOpenText size={12} weight="fill" />
                {:else}<ImageSquare size={12} weight="fill" />{/if}
              </span>
            {/if}
            <div class="overlay">
              <div class="badges">
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
            {#if selectMode}
              <div class="select-overlay" aria-hidden="true">
                <div class="select-check" class:checked={isSelected}>
                  {#if isSelected}
                    <CheckSquare size={20} weight="fill" />
                  {:else}
                    <div class="check-empty"></div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
          <p class="title">{m.title}</p>
        </button>
      {/each}
    </div>
    {#if hasMore}
      <div bind:this={sentinel} class="sentinel" aria-hidden="true"></div>
    {/if}
  {/if}
</div>

<style>
  .content {
    flex: 1; overflow-y: auto;
    padding: var(--sp-5) var(--sp-6) var(--sp-6);
    -webkit-overflow-scrolling: touch;
  }

  .select-bar {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-6);
    background: var(--bg-raised); border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0; z-index: 10; position: relative;
    animation: fadeIn 0.1s ease both;
  }
  .sel-right { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }
  .sel-count {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-secondary); letter-spacing: var(--tracking-wide); white-space: nowrap;
  }
  .sel-text-btn {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-faint); background: none; border: none;
    cursor: pointer; padding: 2px 4px; border-radius: var(--radius-sm);
    transition: color var(--t-base);
  }
  .sel-text-btn:hover { color: var(--text-primary); }
  .sel-icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--radius-md);
    border: 1px solid var(--border-dim); background: var(--bg-raised);
    color: var(--text-muted); cursor: pointer; flex-shrink: 0;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .sel-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sel-icon-btn:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
  .sel-icon-danger:hover:not(:disabled) {
    color: var(--color-error, #e05c5c);
    border-color: color-mix(in srgb, var(--color-error, #e05c5c) 40%, transparent);
    background: color-mix(in srgb, var(--color-error, #e05c5c) 8%, transparent);
  }

  .move-wrap { position: relative; }

  .move-panel {
    min-width: 180px; background: var(--bg-raised);
    border: 1px solid var(--border-base); border-radius: var(--radius-lg);
    padding: var(--sp-1); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: fadeIn 0.1s ease both;
    position: absolute; top: calc(100% + 4px); right: 0; z-index: 9999;
  }

  .move-item {
    display: flex; align-items: center; gap: var(--sp-2);
    width: 100%; padding: 7px 10px; border-radius: var(--radius-sm);
    border: none; background: transparent; color: var(--text-muted);
    font-family: var(--font-ui); font-size: var(--text-xs);
    cursor: pointer; text-align: left;
    transition: background var(--t-base), color var(--t-base);
  }
  .move-item:hover { background: var(--bg-overlay); color: var(--text-primary); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: var(--sp-4);
  }

  .list { display: flex; flex-direction: column; gap: var(--sp-2); }

  .row {
    display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3);
    background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md);
    width: 100%; cursor: pointer; text-align: left;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .row:not(.select-mode):hover { border-color: var(--border-strong); background: var(--bg-elevated); }
  .row.select-mode { cursor: default; }
  .row.row-selected { background: color-mix(in srgb, var(--accent) 8%, transparent); border-color: var(--accent-dim); }
  .row.row-selected .row-title { color: var(--accent-fg); }

  .thumb {
    width: 36px; height: 54px; border-radius: var(--radius-sm); overflow: hidden;
    background: var(--bg-overlay); flex-shrink: 0; border: 1px solid var(--border-dim);
  }
  :global(.thumb-img) { width: 100%; height: 100%; object-fit: cover; }
  .thumb.cover-contain :global(.thumb-img) { object-fit: contain; }

  .info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; min-width: 0; }
  .row-title {
    font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: color var(--t-base);
  }

  .row-badges { display: flex; align-items: center; gap: 6px; }

  .row-select { flex-shrink: 0; display: flex; align-items: center; }

  .card { background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
  .card:not(.select-mode):hover .cover-wrap {
    transform: translateY(-3px);
    border-color: var(--border-strong);
    box-shadow: 0 6px 20px rgba(0,0,0,0.35);
  }
  .card:not(.select-mode):hover .title { color: var(--text-primary); }
  .card.select-mode { cursor: default; }
  .card.card-selected .cover-wrap { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-md); }
  .card.card-selected .title { color: var(--accent-fg); }

  .cover-wrap {
    position: relative; aspect-ratio: 2/3; overflow: hidden;
    border-radius: var(--radius-md); background: var(--bg-raised);
    border: 1px solid var(--border-dim); will-change: transform;
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), border-color var(--t-base), box-shadow 0.18s cubic-bezier(0.16,1,0.3,1);
  }
  .cover-wrap.completed { box-shadow: inset 0 -2px 0 0 var(--accent); }

  .type-tag {
    position: absolute; top: 5px; left: 5px; z-index: 2;
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: var(--radius-sm);
    color: #fff; background: color-mix(in srgb, var(--bg-void) 62%, transparent);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    border: 1px solid color-mix(in srgb, #fff 12%, transparent);
  }

  :global(.cover) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-contain :global(.cover) { object-fit: contain; }

  .overlay {
    position: absolute; bottom: 0; left: 0; right: 0; z-index: 2;
    padding: 32px 6px 10px;
    background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 50%, transparent 100%);
    opacity: 0; pointer-events: none;
    transition: opacity 0.18s ease;
  }
  .card:not(.select-mode):hover .overlay { opacity: 1; }
  .stats-always .overlay { opacity: 1; }

  .badges { display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; flex-wrap: wrap; }
  .badge {
    font-family: var(--font-ui); font-size: 9.5px; font-weight: 700;
    letter-spacing: 0.04em; line-height: 1; padding: 3px 7px;
    border-radius: 20px; white-space: nowrap;
  }
  .badge-unread { background: var(--accent); color: #fff; box-shadow: 0 1px 8px rgba(0,0,0,0.5); }
  .badge-done   { background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.25); }
  .badge-dl     { background: rgba(0,0,0,0.55); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.18); margin-left: auto; }

  .select-overlay {
    position: absolute; inset: 0; z-index: 3;
    background: rgba(0,0,0,0.18);
    display: flex; align-items: flex-start; justify-content: flex-end;
    padding: 6px; pointer-events: none;
  }
  .select-check { color: var(--text-faint); opacity: 0.7; transition: color var(--t-base), opacity var(--t-base); }
  .select-check.checked { color: var(--accent-fg); opacity: 1; }
  .check-empty {
    width: 20px; height: 20px; border-radius: 4px;
    border: 2px solid var(--text-faint); background: rgba(0,0,0,0.3);
  }

  .title {
    margin-top: var(--sp-2); font-size: var(--text-sm);
    color: var(--text-secondary); line-height: var(--leading-snug);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; height: 2lh;
    transition: color var(--t-base);
  }

  .card-skeleton { padding: 0; }
  .cover-skeleton { aspect-ratio: 2/3; border-radius: var(--radius-md); }
  .title-skeleton { height: 12px; margin-top: var(--sp-2); width: 80%; border-radius: var(--radius-sm); }
  .skeleton { background: var(--bg-raised); animation: pulse 1.4s ease infinite; }

  .sentinel { height: 1px; width: 100%; }

  .empty {
    display: flex; align-items: center; justify-content: center;
    height: 60%; color: var(--text-muted); font-size: var(--text-sm);
    text-align: center;
  }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes pulse  { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
</style>
