<script lang="ts">
  import { Play, ArrowRight, BookOpen, Clock } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import type { HistoryEntry } from "@store/state.svelte";
  import type { Manga } from "@types";
  import { timeAgo } from "../lib/homeHelpers";

  let {
    entries,
    libraryManga,
    onresume,
    onviewhistory,
    onopenlibrary,
  }: {
    entries: HistoryEntry[];
    libraryManga: Manga[];
    onresume: (entry: HistoryEntry) => void;
    onviewhistory: () => void;
    onopenlibrary: () => void;
  } = $props();

  function thumbFor(entry: HistoryEntry): string {
    return libraryManga.find(m => m.id === entry.mangaId)?.thumbnailUrl ?? entry.thumbnailUrl ?? "";
  }
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
      {#each entries as entry (entry.chapterId)}
        <button class="row" onclick={() => onresume(entry)}>
          <Thumbnail src={thumbFor(entry)} alt={entry.mangaTitle} class="row-thumb" />
          <div class="row-info">
            <span class="row-title">{entry.mangaTitle}</span>
            <span class="row-sub">
              {entry.chapterName}{entry.pageNumber > 1 ? ` · p.${entry.pageNumber}` : ""}
            </span>
          </div>
          <span class="row-time">{timeAgo(entry.readAt)}</span>
          <span class="row-play"><Play size={10} weight="fill" /></span>
        </button>
      {/each}
    {:else}
      <div class="placeholder">
        {#each Array(5) as _, i}
          <div class="row row-sk">
            <div class="sk-thumb"></div>
            <div class="row-info">
              <div class="sk sk-title" style="width: {55 + (i * 7) % 30}%"></div>
              <div class="sk sk-sub" style="width: {30 + (i * 11) % 25}%"></div>
            </div>
            <div class="sk sk-time"></div>
          </div>
        {/each}
        <div class="placeholder-overlay">
          <button class="placeholder-cta" onclick={onopenlibrary}>
            <BookOpen size={12} weight="light" /> Start reading
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .section { border-top: 1px solid var(--border-dim); flex-shrink: 0; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-3) var(--sp-4) var(--sp-2);
  }
  .section-title {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }
  .see-all {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--text-faint);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: color var(--t-base);
  }
  .see-all:hover { color: var(--accent-fg); }

  .list { display: flex; flex-direction: column; padding: 0 var(--sp-3); overflow: hidden; }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 7px var(--sp-2);
    border-radius: var(--radius-md);
    border: 1px solid transparent;
    background: none;
    text-align: left;
    cursor: pointer;
    width: 100%;
    transition: background var(--t-fast), border-color var(--t-fast);
  }
  .row:hover { background: var(--bg-raised); border-color: var(--border-dim); }
  .row:hover .row-play { opacity: 1; }

  :global(.row-thumb) {
    width: 33px;
    height: 48px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid var(--border-dim);
  }

  .row-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
  .row-title {
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-sub {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--text-muted);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-time {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    flex-shrink: 0;
  }
  .row-play { color: var(--accent-fg); flex-shrink: 0; opacity: 0; transition: opacity var(--t-base); }

  .row-sk { cursor: default; pointer-events: none; }
  .sk-thumb { width: 33px; height: 48px; border-radius: var(--radius-sm); background: rgba(255,255,255,0.06); flex-shrink: 0; }
  .sk { background: var(--bg-raised); border-radius: var(--radius-sm); animation: pulse 1.6s ease-in-out infinite; }
  .sk-title { height: 11px; margin-bottom: 5px; }
  .sk-sub { height: 9px; }
  .sk-time { width: 32px; height: 9px; flex-shrink: 0; background: rgba(255,255,255,0.06); border-radius: var(--radius-sm); }

  .placeholder { position: relative; }
  .placeholder-overlay {
    position: absolute;
    left: 0; right: 0; top: 0; bottom: -1px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: var(--sp-4);
    pointer-events: none;
    background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 100%);
  }
  .placeholder-cta {
    pointer-events: all;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    padding: 7px 16px;
    border-radius: var(--radius-full);
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.13);
    color: rgba(255,255,255,0.62);
    cursor: pointer;
    transition: background var(--t-base), color var(--t-base);
  }
  .placeholder-cta:hover { background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.9); }

  @keyframes pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.7 } }
</style>