<script lang="ts">
  import { CheckCircle, CaretRight, CaretDown } from "phosphor-svelte";
  import Thumbnail from "$lib/components/shared/manga/Thumbnail.svelte";
  import { libraryState } from "$lib/state/library.svelte";
  import { timeAgo } from "$lib/core/util";
  import { formatBytes } from "$lib/components/downloads/lib/downloadQueue";
  import type { Download } from "$lib/server-adapters/types";

  interface Props {
    completed: Download[];
    loading:   boolean;
    limit?:    number;
  }
  const { completed, loading, limit }: Props = $props();

  interface HistoryGroup {
    mangaId:      string;
    mangaTitle:   string;
    thumbnailUrl: string;
    items:        Download[];
    totalBytes:   number;
    lastMs:       number;
  }

  function whenMs(iso: string | null): number {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? 0 : t;
  }

  const groups = $derived((() => {
    const map = new Map<string, Download[]>();
    for (const item of completed) {
      const mId = item.mediaId ?? "";
      if (!map.has(mId)) map.set(mId, []);
      map.get(mId)!.push(item);
    }
    const out: HistoryGroup[] = [];
    for (const [mangaId, items] of map.entries()) {
      const manga = libraryState.items.find((m) => m.id === mangaId) ?? null;
      out.push({
        mangaId,
        mangaTitle:   manga?.title ?? "Unknown series",
        thumbnailUrl: manga?.thumbnailUrl ?? "",
        items,
        totalBytes:   items.reduce((s, i) => s + (i.finalSizeBytes ?? 0), 0),
        lastMs:       items.reduce((m, i) => Math.max(m, whenMs(i.completedAt)), 0),
      });
    }
    return out.sort((a, b) => b.lastMs - a.lastMs);
  })());

  const shown = $derived(limit != null ? groups.slice(0, limit) : groups);

  let expanded: Set<string> = $state(new Set());
  function toggle(mangaId: string) {
    const next = new Set(expanded);
    next.has(mangaId) ? next.delete(mangaId) : next.add(mangaId);
    expanded = next;
  }
</script>

{#if loading && completed.length === 0}
  <div class="empty">Loading…</div>
{:else if completed.length === 0}
  <div class="empty">No completed downloads.</div>
{:else}
  <div class="list">
    {#each shown as group (group.mangaId)}
      {@const isExpanded = expanded.has(group.mangaId)}
      <div class="series-card-wrap">
        <div class="series-card">
          <button
            class="expand-btn"
            class:expanded={isExpanded}
            onclick={() => toggle(group.mangaId)}
            title={isExpanded ? "Collapse chapters" : "Expand chapters"}
          >
            {#if isExpanded}<CaretDown size={12} weight="bold" />{:else}<CaretRight size={12} weight="bold" />{/if}
          </button>

          {#if group.thumbnailUrl}
            <div class="thumb"><Thumbnail src={group.thumbnailUrl} alt={group.mangaTitle} class="thumb-img" /></div>
          {/if}

          <div class="series-info">
            <div class="series-title-row">
              <span class="series-title">{group.mangaTitle}</span>
              <span class="series-count-badge">{group.items.length} {group.items.length === 1 ? "chapter" : "chapters"}</span>
            </div>
            <div class="series-meta">
              <span class="check"><CheckCircle size={12} weight="fill" /></span>
              {#if formatBytes(group.totalBytes)}<span>{formatBytes(group.totalBytes)}</span>{/if}
              {#if group.lastMs}<span>{timeAgo(group.lastMs)}</span>{/if}
            </div>
          </div>
        </div>

        {#if isExpanded}
          <div class="sub-item-list">
            {#each group.items as item (item.id || item.chapterId)}
              <div class="sub-row">
                <span class="sub-title">{item.chapter.title ?? "Chapter"}</span>
                <span class="sub-meta">
                  {#if formatBytes(item.finalSizeBytes)}<span>{formatBytes(item.finalSizeBytes)}</span>{/if}
                  {#if whenMs(item.completedAt)}<span class="sub-when">{timeAgo(whenMs(item.completedAt))}</span>{/if}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
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

  .series-meta { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .check { color: var(--color-success, var(--accent-fg)); display: flex; }

  .sub-item-list {
    margin-left: 28px; margin-top: 2px;
    padding-left: var(--sp-3); border-left: 2px solid var(--border-dim);
    display: flex; flex-direction: column; gap: var(--sp-2);
  }
  .sub-row {
    display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3);
    background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-sm);
  }
  .sub-title { flex: 1; font-size: var(--text-xs); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub-meta { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .sub-when { min-width: 52px; text-align: right; }
</style>
