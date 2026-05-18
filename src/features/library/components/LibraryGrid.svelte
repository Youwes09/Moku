<script lang="ts">
  import { Folder, Trash, CheckSquare, Robot } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import { resolvedCover } from "@core/cover/coverResolver";
  import { longPress }     from "@core/ui/touchscreen";
  import type { Manga, Category } from "@types";

  interface Props {
    visibleManga:    Manga[];
    filtered:        Manga[];
    loading:         boolean;
    cols:            number;
    anims:           boolean;
    selectMode:      boolean;
    selectedIds:     Set<number>;
    hasMore:         boolean;
    remainingCount:  number;
    renderLimit:     number;
    cropCovers:      boolean;
    statsAlways:     boolean;
    libraryFilter:   string;
    bulkWorking:     boolean;
    visibleCategories: Category[];
    onCardClick:        (e: MouseEvent, m: Manga) => void;
    onCardContextMenu:  (e: MouseEvent, m: Manga) => void;
    onCardLongPress:    (node: HTMLElement, m: Manga) => ReturnType<typeof longPress>;
    onLoadMore:         () => void;
    onRetry:            () => void;
    onExitSelectMode:   () => void;
    onSelectAll:        () => void;
    onBulkMove:         (cat: Category) => void;
    onBulkRemove:       () => void;
    onBulkAutomate:     () => void;
  }

  let {
    visibleManga, filtered, loading, cols, anims, selectMode, selectedIds,
    hasMore, remainingCount, renderLimit, cropCovers, statsAlways, libraryFilter,
    bulkWorking, visibleCategories,
    onCardClick, onCardContextMenu, onCardLongPress,
    onLoadMore, onRetry, onExitSelectMode, onSelectAll, onBulkMove, onBulkRemove, onBulkAutomate,
  }: Props = $props();

  let bulkMoveOpen: boolean = $state(false);

  $effect(() => {
    if (!bulkMoveOpen) return;
    function onOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".bulk-move-wrap")) bulkMoveOpen = false;
    }
    setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    return () => document.removeEventListener("mousedown", onOutside, true);
  });

  $effect(() => { if (!selectMode) bulkMoveOpen = false; });
</script>

