<script lang="ts">
  import Thumbnail from '$lib/components/shared/manga/Thumbnail.svelte'
  import TrackerLogo from '$lib/components/tracking/TrackerLogo.svelte'
  import { calcProgress, type FlatRecord } from '$lib/components/tracking/lib/trackingSync'
  import { statusLabel } from '$lib/state/trackers.svelte'

  interface Props {
    record:   FlatRecord
    active:   boolean
    onSelect: (r: FlatRecord) => void
  }

  let { record, active, onSelect }: Props = $props()

  const progress = $derived(calcProgress(record.lastChapterRead, record.totalChapters))
  const status   = $derived(statusLabel(record.status, record.tracker, record.media.contentType))
</script>

<button class="card" class:active onclick={() => onSelect(record)}>
  <div class="cover-wrap">
    {#if record.thumbnailUrl}
      <Thumbnail src={record.thumbnailUrl} alt={record.title} class="cover" contentType={record.media.contentType} />
    {:else}
      <div class="cover-empty"></div>
    {/if}
    <div class="tracker-badge">
      <TrackerLogo trackerKey={record.tracker.key} iconUrl={record.tracker.iconUrl} size={12} />
    </div>
    {#if progress !== null}
      <div class="progress-bar">
        <div class="progress-fill" style="width:{progress}%"></div>
      </div>
    {/if}
  </div>
  <p class="title">{record.title}</p>
  <p class="meta">{status} · {record.lastChapterRead}/{record.totalChapters || '?'}</p>
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

  .progress-bar {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 2px; background: rgba(0,0,0,0.4);
  }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }

  .title {
    margin-top: var(--sp-2);
    font-size: var(--text-sm); color: var(--text-secondary);
    line-height: var(--leading-snug);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
    transition: color var(--t-base);
  }
  .meta {
    margin-top: 3px;
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
