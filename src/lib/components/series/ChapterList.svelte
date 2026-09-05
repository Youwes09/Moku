<script lang="ts">
  import { Download, CheckSquare, Square, CircleNotch, Trash } from 'phosphor-svelte'
  import ContextMenu from '$lib/components/shared/ui/ContextMenu.svelte'
  import type { MenuEntry } from '$lib/components/shared/ui/ContextMenu.svelte'
  import { longPress } from '$lib/core/ui/touchscreen'
  import type { Chapter } from '$lib/types'

  interface Props {
    sortedChapters:  Chapter[]
    viewMode:        'list' | 'grid'
    loadingChapters: boolean
    selectedIds:     Set<string>
    enqueueing:      Set<string>
    isLocal?:        boolean
    onOpen:          (ch: Chapter, inProgress: boolean) => void
    onToggleSelect:  (id: string, e: MouseEvent | KeyboardEvent) => void
    onEnqueue:       (ch: Chapter, e: MouseEvent) => void
    onDeleteDownload:(id: string) => void
    buildCtxItems:   (ch: Chapter, idx: number) => MenuEntry[]
  }

  let {
    sortedChapters, viewMode, loadingChapters,
    selectedIds, enqueueing, isLocal = false,
    onOpen, onToggleSelect, onEnqueue, onDeleteDownload,
    buildCtxItems,
  }: Props = $props()

  let ctx: { x: number; y: number; chapter: Chapter; idx: number } | null = $state(null)
  let listEl: HTMLDivElement | null = $state(null)

  const hasSelection = $derived(selectedIds.size > 0)

  const LIST_ROW_H = 49
  const GRID_PAD   = 12
  const GRID_GAP   = 4
  const GRID_MIN   = 42
  const OVERSCAN   = 6

  let scrollTop = $state(0)
  let viewH     = $state(0)
  let listW     = $state(0)
  let rafPending = false

  function onScroll() {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      if (listEl) scrollTop = listEl.scrollTop
    })
  }

  $effect(() => {
    if (!listEl) return
    const ro = new ResizeObserver(() => {
      if (!listEl) return
      viewH = listEl.clientHeight
      listW = listEl.clientWidth
    })
    ro.observe(listEl)
    viewH = listEl.clientHeight
    listW = listEl.clientWidth
    return () => ro.disconnect()
  })

  const gridCols = $derived(
    viewMode === 'grid' && listW > 0
      ? Math.max(1, Math.floor((listW - 2 * GRID_PAD + GRID_GAP) / (GRID_MIN + GRID_GAP)))
      : 1
  )
  const gridRowH = $derived(
    viewMode === 'grid' && gridCols > 0
      ? (listW - 2 * GRID_PAD - (gridCols - 1) * GRID_GAP) / gridCols + GRID_GAP
      : LIST_ROW_H
  )

  const perRow = $derived(viewMode === 'grid' ? gridCols : 1)
  const rowH   = $derived(viewMode === 'grid' ? gridRowH : LIST_ROW_H)
  const totalRows = $derived(Math.ceil(sortedChapters.length / perRow))

  const firstRow = $derived(Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN))
  const lastRow  = $derived(Math.min(totalRows, firstRow + Math.ceil((viewH || 800) / rowH) + OVERSCAN * 2))

  const firstIdx = $derived(firstRow * perRow)
  const lastIdx  = $derived(Math.min(sortedChapters.length, lastRow * perRow))
  const windowItems = $derived(sortedChapters.slice(firstIdx, lastIdx))

  const padTop    = $derived(firstRow * rowH)
  const padBottom = $derived(Math.max(0, (totalRows - lastRow) * rowH))

  export function scrollToChapter(id: string) {
    const idx = sortedChapters.findIndex(c => c.id === id)
    if (idx < 0 || !listEl) return
    const row = Math.floor(idx / perRow)
    listEl.scrollTop = Math.max(0, row * rowH - (viewH || listEl.clientHeight) / 2)
  }

  function chapterLongPress(node: HTMLElement, param: [Chapter, number]) {
    const [ch, idx] = param
    return longPress(node, {
      onLongPress(e) { ctx = { x: e.clientX, y: e.clientY, chapter: ch, idx } },
    })
  }

  function formatDate(ts: string | null | undefined): string {
    if (!ts) return ''
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }
</script>

