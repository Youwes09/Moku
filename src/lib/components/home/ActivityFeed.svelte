<script lang="ts">
  import { Play, ArrowRight, BookOpen, Clock } from 'phosphor-svelte'
  import { timeAgo } from '$lib/core/util'
  import Thumbnail from '$lib/components/shared/manga/Thumbnail.svelte'
  import { historyState } from '$lib/state/history.svelte'
  import type { ReadSession } from '$lib/types/history'

  let {
    onresume,
    onviewhistory,
    onopenlibrary,
  }: {
    onresume:      (session: ReadSession) => void
    onviewhistory: () => void
    onopenlibrary: () => void
  } = $props()

  const entries = $derived(
    historyState.sessions
      .filter((s, i, arr) => arr.findIndex(x => x.mangaId === s.mangaId) === i)
      .slice(0, 5)
  )
</script>

<div class="section">
  <div class="section-header">
    <span class="section-title"><Clock size={10} weight="bold" /> Recent Activity</span>
    {#if entries.length > 0}
      <button class="see-all" onclick={onviewhistory}>
        Full History <ArrowRight size={9} weight="bold" />
      </button>
    {/if}
  </div>

  <div class="list">
    {#if entries.length > 0}
      {#each entries as entry (entry.id)}
        <button class="row" onclick={() => onresume(entry)}>
          <Thumbnail src={entry.thumbnailUrl} alt={entry.mangaTitle} class="row-thumb" contentType={entry.contentType} />
          <div class="row-info">
            <span class="row-title">{entry.mangaTitle}</span>
            <span class="row-sub">
              {entry.endChapterName}{entry.endPage > 1 ? ` · p.${entry.endPage}` : ''}
            </span>
          </div>
          <span class="row-time" title={new Date(entry.endedAt).toLocaleString()}>{timeAgo(entry.endedAt)}</span>
          <span class="row-play"><Play size={10} weight="fill" /></span>
        </button>
      {/each}
    {:else}
      <div class="empty">
        <BookOpen size={18} weight="light" />
        <span class="empty-text">No recent activity yet</span>
        <button class="empty-cta" onclick={onopenlibrary}>
          <BookOpen size={12} weight="light" /> Start reading
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .section { border-top: 1px solid var(--border-dim); flex-shrink: 0; }

  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-3) var(--sp-4) var(--sp-2);
  }
  .section-title {
    display: inline-flex; align-items: center; gap: var(--sp-2);
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase;
  }
  .see-all {
    display: flex; align-items: center; gap: 4px;
    font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide); text-transform: uppercase;
    color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0;
    transition: color var(--t-base);
  }
  .see-all:hover { color: var(--accent-fg); }

  .list { display: flex; flex-direction: column; padding: 0 var(--sp-3); overflow: hidden; }

  .row {
    display: flex; align-items: center; gap: var(--sp-3);
    padding: 7px var(--sp-2); border-radius: var(--radius-md);
    border: 1px solid transparent; background: none;
    text-align: left; cursor: pointer; width: 100%;
    transition: background var(--t-fast), border-color var(--t-fast);
  }
  .row:hover { background: var(--bg-raised); border-color: var(--border-dim); }
  .row:hover .row-play { opacity: 1; }

  :global(.row-thumb) {
    width: 33px; height: 48px; border-radius: var(--radius-sm);
    object-fit: cover; flex-shrink: 0; border: 1px solid var(--border-dim);
  }
  .row-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
  .row-title {
    font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row-sub {
    font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-muted);
    letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row-time {
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--text-faint); letter-spacing: var(--tracking-wide); flex-shrink: 0;
  }
  .row-play { color: var(--accent-fg); flex-shrink: 0; opacity: 0; transition: opacity var(--t-base); }

  .empty {
    display: flex; flex-direction: column; align-items: center; gap: var(--sp-2);
    padding: var(--sp-6) var(--sp-4);
    color: var(--text-faint);
  }
  .empty-text {
    font-family: var(--font-ui); font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
  }
  .empty-cta {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 6px 14px; border-radius: var(--radius-full);
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    color: var(--text-muted); cursor: pointer;
    transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
  }
  .empty-cta:hover { color: var(--text-primary); border-color: var(--border-strong); }
</style>