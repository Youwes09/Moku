<script lang="ts">
  import { CircleNotchIcon, ArrowClockwiseIcon, XIcon } from "phosphor-svelte";
  import Thumbnail    from "$lib/components/shared/manga/Thumbnail.svelte";
  import { longPress } from "$lib/core/ui/touchscreen";
  import type { Download } from "$lib/server-adapters/types";
  import { libraryState } from "$lib/state/library.svelte";
  import { pageProgress } from "$lib/components/downloads/lib/downloadQueue";

  interface Props {
    item:       Download;
    isActive:   boolean;
    isRemoving: boolean;
    isSelected: boolean;
    onRemove:   (chapterId: string) => void;
    onRetry:    (chapterId: string) => void;
    onSelect:   (chapterId: string, e: MouseEvent) => void;
  }

  const {
    item, isActive, isRemoving, isSelected,
    onRemove, onRetry, onSelect,
  }: Props = $props();

  const manga   = $derived(libraryState.items.find(m => m.id === item.mediaId) ?? null);
  const pages   = $derived(item.chapter.pageCount ?? 0);
  const prog    = $derived(pageProgress(item.progress, pages));
  const isError = $derived(item.status === "FAILED");
  const pct     = $derived(Math.round(item.progress * 100));

  function rowLongPress(node: HTMLElement) {
    return longPress(node, {
      onLongPress() { onSelect(item.chapterId, { shiftKey: false, ctrlKey: true, metaKey: false } as MouseEvent); },
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
  onclick={(e) => { e.stopPropagation(); onSelect(item.chapterId, e); }}
  onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSelect(item.chapterId, e as unknown as MouseEvent); } }}
>
  {#if manga?.thumbnailUrl}
    <div class="thumb">
      <Thumbnail src={manga.thumbnailUrl} alt={manga.title} class="thumb-img" contentType={manga.contentType} />
    </div>
  {/if}

  <div class="info">
    {#if manga?.title}<span class="manga-title">{manga.title}</span>{/if}
    <span class="chapter-name">{item.chapter.title ?? "Chapter"}</span>
    {#if pages > 0}
      <div class="progress-row">
        <div class="progress-wrap">
          <div class="progress-bar" class:progress-error={isError} style="width:{pct}%"></div>
        </div>
        <span class="pages-label">
          {#if isActive}
            {prog.done}/{prog.total}
          {:else if isError}
            failed
          {:else}
            {prog.total}p
          {/if}
        </span>
      </div>
    {/if}
  </div>

  <div class="row-right">
    <span class="state-label" class:state-error={isError}>{item.status}</span>
    <div class="actions">
      {#if isError}
        <button class="action-btn retry" onclick={(e) => { e.stopPropagation(); onRetry(item.chapterId); }} disabled={isRemoving} title="Retry">
          {#if isRemoving}<CircleNotchIcon size={11} weight="light" class="anim-spin" />{:else}<ArrowClockwiseIcon size={11} weight="bold" />{/if}
        </button>
      {/if}
      {#if !isActive}
        <button class="action-btn remove" onclick={(e) => { e.stopPropagation(); onRemove(item.chapterId); }} disabled={isRemoving} title="Remove">
          {#if isRemoving}<CircleNotchIcon size={11} weight="light" class="anim-spin" />{:else}<XIcon size={12} weight="light" />{/if}
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .row {
    display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3);
    background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md);
    transition: border-color var(--t-fast), opacity var(--t-base), background var(--t-fast);
    cursor: default; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  }
  .row:hover:not(.row-active):not(.row-removing) { border-color: var(--border-strong); background: var(--bg-elevated); }
  .row.row-active   { background: color-mix(in srgb, var(--accent) 6%, var(--bg-raised)); border-color: var(--accent-dim); }
  .row.row-error    { border-color: color-mix(in srgb, var(--color-error) 30%, transparent); }
  .row.row-selected { background: color-mix(in srgb, var(--accent) 8%, transparent); border-color: var(--accent-dim); }
  .row.row-removing { opacity: 0.4; pointer-events: none; }

  .thumb { width: 36px; height: 54px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-overlay); flex-shrink: 0; border: 1px solid var(--border-dim); }
  :global(.thumb-img) { width: 100%; height: 100%; object-fit: cover; }

  .info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; min-width: 0; }
  .manga-title  { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chapter-name { font-size: var(--text-xs); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .progress-row  { display: flex; align-items: center; gap: var(--sp-2); }
  .progress-wrap { flex: 1; height: 2px; background: var(--border-base); border-radius: var(--radius-full); overflow: hidden; }
  .progress-bar  { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.4s ease; opacity: 0.35; }
  .row-active .progress-bar { opacity: 1; }
  .progress-bar.progress-error { background: var(--color-error); opacity: 0.7; }
  .pages-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); flex-shrink: 0; white-space: nowrap; }
  .row-active .pages-label { color: var(--accent-fg); opacity: 0.8; }

  .row-right  { display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-1); flex-shrink: 0; }
  .state-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .row-active .state-label { color: var(--accent-fg); opacity: 0.8; }
  .state-label.state-error { color: var(--color-error); opacity: 0.8; }

  .actions    { display: flex; align-items: center; gap: 2px; }
  .action-btn { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base), background var(--t-base); }
  .action-btn:hover:not(:disabled) { color: var(--text-secondary); background: var(--bg-overlay); }
  .action-btn:disabled { opacity: 0.25; cursor: default; }
  .action-btn.remove:hover:not(:disabled) { color: var(--color-error); background: var(--color-error-bg); }
  .action-btn.retry:hover:not(:disabled)  { color: var(--accent-fg);   background: var(--accent-muted); }
</style>
