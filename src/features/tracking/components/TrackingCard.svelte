<script lang="ts">
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import type { FlatRecord } from "../lib/trackingSync";
  import { calcProgress } from "../lib/trackingSync";

  interface Props {
    record:   FlatRecord;
    active:   boolean;
    onSelect: (r: FlatRecord) => void;
  }

  let { record, active, onSelect }: Props = $props();

  const progress = $derived(calcProgress(record.lastChapterRead, record.totalChapters));
</script>

<button class="card" class:active onclick={() => onSelect(record)}>
  <div class="cover-wrap">
    {#if record.manga?.thumbnailUrl}
      <Thumbnail src={record.manga.thumbnailUrl} alt={record.title} class="cover" />
    {:else}
      <div class="cover-empty"></div>
    {/if}
    <div class="tracker-badge">
      <Thumbnail src={record.tracker.icon} alt={record.tracker.name} class="badge-img" />
    </div>
    {#if progress !== null}
      <div class="progress-bar">
        <div class="progress-fill" style="width:{progress}%"></div>
      </div>
    {/if}
  </div>
  <p class="title">{record.title}</p>
</button>

<style>
  .card {
    background: none; border: none; padding: 0;
    cursor: pointer; text-align: left;
  }
  .card:hover .cover-wrap { border-color: var(--border-strong); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
  .card:hover .title { color: var(--text-primary); }
  .card.active .cover-wrap { outline: 2px solid var(--accent); outline-offset: 2px; border-color: var(--accent-dim); }
  .card.active .title { color: var(--accent-fg); }

  .cover-wrap {
    position: relative; aspect-ratio: 2/3; overflow: hidden;
    border-radius: var(--radius-md); background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), border-color var(--t-base), box-shadow 0.18s cubic-bezier(0.16,1,0.3,1);
  }
  :global(.cover) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-empty { width: 100%; height: 100%; background: var(--bg-overlay); }

  .tracker-badge {
    position: absolute; bottom: 6px; left: 6px; z-index: 2;
    width: 18px; height: 18px; border-radius: 4px;
    border: 1px solid rgba(0,0,0,0.3); background: var(--bg-raised);
    box-shadow: 0 2px 6px rgba(0,0,0,0.4); overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  :global(.badge-img) { width: 100%; height: 100%; object-fit: contain; display: block; }

  .progress-bar {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 2px; background: rgba(0,0,0,0.4);
  }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }

  .title {
    margin-top: var(--sp-2);
    font-size: var(--text-sm); color: var(--text-secondary);
    line-height: var(--leading-snug);
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
    height: 2lh;
    transition: color var(--t-base);
  }
</style>