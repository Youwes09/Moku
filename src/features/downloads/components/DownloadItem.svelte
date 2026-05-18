<script lang="ts">
  import { CircleNotch, ArrowClockwise, X } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import { longPress } from "@core/ui/touchscreen";
  import type { DownloadQueueItem } from "@types/index";
  import { pageProgress } from "../lib/downloadQueue";

  interface Props {
    item:       DownloadQueueItem;
    isActive:   boolean;
    isRemoving: boolean;
    isSelected: boolean;
    onRemove:   (chapterId: number) => void;
    onRetry:    (chapterId: number) => void;
    onSelect:   (chapterId: number, e: MouseEvent) => void;
  }

  const {
    item, isActive, isRemoving, isSelected,
    onRemove, onRetry, onSelect,
  }: Props = $props();

  const manga   = $derived(item.chapter.manga);
  const pages   = $derived(item.chapter.pageCount ?? 0);
  const prog    = $derived(pageProgress(item.progress, pages));
  const isError = $derived(item.state === "ERROR");
  const pct     = $derived(Math.round(item.progress * 100));

  function rowLongPress(node: HTMLElement) {
    return longPress(node, {
      onLongPress() { onSelect(item.chapter.id, { shiftKey: false, ctrlKey: true, metaKey: false } as MouseEvent); },
    });
  }
</script>

<div
  class="row"
  class:row-active={isActive}
  class:row-error={isError}
  class:row-selected={isSelected}
  class:row-removing={isRemoving}
  role="option"
  aria-selected={isSelected}
  tabindex="0"
  use:rowLongPress
  onclick={(e) => { e.stopPropagation(); onSelect(item.chapter.id, e); }}
  onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSelect(item.chapter.id, e as unknown as MouseEvent); } }}
>
  {#if manga?.thumbnailUrl}
    <div class="thumb">
      <Thumbnail src={manga.thumbnailUrl} alt={manga.title} class="thumb-img" />
    </div>
  {/if}

  <div class="info">
    {#if manga?.title}<span class="manga-title">{manga.title}</span>{/if}
    <span class="chapter-name">{item.chapter.name}</span>
    {#if pages > 0}
      <div class="progress-row">
        <div class="progress-wrap">
          <div class="progress-bar" class:progress-error={isError} style="width:{pct}%"></div>
        </div>
        <span class="pages-label">
          {#if isActive}
            {prog.done}/{prog.total}
          {:else if isError}
            failed · {item.tries} {item.tries === 1 ? "try" : "tries"}
          {:else}
            {prog.total}p
          {/if}
        </span>
      </div>
    {/if}
  </div>

  <div class="row-right">
    <span class="state-label" class:state-error={isError}>{item.state}</span>
    <div class="actions">
      {#if isError}
        <button class="action-btn retry" onclick={(e) => { e.stopPropagation(); onRetry(item.chapter.id); }} disabled={isRemoving} title="Retry">
          {#if isRemoving}<CircleNotch size={11} weight="light" class="anim-spin" />{:else}<ArrowClockwise size={11} weight="bold" />{/if}
        </button>
      {/if}
      {#if !isActive}
        <button class="action-btn remove" onclick={(e) => { e.stopPropagation(); onRemove(item.chapter.id); }} disabled={isRemoving} title="Remove">
          {#if isRemoving}<CircleNotch size={11} weight="light" class="anim-spin" />{:else}<X size={12} weight="light" />{/if}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3);
    background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-md);
    transition: border-color var(--t-fast), opacity var(--t-base), background var(--t-fast);
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .row:hover:not(.row-active):not(.row-removing) { border-color: var(--border-strong); background: var(--bg-elevated); }
  .row.row-active   { border-color: var(--accent-dim); }
  .row.row-error    { border-color: color-mix(in srgb, var(--color-error) 30%, transparent); }
  .row.row-selected { background: var(--bg-elevated); border-color: var(--border-strong); }
  .row.row-removing { opacity: 0.4; pointer-events: none; }

  .thumb { width: 36px; height: 54px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-overlay); flex-shrink: 0; border: 1px solid var(--border-dim); }
  :global(.thumb-img) { width: 100%; height: 100%; object-fit: cover; }

  .info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; min-width: 0; }

  .manga-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chapter-name { font-size: var(--text-xs); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .progress-row { display: flex; align-items: center; gap: var(--sp-2); }
  .progress-wrap { flex: 1; height: 2px; background: var(--border-base); border-radius: var(--radius-full); overflow: hidden; }
  .progress-bar { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.4s ease; opacity: 0.5; }
  .row-active .progress-bar { opacity: 1; }
  .progress-bar.progress-error { background: var(--color-error); opacity: 0.7; }
  .pages-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); flex-shrink: 0; white-space: nowrap; }

  .row-right { display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-1); flex-shrink: 0; }
  .state-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .state-label.state-error { color: var(--color-error); opacity: 0.8; }

  .actions { display: flex; align-items: center; gap: 2px; }
  .action-btn { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base), background var(--t-base); }
  .action-btn:hover:not(:disabled) { color: var(--text-secondary); background: var(--bg-overlay); }
  .action-btn:disabled { opacity: 0.25; cursor: default; }
  .action-btn.remove:hover:not(:disabled) { color: var(--color-error); background: var(--color-error-bg); }
  .action-btn.retry:hover:not(:disabled)  { color: var(--accent-fg); background: var(--accent-muted); }
</style>