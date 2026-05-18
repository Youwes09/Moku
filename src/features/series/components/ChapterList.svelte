<script lang="ts">
  import { Download, CheckCircle, Circle, CircleNotch, Trash } from "phosphor-svelte";
  import ContextMenu from "@shared/ui/ContextMenu.svelte";
  import type { MenuEntry } from "@shared/ui/ContextMenu.svelte";
  import { longPress } from "@core/ui/touchscreen";
  import type { Chapter } from "@types";

  interface Props {
    pageChapters:    Chapter[];
    sortedChapters:  Chapter[];
    viewMode:        "list" | "grid";
    loadingChapters: boolean;
    selectedIds:     Set<number>;
    enqueueing:      Set<number>;
    chapterPage:     number;
    totalPages:      number;
    scrollEl?:       HTMLDivElement | null;
    onOpen:          (ch: Chapter, inProgress: boolean) => void;
    onToggleSelect:  (id: number, e: MouseEvent | KeyboardEvent) => void;
    onEnqueue:       (ch: Chapter, e: MouseEvent) => void;
    onDeleteDownload:(id: number) => void;
    onPageChange:    (page: number) => void;
    buildCtxItems:   (ch: Chapter, idx: number) => MenuEntry[];
  }

  let {
    pageChapters, sortedChapters, viewMode, loadingChapters,
    selectedIds, enqueueing, chapterPage, totalPages,
    scrollEl = $bindable(null),
    onOpen, onToggleSelect, onEnqueue, onDeleteDownload,
    onPageChange, buildCtxItems,
  }: Props = $props();

  let ctx: { x: number; y: number; chapter: Chapter; idx: number } | null = $state(null);

  const hasSelection = $derived(selectedIds.size > 0);

  function chapterLongPress(node: HTMLElement, param: [Chapter, number]) {
    const [ch, idx] = param;
    return longPress(node, {
      onLongPress(e) { ctx = { x: e.clientX, y: e.clientY, chapter: ch, idx }; },
    });
  }

  function formatDate(ts: string | null | undefined): string {
    if (!ts) return "";
    const n = Number(ts);
    const d = new Date(n > 1e10 ? n : n * 1000);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
</script>

<div class={viewMode === "grid" ? "ch-grid" : "ch-list"} bind:this={scrollEl}>
  {#if loadingChapters && sortedChapters.length === 0}
    {#if viewMode === "grid"}
      {#each Array(24) as _}<div class="grid-cell-skeleton skeleton"></div>{/each}
    {:else}
      {#each Array(8) as _}
        <div class="row-skeleton">
          <div class="skeleton sk-line" style="width:55%;height:12px"></div>
          <div class="skeleton sk-line" style="width:25%;height:11px"></div>
        </div>
      {/each}
    {/if}

  {:else if viewMode === "grid"}
    {#each sortedChapters as ch, i}
      {@const inProgress     = !ch.isRead && (ch.lastPageRead ?? 0) > 0}
      {@const isGridSelected = selectedIds.has(ch.id)}
      <button class="grid-cell" class:read={ch.isRead} class:in-progress={inProgress} class:grid-selected={isGridSelected}
        use:chapterLongPress={[ch, i]}
        onclick={(e) => hasSelection ? onToggleSelect(ch.id, e) : onOpen(ch, inProgress)}
        oncontextmenu={(e) => { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, chapter: ch, idx: i }; }}
        title={ch.name}
        >{#if isGridSelected}<span class="grid-cell-check">✓</span>{/if}
        <span class="grid-cell-num">{ch.chapterNumber % 1 === 0 ? ch.chapterNumber.toFixed(0) : ch.chapterNumber}</span>
        {#if ch.isDownloaded}<span class="grid-cell-dl" title="Downloaded"></span>{/if}
        {#if ch.isRead}<span class="grid-cell-dot"></span>{/if}
        {#if enqueueing.has(ch.id)}<span class="grid-cell-spinner"><CircleNotch size={10} weight="light" class="anim-spin" /></span>{/if}
      </button>
    {/each}

  {:else}
    {#each pageChapters as ch}
      {@const idxInSorted  = sortedChapters.indexOf(ch)}
      {@const isSelected   = selectedIds.has(ch.id)}
      {@const chInProgress = !ch.isRead && (ch.lastPageRead ?? 0) > 0}
      <div role="button" tabindex="0" class="ch-row" class:read={ch.isRead} class:ch-selected={isSelected}
        use:chapterLongPress={[ch, idxInSorted]}
        onclick={(e) => hasSelection ? onToggleSelect(ch.id, e) : onOpen(ch, chInProgress)}
        onkeydown={(e) => e.key === "Enter" && (hasSelection ? onToggleSelect(ch.id, e) : onOpen(ch, chInProgress))}
        oncontextmenu={(e) => { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, chapter: ch, idx: idxInSorted }; }}>
        <button class="ch-check" class:ch-check-visible={hasSelection} onclick={(e) => onToggleSelect(ch.id, e)} title="Select">
          {#if isSelected}<CheckCircle size={15} weight="fill" />{:else}<Circle size={15} weight="light" />{/if}
        </button>
        <div class="ch-left">
          <span class="ch-name">{ch.name}</span>
          <div class="ch-meta">
            {#if ch.scanlator}<span class="ch-meta-item">{ch.scanlator}</span>{/if}
            {#if ch.uploadDate}<span class="ch-meta-item">{formatDate(ch.uploadDate)}</span>{/if}
            {#if ch.lastPageRead && ch.lastPageRead > 0 && !ch.isRead}<span class="ch-meta-item">p.{ch.lastPageRead}</span>{/if}
          </div>
        </div>
        <div class="ch-right">
          {#if ch.isRead}<CheckCircle size={14} weight="light" class="read-icon" />{/if}
          {#if ch.isDownloaded}
            <div class="ch-dl-wrap">
              <Download size={13} weight="fill" class="ch-dl-icon" />
              <button class="dl-btn dl-btn-delete" onclick={(e) => { e.stopPropagation(); onDeleteDownload(ch.id); }} title="Delete download"><Trash size={13} weight="light" /></button>
            </div>
          {:else if enqueueing.has(ch.id)}
            <CircleNotch size={14} weight="light" class="anim-spin enqueue-icon" />
          {:else}
            <button class="dl-btn" onclick={(e) => { e.stopPropagation(); onEnqueue(ch, e); }} title="Download"><Download size={13} weight="light" /></button>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

{#if totalPages > 1}
  <div class="pagination-bottom">
    <button class="page-btn" onclick={() => onPageChange(Math.max(1, chapterPage - 1))} disabled={chapterPage === 1}>← Prev</button>
    <span class="page-num">{chapterPage} / {totalPages}</span>
    <button class="page-btn" onclick={() => onPageChange(Math.min(totalPages, chapterPage + 1))} disabled={chapterPage === totalPages}>Next →</button>
  </div>
{/if}

{#if ctx}
  <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.chapter, ctx.idx)} onClose={() => ctx = null} />
{/if}

<style>
  .ch-list { flex: 1; overflow-y: auto; }
  .ch-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 4px; padding: var(--sp-3); align-content: start; }

  .ch-row { display: flex; align-items: center; padding: 10px var(--sp-4); border-bottom: 1px solid var(--border-dim); cursor: pointer; transition: background var(--t-fast); gap: var(--sp-3); }
  .ch-row:hover { background: var(--bg-raised); }
  .ch-row.read { opacity: 0.45; }
  .ch-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .ch-name { font-size: var(--text-sm); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch-meta { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .ch-meta-item { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .ch-right { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
  :global(.read-icon) { color: var(--text-faint); }
  :global(.enqueue-icon) { color: var(--text-faint); }

  .dl-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); transition: color var(--t-base), background var(--t-base); opacity: 0; }
  .ch-row:hover .dl-btn { opacity: 1; }
  .dl-btn:hover { color: var(--text-muted); background: var(--bg-overlay); }
  .dl-btn-delete { color: var(--color-error) !important; opacity: 0; }
  .ch-row:hover .dl-btn-delete { opacity: 1; }
  .dl-btn-delete:hover { background: var(--color-error-bg) !important; }

  .ch-dl-wrap { position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
  :global(.ch-dl-icon) { color: var(--text-faint); transition: opacity var(--t-fast); }
  .ch-row:hover .ch-dl-wrap :global(.ch-dl-icon) { opacity: 0; }
  .ch-dl-wrap .dl-btn-delete { position: absolute; inset: 0; opacity: 0; }
  .ch-row:hover .ch-dl-wrap .dl-btn-delete { opacity: 1; }

  .ch-check { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-faint); cursor: pointer; opacity: 0; transition: opacity var(--t-fast), color var(--t-fast); padding: 0; }
  .ch-row:hover .ch-check { opacity: 1; }
  .ch-check-visible { opacity: 1 !important; }
  .ch-selected { background: color-mix(in srgb, var(--accent) 8%, transparent) !important; }
  .ch-selected .ch-check { color: var(--accent-fg); opacity: 1; }

  .row-skeleton { display: flex; flex-direction: column; gap: var(--sp-2); padding: 12px var(--sp-4); border-bottom: 1px solid var(--border-dim); }

  .grid-cell { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; border-radius: var(--radius-sm); background: var(--bg-raised); border: 1px solid var(--border-dim); font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); cursor: pointer; position: relative; transition: background var(--t-fast), border-color var(--t-fast); }
  .grid-cell:hover { background: var(--bg-overlay); border-color: var(--border-strong); }
  .grid-cell.read { background: var(--color-read); color: var(--text-faint); border-color: transparent; }
  .grid-cell.in-progress { border-color: var(--accent-dim); color: var(--accent-fg); }
  .grid-cell-num { font-size: 10px; }
  .grid-cell-dot { position: absolute; bottom: 3px; right: 3px; width: 4px; height: 4px; border-radius: 50%; background: var(--text-faint); }
  .grid-cell-dl { position: absolute; top: 3px; left: 3px; width: 4px; height: 4px; border-radius: 50%; background: var(--accent-fg); }
  .grid-cell-spinner { position: absolute; top: 2px; right: 2px; }
  .grid-cell-skeleton { aspect-ratio: 1; border-radius: var(--radius-sm); }
  .grid-selected { background: var(--accent-muted) !important; border-color: var(--accent-dim) !important; }
  .grid-cell-check { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--accent-fg); pointer-events: none; }

  .pagination-bottom { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); padding: var(--sp-3); border-top: 1px solid var(--border-dim); flex-shrink: 0; }
  .page-btn { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); color: var(--text-faint); background: none; cursor: pointer; transition: color var(--t-base), border-color var(--t-base); }
  .page-btn:hover:not(:disabled) { color: var(--text-muted); border-color: var(--border-strong); }
  .page-btn:disabled { opacity: 0.3; cursor: default; }
  .page-num { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
</style>