{#if selectMode}
  <div class="select-bar">
    <span class="sel-count">{selectedIds.size} selected</span>
    <button class="sel-text-btn" onclick={onSelectAll} title="Select all (⌘A)">Select all</button>

    <div class="select-bar-right">
      {#if visibleCategories.length}
        <div class="bulk-move-wrap">
          <button
            class="sel-action-btn"
            disabled={selectedIds.size === 0 || bulkWorking}
            onclick={() => bulkMoveOpen = !bulkMoveOpen}
          >
            <Folder size={13} weight="bold" />
            Move
          </button>
          {#if bulkMoveOpen}
            <div class="bulk-folder-list">
              {#each visibleCategories as cat}
                <button class="bulk-folder-item" onclick={() => { onBulkMove(cat); bulkMoveOpen = false; }}>
                  <Folder size={11} weight="bold" />
                  {cat.name}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <button class="sel-action-btn" disabled={selectedIds.size === 0 || bulkWorking} onclick={onBulkAutomate}>
        <Robot size={13} weight="bold" />
        Automate
      </button>
      <button class="sel-action-btn sel-action-danger" disabled={selectedIds.size === 0 || bulkWorking} onclick={onBulkRemove}>
        <Trash size={13} weight="bold" />
        Remove
      </button>
    </div>
  </div>
{/if}

<div class="content" role="presentation" onclick={(e) => { if (selectMode && !(e.target as HTMLElement).closest(".card")) onExitSelectMode(); }}>
  {#if loading}
    <div class="grid">
      {#each Array(12) as _}
        <div class="card-skeleton">
          <div class="cover-skeleton skeleton"></div>
          <div class="title-skeleton skeleton"></div>
        </div>
      {/each}
    </div>
  {:else if filtered.length === 0}
    <div class="center">
      {libraryFilter === "library" ? "No manga saved to library — browse sources to add some."
        : libraryFilter === "downloaded" ? "No downloaded manga."
        : "No manga in this folder yet. Right-click manga anywhere to assign them."}
    </div>
  {:else}
    <div class="grid" style="--cols:{cols}">
      {#each visibleManga as m (m.id)}
        {@const isSelected  = selectedIds.has(m.id)}
        {@const isCompleted = !m.unreadCount && (m.chapters?.totalCount ?? 0) > 0}
        <button
          class="card"
          class:card-selected={isSelected}
          class:select-mode={selectMode}
          class:anims={anims}
          use:onCardLongPress={m}
          onclick={(e) => onCardClick(e, m)}
          oncontextmenu={(e) => onCardContextMenu(e, m)}
        >
          <div class="cover-wrap" class:completed={isCompleted}>
            <Thumbnail src={resolvedCover(m.id, m.thumbnailUrl)} alt={m.title} class="cover" style="object-fit:{cropCovers ? 'cover' : 'contain'}" draggable="false" />
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
            {#if selectMode}
              <div class="select-overlay" aria-hidden="true">
                <div class="select-check" class:checked={isSelected}>
                  {#if isSelected}
                    <CheckSquare size={20} weight="fill" />
                  {:else}
                    <div class="select-check-empty"></div>
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
      <div class="load-more-row">
        <button class="load-more-btn" onclick={onLoadMore}>
          Show {Math.min(remainingCount, renderLimit)} more
          <span class="load-more-count">({remainingCount} remaining)</span>
        </button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .content { flex: 1; overflow-y: auto; padding: var(--sp-5) var(--sp-6) var(--sp-6); will-change: scroll-position; -webkit-overflow-scrolling: touch; }
  .select-bar { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-6); background: var(--bg-raised); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; animation: fadeIn 0.1s ease both; position: relative; z-index: 10; }
  .select-bar-right { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; position: relative; }
  .sel-count { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary); letter-spacing: var(--tracking-wide); white-space: nowrap; }
  .sel-text-btn { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 2px 4px; border-radius: var(--radius-sm); transition: color var(--t-base); }
  .sel-text-btn:hover { color: var(--text-primary); }
  .sel-action-btn { display: flex; align-items: center; gap: 5px; font-family: var(--font-ui); font-size: var(--text-xs); padding: 5px 10px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-muted); cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); white-space: nowrap; }
  .sel-action-btn:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
  .sel-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .sel-action-danger:hover:not(:disabled) { color: var(--color-error, #e05c5c); border-color: color-mix(in srgb, var(--color-error, #e05c5c) 40%, transparent); background: color-mix(in srgb, var(--color-error, #e05c5c) 8%, transparent); }
  .bulk-move-wrap { position: relative; }
  .bulk-folder-list { position: absolute; top: calc(100% + 4px); right: 0; z-index: 9999; background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 4px; min-width: 160px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); animation: fadeIn 0.1s ease both; }
  .bulk-folder-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 6px 10px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); cursor: pointer; text-align: left; transition: background var(--t-base), color var(--t-base); }
  .bulk-folder-item:hover { background: var(--bg-hover, var(--bg-base)); color: var(--text-primary); }
  .grid { position: relative; z-index: 1; isolation: isolate; display: grid; grid-template-columns: repeat(var(--cols, auto-fill), minmax(130px, 1fr)); gap: var(--sp-4); }
  .card { background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
  .card.anims:not(.select-mode):hover .cover-wrap { transform: translateY(-3px); border-color: var(--border-strong); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
  .card:not(.select-mode):hover .title { color: var(--text-primary); }
  .card.select-mode { cursor: default; }
  .card.card-selected .cover-wrap { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-md); }
  .card.card-selected .title { color: var(--accent-fg); }
  .cover-wrap { position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim); will-change: transform; }
  .card.anims .cover-wrap { transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), border-color var(--t-base), box-shadow 0.18s cubic-bezier(0.16,1,0.3,1); }
  .cover-wrap.completed { box-shadow: inset 0 -2px 0 0 var(--accent); }
  .card-info-overlay { position: absolute; bottom: -4px; left: 0; right: 0; z-index: 2; padding: 32px 6px 10px; background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 50%, transparent 100%); opacity: 0; pointer-events: none; }
  .card-info-overlay.anim { transition: opacity 0.18s ease; }
  .card-info-overlay.instant { transition: none; }
  .card-info-overlay.always { opacity: 1; }
  .card:not(.select-mode):hover .card-info-overlay { opacity: 1; }
  .overlay-badges { display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; flex-wrap: wrap; }
  .badge { font-family: var(--font-ui); font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; padding: 3px 7px; border-radius: 20px; white-space: nowrap; }
  .badge-unread { background: var(--accent); color: #fff; box-shadow: 0 1px 8px rgba(0,0,0,0.5); }
  .badge-done { background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.25); }
  .badge-dl { background: rgba(0,0,0,0.55); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.18); margin-left: auto; }
  .select-overlay { position: absolute; inset: 0; z-index: 3; background: rgba(0,0,0,0.18); display: flex; align-items: flex-start; justify-content: flex-end; padding: 6px; pointer-events: none; }
  .select-check { color: var(--text-faint); opacity: 0.7; transition: color var(--t-base), opacity var(--t-base); }
  .select-check.checked { color: var(--accent-fg); opacity: 1; }
  .select-check-empty { width: 20px; height: 20px; border-radius: 4px; border: 2px solid var(--text-faint); background: rgba(0,0,0,0.3); }
  .title { margin-top: var(--sp-2); font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2lh; }
  .card.anims .title { transition: color var(--t-base); }
  .card-skeleton { padding: 0; }
  .cover-skeleton { aspect-ratio: 2/3; border-radius: var(--radius-md); }
  .title-skeleton { height: 12px; margin-top: var(--sp-2); width: 80%; border-radius: var(--radius-sm); }
  .load-more-row { display: flex; justify-content: center; padding: var(--sp-5) 0 var(--sp-2); position: relative; z-index: 1; }
  .load-more-btn { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 8px 20px; border-radius: var(--radius-full); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-muted); cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .load-more-btn:hover { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .load-more-count { color: var(--text-faint); font-size: var(--text-2xs); }
  .center { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60%; color: var(--text-muted); font-size: var(--text-sm); gap: var(--sp-2); text-align: center; line-height: var(--leading-base); }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>