<div class="ch-scroll" class:ch-scroll-grid={viewMode === 'grid'} bind:this={listEl} onscroll={onScroll}>
  {#if loadingChapters && sortedChapters.length === 0}
    {#if viewMode === 'grid'}
      <div class="ch-grid-inner">
        {#each Array(24) as _}<div class="grid-cell-skeleton skeleton"></div>{/each}
      </div>
    {:else}
      {#each Array(8) as _}
        <div class="row-skeleton">
          <div class="skeleton sk-line" style="width:55%;height:12px"></div>
          <div class="skeleton sk-line" style="width:25%;height:11px"></div>
        </div>
      {/each}
    {/if}

  {:else}
    <div style="height:{padTop}px" aria-hidden="true"></div>

    {#if viewMode === 'grid'}
      <div class="ch-grid-inner">
        {#each windowItems as ch, li (ch.id)}
          {@const i = firstIdx + li}
          {@const isGridSelected = selectedIds.has(ch.id)}
          <button
            id={'ch-' + ch.id}
            class="grid-cell"
            class:read={ch.read}
            class:grid-selected={isGridSelected}
            use:chapterLongPress={[ch, i]}
            onclick={(e) => hasSelection ? onToggleSelect(ch.id, e) : onOpen(ch, !ch.read && (ch.lastPageRead ?? 0) > 0)}
            oncontextmenu={(e) => { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, chapter: ch, idx: i } }}
            title={ch.scanlator ? `${ch.name} · ${ch.scanlator}` : ch.name}
          >
            {#if isGridSelected}<span class="grid-cell-check">✓</span>{/if}
            <span class="grid-cell-num">{ch.chapterNumber < 0 ? '–' : ch.chapterNumber % 1 === 0 ? ch.chapterNumber.toFixed(0) : ch.chapterNumber.toFixed(1)}</span>
            {#if ch.scanlator}<span class="grid-cell-scan" title={ch.scanlator}>{ch.scanlator}</span>{/if}
            {#if ch.downloaded}<span class="grid-cell-dl" title="Downloaded"></span>{/if}
            {#if ch.read}<span class="grid-cell-dot"></span>{/if}
            {#if enqueueing.has(ch.id)}<span class="grid-cell-spinner"><CircleNotch size={10} weight="light" class="anim-spin" /></span>{/if}
          </button>
        {/each}
      </div>

    {:else}
      {#each windowItems as ch, li (ch.id)}
        {@const idxInSorted = firstIdx + li}
        {@const isSelected   = selectedIds.has(ch.id)}
        {@const chInProgress = !ch.read && (ch.lastPageRead ?? 0) > 0}
        <div
          id={'ch-' + ch.id}
          role="button"
          tabindex="0"
          class="ch-row"
          class:read={ch.read}
          class:ch-selected={isSelected}
          use:chapterLongPress={[ch, idxInSorted]}
          onclick={(e) => hasSelection ? onToggleSelect(ch.id, e) : onOpen(ch, chInProgress)}
          onkeydown={(e) => e.key === 'Enter' && (hasSelection ? onToggleSelect(ch.id, e) : onOpen(ch, chInProgress))}
          oncontextmenu={(e) => { e.preventDefault(); ctx = { x: e.clientX, y: e.clientY, chapter: ch, idx: idxInSorted } }}
        >
          <button class="ch-check" class:ch-check-visible={hasSelection} onclick={(e) => onToggleSelect(ch.id, e)} title="Select">
            {#if isSelected}<CheckSquare size={15} weight="fill" />{:else}<Square size={15} weight="light" />{/if}
          </button>
          <div class="ch-left">
            <span class="ch-name">
              {#if ch.scanlator}<span class="ch-scan">{ch.scanlator}</span>{/if}{ch.name}
            </span>
            <div class="ch-meta">
              {#if ch.uploadDate}<span class="ch-meta-item">{formatDate(ch.uploadDate)}</span>{/if}
              {#if ch.lastPageRead && ch.lastPageRead > 0 && !ch.read}<span class="ch-meta-item">p.{ch.lastPageRead}</span>{/if}
            </div>
          </div>
          <div class="ch-right">
            {#if ch.read}<CheckSquare size={14} weight="light" class="read-icon" />{/if}
            {#if isLocal}
              {#if ch.downloaded}<Download size={13} weight="fill" class="ch-dl-icon" />{/if}
            {:else if ch.downloaded}
              <div class="ch-dl-wrap">
                <Download size={13} weight="fill" class="ch-dl-icon" />
                <button class="dl-btn dl-btn-delete" onclick={(e) => { e.stopPropagation(); onDeleteDownload(ch.id) }} title="Delete download">
                  <Trash size={13} weight="light" />
                </button>
              </div>
            {:else if enqueueing.has(ch.id)}
              <CircleNotch size={14} weight="light" class="anim-spin enqueue-icon" />
            {:else}
              <button class="dl-btn" onclick={(e) => { e.stopPropagation(); onEnqueue(ch, e) }} title="Download">
                <Download size={13} weight="light" />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}

    <div style="height:{padBottom}px" aria-hidden="true"></div>
  {/if}
</div>

{#if ctx}
  <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.chapter, ctx.idx)} onClose={() => ctx = null} />
{/if}

<style>
  .ch-scroll { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
  .ch-scroll-grid { padding-top: var(--sp-3); }
  .ch-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
  .ch-scroll::-webkit-scrollbar-track { background: transparent; }
  .ch-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 99px; }
  .ch-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-faint); }

  .ch-grid-inner { display: grid; grid-template-columns: repeat(auto-fill, minmax(42px, 1fr)); gap: 4px; padding: 0 var(--sp-3); align-content: start; }

  .ch-row { display: flex; align-items: center; padding: 8px var(--sp-4); border-bottom: 1px solid var(--border-dim); cursor: pointer; transition: background var(--t-fast); gap: var(--sp-3); }
  .ch-row:hover { background: var(--bg-raised); }
  .ch-row.read { opacity: 0.5; }
  .ch-left  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ch-name  { font-size: var(--text-sm); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch-scan {
    display: inline-block; margin-right: var(--sp-2);
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 1px 5px; border-radius: var(--radius-sm);
    background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim);
    vertical-align: 1px;
  }
  .ch-meta  { display: flex; align-items: center; gap: var(--sp-2); }
  .ch-meta-item { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .ch-right { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
  :global(.read-icon)    { color: var(--text-faint); }
  :global(.enqueue-icon) { color: var(--text-faint); }

  .dl-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); transition: color var(--t-base), background var(--t-base); }
  .dl-btn:hover { color: var(--text-muted); background: var(--bg-overlay); }
  .dl-btn-delete { color: var(--color-error) !important; }
  .dl-btn-delete:hover { background: var(--color-error-bg) !important; }

  .ch-dl-wrap { display: flex; align-items: center; gap: var(--sp-1); }
  :global(.ch-dl-icon) { color: var(--text-faint); }

  .ch-check {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; flex-shrink: 0;
    border-radius: var(--radius-sm); border: none; background: none;
    color: var(--text-faint); cursor: pointer; padding: 0;
    opacity: 0;
    transform: translateX(-6px);
    transition: opacity var(--t-fast), transform var(--t-fast), color var(--t-fast);
    margin-right: -20px;
  }
  .ch-row:hover .ch-check { opacity: 1; transform: translateX(0); margin-right: 0; }
  .ch-check-visible { opacity: 1 !important; transform: translateX(0) !important; margin-right: 0 !important; }
  .ch-selected .ch-check { color: var(--accent-fg); }
  .ch-selected { background: color-mix(in srgb, var(--accent) 8%, transparent) !important; }

  .row-skeleton { display: flex; flex-direction: column; gap: var(--sp-2); padding: 12px var(--sp-4); border-bottom: 1px solid var(--border-dim); }

  .grid-cell { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; border-radius: var(--radius-sm); background: var(--bg-raised); border: 1px solid var(--border-dim); font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); cursor: pointer; position: relative; transition: background var(--t-fast), border-color var(--t-fast); }
  .grid-cell:hover { background: var(--bg-overlay); border-color: var(--border-strong); }
  .grid-cell.read { background: var(--color-read); color: var(--text-faint); border-color: transparent; }
  .grid-cell-num { font-size: 10px; }
  .grid-cell-scan { position: absolute; bottom: 2px; left: 0; right: 0; text-align: center; font-family: var(--font-ui); font-size: 7px; letter-spacing: 0.02em; color: var(--accent-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px; }
  .grid-cell-dot { position: absolute; bottom: 3px; right: 3px; width: 4px; height: 4px; border-radius: var(--radius-sm); background: var(--text-faint); }
  .grid-cell-dl  { position: absolute; top: 3px; left: 3px; width: 4px; height: 4px; border-radius: var(--radius-sm); background: var(--accent-fg); }
  .grid-cell-spinner { position: absolute; top: 2px; right: 2px; }
  .grid-cell-skeleton { aspect-ratio: 1; border-radius: var(--radius-sm); }
  .grid-selected { background: var(--accent-muted) !important; border-color: var(--accent-dim) !important; }
  .grid-cell-check { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; color: var(--accent-fg); pointer-events: none; }
</style>
