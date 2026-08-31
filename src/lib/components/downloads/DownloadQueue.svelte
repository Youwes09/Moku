<script lang="ts">
  import { CircleNotchIcon, CaretUp, CaretDown, CaretRight, Trash, ArrowClockwise, X, ArrowLineUp, ArrowLineDown, ArrowsDownUp } from "phosphor-svelte";
  import Thumbnail    from "$lib/components/shared/manga/Thumbnail.svelte";
  import DownloadItem    from "$lib/components/downloads/DownloadItem.svelte";
  import ContextMenu, { type MenuEntry } from "$lib/components/shared/ui/ContextMenu.svelte";
  import { downloadStore } from "$lib/state/downloads.svelte";
  import { libraryState } from "$lib/state/library.svelte";
  import type { Download } from "$lib/server-adapters/types";

  interface Props {
    queue:      Download[];
    loading:    boolean;
    isRunning:  boolean;
    dequeueing: Set<string>;
    selected:   Set<string>;
    limit?:     number;
    onRemove: (chapterId: string) => void;
    onRetry:  (chapterId: string) => void;
    onSelect: (chapterId: string, e: MouseEvent) => void;
  }

  const {
    queue, loading, isRunning, dequeueing, selected, limit,
    onRemove, onRetry, onSelect,
  }: Props = $props();

  let expandedSeriesIds: Set<string> = $state(new Set());
  let confirmDeleteSeries: { title: string; items: Download[] } | null = $state(null);
  let seriesCtx = $state<{ x: number; y: number; group: SeriesDownloadGroup } | null>(null);

  export interface SeriesDownloadGroup {
    mangaId:           string;
    mangaTitle:        string;
    thumbnailUrl:      string;
    contentType:       "MANGA" | "NOVEL" | "ANIME" | undefined;
    items:             Download[];
    seriesPct:         number;
    activeChapter:     Download | null;
    activeChapterPct:  number;
    activeChapterName: string;
    isDownloading:     boolean;
    hasError:          boolean;
  }

  const seriesGroups = $derived((() => {
    const map = new Map<string, Download[]>();
    for (const item of queue) {
      const mId = item.mediaId ?? "";
      if (!map.has(mId)) map.set(mId, []);
      map.get(mId)!.push(item);
    }

    const groups: SeriesDownloadGroup[] = [];
    for (const [mangaId, items] of map.entries()) {
      const manga = libraryState.items.find(m => m.id === mangaId) ?? null;
      const title = manga?.title ?? "Unknown Series";
      const thumb = manga?.thumbnailUrl ?? "";

      const totalProg = items.reduce((sum, i) => sum + (i.progress ?? 0), 0);
      const seriesPct = Math.round((totalProg / items.length) * 100);

      const downloading = items.find(i => i.status === "DOWNLOADING");
      const active = downloading ?? items.find(i => (i.progress ?? 0) > 0) ?? items[0];
      const activePct = active ? Math.round((active.progress ?? 0) * 100) : 0;

      groups.push({
        mangaId,
        mangaTitle:        title,
        thumbnailUrl:      thumb,
        contentType:       manga?.contentType,
        items,
        seriesPct,
        activeChapter:     active,
        activeChapterPct:  activePct,
        activeChapterName: active ? (active.chapter.title ?? "Chapter") : "",
        isDownloading:     items.some(i => i.status === "DOWNLOADING"),
        hasError:          items.some(i => i.status === "FAILED"),
      });
    }

    return groups;
  })());

  const shownGroups = $derived(limit != null ? seriesGroups.slice(0, limit) : seriesGroups);

  function toggleExpand(mangaId: string, e: MouseEvent) {
    e.stopPropagation();
    const next = new Set(expandedSeriesIds);
    if (next.has(mangaId)) next.delete(mangaId);
    else next.add(mangaId);
    expandedSeriesIds = next;
  }

  function retrySeries(items: Download[], e: MouseEvent) {
    e.stopPropagation();
    items.filter(i => i.status === "FAILED").forEach(i => onRetry(i.chapterId));
  }

  function openSeriesCtx(e: MouseEvent, group: SeriesDownloadGroup) {
    e.preventDefault();
    e.stopPropagation();
    seriesCtx = { x: e.clientX, y: e.clientY, group };
  }

  function buildSeriesCtxItems(group: SeriesDownloadGroup): MenuEntry[] {
    return [
      {
        label: "Move up",
        icon: CaretUp,
        onClick: () => downloadStore.moveSeries(group.items, "up"),
      },
      {
        label: "Move down",
        icon: CaretDown,
        onClick: () => downloadStore.moveSeries(group.items, "down"),
      },
      { separator: true },
      {
        label: "Move series to top",
        icon: ArrowLineUp,
        onClick: () => downloadStore.moveSeriesToTop(group.items),
      },
      {
        label: "Move series to bottom",
        icon: ArrowLineDown,
        onClick: () => downloadStore.moveSeriesToBottom(group.items),
      },
      {
        label: "Reverse chapter order",
        icon: ArrowsDownUp,
        onClick: () => downloadStore.reverseSeriesOrder(group.items),
      },
      { separator: true },
      {
        label: "Remove series downloads",
        icon: Trash,
        danger: true,
        onClick: () => { confirmDeleteSeries = { title: group.mangaTitle, items: group.items }; },
      },
    ];
  }
