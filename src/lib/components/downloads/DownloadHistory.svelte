<script lang="ts">
  import { CheckCircle } from "phosphor-svelte";
  import Thumbnail from "$lib/components/shared/manga/Thumbnail.svelte";
  import { libraryState } from "$lib/state/library.svelte";
  import { timeAgo } from "$lib/core/util";
  import { formatBytes } from "$lib/components/downloads/lib/downloadQueue";
  import type { Download } from "$lib/server-adapters/types";

  interface Props {
    completed: Download[];
    loading:   boolean;
  }
  const { completed, loading }: Props = $props();

  function titleFor(mediaId: string): string {
    return libraryState.items.find((m) => m.id === mediaId)?.title ?? "Unknown series";
  }
  function thumbFor(mediaId: string): string {
    return libraryState.items.find((m) => m.id === mediaId)?.thumbnailUrl ?? "";
  }
  function whenMs(iso: string | null): number {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? 0 : t;
  }
</script>

{#if loading && completed.length === 0}
  <div class="empty">Loading…</div>
{:else if completed.length === 0}
  <div class="empty">No completed downloads.</div>
{:else}
  <div class="list">
    {#each completed as item (item.id || item.chapterId)}
      {@const thumb = thumbFor(item.mediaId)}
      <div class="row">
        {#if thumb}
          <div class="thumb"><Thumbnail src={thumb} alt="" class="thumb-img" /></div>
        {/if}
        <div class="info">
          <span class="series">{titleFor(item.mediaId)}</span>
          <span class="chapter">{item.chapter.title ?? "Chapter"}</span>
        </div>
        <div class="meta">
          <span class="check"><CheckCircle size={13} weight="fill" /></span>
          {#if formatBytes(item.finalSizeBytes)}<span class="size">{formatBytes(item.finalSizeBytes)}</span>{/if}
          {#if whenMs(item.completedAt)}<span class="when">{timeAgo(whenMs(item.completedAt))}</span>{/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .list  { display: flex; flex-direction: column; gap: var(--sp-2); }
  .empty { display: flex; align-items: center; justify-content: center; height: 160px; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); }

  .row {
    display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3);
    background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md);
  }
  .thumb { width: 32px; height: 48px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-overlay); flex-shrink: 0; border: 1px solid var(--border-dim); }
  :global(.thumb-img) { width: 100%; height: 100%; object-fit: cover; }

  .info    { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .series  { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chapter { font-size: var(--text-xs); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .meta  { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .check { color: var(--color-success, var(--accent-fg)); display: flex; }
  .size  { color: var(--text-faint); }
  .when  { color: var(--text-faint); min-width: 52px; text-align: right; }
</style>