</script>

{#if loading}
  <div class="list">
    {#each Array(3) as _, i (i)}
      <div class="sk-row">
        <div class="sk-thumb skeleton"></div>
        <div class="sk-info">
          <div class="skeleton sk-title"></div>
          <div class="skeleton sk-chapter"></div>
          <div class="sk-progress-row">
            <div class="skeleton sk-bar"></div>
            <div class="skeleton sk-pages"></div>
          </div>
        </div>
      </div>
    {/each}
  </div>
{:else if queue.length === 0}
  <div class="empty">Queue is empty.</div>
{:else}
  <div class="list">
    {#each shownGroups as group (group.mangaId)}
      {@const isExpanded = expandedSeriesIds.has(group.mangaId)}
      <div class="series-card-wrap">
        <div
          class="series-card"
          class:is-downloading={group.isDownloading}
          oncontextmenu={(e) => openSeriesCtx(e, group)}
        >
          <button
            class="expand-btn"
            class:expanded={isExpanded}
            onclick={(e) => toggleExpand(group.mangaId, e)}
            title={isExpanded ? "Collapse chapters" : "Expand chapters"}
          >
            {#if isExpanded}
              <CaretDown size={12} weight="bold" />
            {:else}
              <CaretRight size={12} weight="bold" />
            {/if}
          </button>

          {#if group.thumbnailUrl}
            <div class="thumb">
              <Thumbnail src={group.thumbnailUrl} alt={group.mangaTitle} class="thumb-img" contentType={group.contentType} />
            </div>
          {/if}

          <div class="series-info">
            <div class="series-title-row">
              <span class="series-title">{group.mangaTitle}</span>
              <span class="series-count-badge">{group.items.length} {group.items.length === 1 ? "chapter" : "chapters"}</span>
            </div>

            {#if group.activeChapter}
              <div class="series-prog-container">
                <div class="prog-item">
                  <span class="prog-label" title="Current chapter: {group.activeChapterName}">
                    Current ({group.activeChapterName}):
                  </span>
                  <div class="prog-track">
                    <div class="prog-fill" style="width: {group.activeChapterPct}%"></div>
                  </div>
                  <span class="prog-pct">{group.activeChapterPct}%</span>
                </div>
              </div>
            {/if}
          </div>

          <div class="series-actions">
            {#if group.hasError}
              <button class="action-btn retry" onclick={(e) => retrySeries(group.items, e)} title="Retry errors">
                <ArrowClockwise size={12} weight="bold" />
              </button>
            {/if}
            <button
              class="action-btn remove"
              onclick={(e) => { e.stopPropagation(); confirmDeleteSeries = { title: group.mangaTitle, items: group.items }; }}
              title="Remove series downloads"
            >
              <Trash size={13} weight="light" />
            </button>
          </div>
        </div>

        {#if isExpanded}
          <div class="sub-item-list">
            {#each group.items as item (item.chapterId)}
              {@const globalIdx = queue.findIndex(q => q.chapterId === item.chapterId)}
              <DownloadItem
                {item}
                isActive={globalIdx === 0 && isRunning}
                isRemoving={dequeueing.has(item.chapterId)}
                isSelected={selected.has(item.chapterId)}
                {onRemove}
                {onRetry}
                {onSelect}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if confirmDeleteSeries}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => confirmDeleteSeries = null}
    onkeydown={(e) => e.key === 'Escape' && (confirmDeleteSeries = null)}
  >
    <div class="modal-card" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">Remove downloads?</span>
      </div>
      <div class="modal-body">
        <p class="modal-msg">Remove all chapter downloads for <strong>{confirmDeleteSeries.title}</strong> from the queue?</p>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick={() => confirmDeleteSeries = null}>Cancel</button>
        <button
          class="btn-danger"
          onclick={() => {
            if (confirmDeleteSeries) {
              confirmDeleteSeries.items.forEach(i => onRemove(i.chapterId));
            }
            confirmDeleteSeries = null;
          }}
        >
          Remove
        </button>
      </div>
    </div>
  </div>
{/if}

{#if seriesCtx}
  <ContextMenu
    x={seriesCtx.x}
    y={seriesCtx.y}
    items={buildSeriesCtxItems(seriesCtx.group)}
    onClose={() => seriesCtx = null}
  />
{/if}

<style>
  .list  { display: flex; flex-direction: column; gap: var(--sp-3); }
  .empty { display: flex; align-items: center; justify-content: center; height: 160px; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); }

  .series-card-wrap { display: flex; flex-direction: column; gap: 2px; }

  .series-card {
    display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3);
    background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md);
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .series-card:hover { border-color: var(--border-strong); background: var(--bg-elevated); }
  .series-card.is-downloading { border-color: var(--accent-dim); background: color-mix(in srgb, var(--accent) 5%, var(--bg-raised)); }

  .expand-btn {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-faint);
    cursor: pointer; flex-shrink: 0;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .expand-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }
  .expand-btn.expanded { color: var(--accent-fg); }

  .thumb { width: 36px; height: 54px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-overlay); flex-shrink: 0; border: 1px solid var(--border-dim); }
  :global(.thumb-img) { width: 100%; height: 100%; object-fit: cover; }

  .series-info { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .series-title-row { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
  .series-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .series-count-badge { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); opacity: 0.7; flex-shrink: 0; white-space: nowrap; }

  .series-prog-container { display: flex; flex-direction: column; gap: 3px; margin-top: 2px; }
  .prog-item { display: flex; align-items: center; gap: var(--sp-2); }
  .prog-label { font-family: var(--font-ui); font-size: 10px; color: var(--text-muted); min-width: 85px; max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
  .prog-track { flex: 1; height: 3px; background: var(--border-base); border-radius: var(--radius-full); overflow: hidden; }
  .prog-fill { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.3s ease; }
  .prog-pct { font-family: var(--font-ui); font-size: 10px; font-weight: 600; color: var(--accent-fg); min-width: 28px; text-align: right; flex-shrink: 0; }

  .series-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .action-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base), background var(--t-base); }
  .action-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }
  .action-btn.remove:hover { color: var(--color-error); background: var(--color-error-bg); }
  .action-btn.retry:hover  { color: var(--accent-fg); background: var(--accent-muted); }

  .sub-item-list {
    margin-left: 28px; margin-top: 2px;
    padding-left: var(--sp-3); border-left: 2px solid var(--border-dim);
    display: flex; flex-direction: column; gap: var(--sp-2);
  }

  @keyframes shimmer { from { background-position: -200% 0 } to { background-position: 200% 0 } }
  .skeleton {
    border-radius: var(--radius-sm);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--bg-overlay) 90%, var(--text-primary) 6%) 20%,
      color-mix(in srgb, var(--bg-overlay) 76%, var(--text-primary) 16%) 50%,
      color-mix(in srgb, var(--bg-overlay) 90%, var(--text-primary) 6%) 80%
    );
    background-size: 220% 100%;
    animation: shimmer 1.45s ease-in-out infinite;
  }

  .sk-row          { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); pointer-events: none; }
  .sk-thumb        { width: 36px; height: 54px; flex-shrink: 0; }
  .sk-info         { flex: 1; display: flex; flex-direction: column; gap: 5px; overflow: hidden; min-width: 0; }
  .sk-title        { height: 12px; width: clamp(120px, 55%, 280px); }
  .sk-chapter      { height: 10px; width: clamp(80px, 35%, 200px); }
  .sk-progress-row { display: flex; align-items: center; gap: var(--sp-2); }

  .modal-backdrop {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.12s ease both;
  }
  .modal-card {
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-lg); width: 340px; max-width: 90vw;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); overflow: hidden;
    display: flex; flex-direction: column;
  }
  .modal-header { padding: var(--sp-4) var(--sp-4) var(--sp-2); }
  .modal-title  { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  .modal-body   { padding: 0 var(--sp-4) var(--sp-4); }
  .modal-msg    { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); line-height: 1.4; margin: 0; }
  .modal-actions {
    display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border-dim); background: var(--bg-raised);
  }
  .btn-cancel, .btn-danger {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 12px; border-radius: var(--radius-sm); cursor: pointer;
    transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
  }
  .btn-cancel { border: 1px solid var(--border-dim); background: none; color: var(--text-muted); }
  .btn-cancel:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .btn-danger {
    border: 1px solid color-mix(in srgb, var(--color-error) 40%, transparent);
    background: var(--color-error-bg); color: var(--color-error);
  }
  .btn-danger:hover {
    background: color-mix(in srgb, var(--color-error) 20%, transparent);
    border-color: var(--color-error);
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
