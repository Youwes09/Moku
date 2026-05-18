<script lang="ts">
  import {
    Download, CheckCircle, Circle, SortAscending, SortDescending,
    CaretDown, ArrowsClockwise, List, SquaresFour, FolderSimplePlus,
    Trash, DownloadSimple, X, MagnifyingGlass, Funnel, Check,
  } from "phosphor-svelte";
  import type { Chapter, Category } from "@types";
  import type { ChapterSortMode, ChapterSortDir } from "../lib/chapterList";
  import { updateSettings } from "@store/state.svelte";

  interface ContinueChapter {
    chapter:    Chapter;
    type:       "start" | "continue" | "reread";
    resumePage: number | null;
  }

  interface Props {
    chapters:             Chapter[];
    sortedChapters:       Chapter[];
    sortMode:             ChapterSortMode;
    sortDir:              ChapterSortDir;
    viewMode:             "list" | "grid";
    chapterPage:          number;
    totalPages:           number;
    downloadedCount:      number;
    totalCount:           number;
    deletingAll:          boolean;
    hasSelection:         boolean;
    selectedCount:        number;
    continueChapter:      ContinueChapter | null;
    availableScanlators:  string[];
    scanlatorFilter:      string[];
    scanlatorBlacklist:   string[];
    scanlatorForce:       boolean;
    allCategories:        Category[];
    mangaCategories:      Category[];
    catsLoading:          boolean;
    onViewModeToggle:     () => void;
    onPageChange:         (page: number) => void;
    onDownloadSelected:   () => void;
    onDeleteSelected:     () => void;
    onMarkSelectedRead:   (isRead: boolean) => void;
    onClearSelection:     () => void;
    onEnqueueNext:        (n: number) => void;
    onEnqueueMultiple:    (ids: number[]) => void;
    onDeleteAll:          () => void;
    onRefresh:            () => void;
    onToggleCategory:     (cat: Category) => void;
    onCreateCategory:     (name: string) => void;
    onSetScanlatorFilter: (v: string[]) => void;
    onSetScanlatorBlacklist: (v: string[]) => void;
    onSetScanlatorForce:  (v: boolean) => void;
    refreshing:           boolean;
  }

  let {
    chapters, sortedChapters, sortMode, sortDir, viewMode,
    chapterPage, totalPages, downloadedCount, totalCount, deletingAll,
    hasSelection, selectedCount, continueChapter,
    availableScanlators, scanlatorFilter, scanlatorBlacklist, scanlatorForce,
    allCategories, mangaCategories, catsLoading,
    onViewModeToggle, onPageChange, onDownloadSelected, onDeleteSelected,
    onMarkSelectedRead, onClearSelection, onEnqueueNext, onEnqueueMultiple,
    onDeleteAll, onRefresh, onToggleCategory, onCreateCategory,
    onSetScanlatorFilter, onSetScanlatorBlacklist, onSetScanlatorForce,
    refreshing,
  }: Props = $props();

  let sortMenuOpen:   boolean = $state(false);
  let jumpOpen:       boolean = $state(false);
  let jumpInput:      string  = $state("");
  let scanFilterOpen: boolean = $state(false);
  let scanTab: "prefer" | "block" = $state("prefer");
  let dlOpen:         boolean = $state(false);
  let showRange:      boolean = $state(false);
  let rangeFrom:      string  = $state("");
  let rangeTo:        string  = $state("");
  let folderPickerOpen: boolean = $state(false);
  let folderCreating:   boolean = $state(false);
  let folderNewName:    string  = $state("");
  let dlDropRef:        HTMLDivElement | undefined = $state();
  let folderPickerRef:  HTMLDivElement | undefined = $state();

  const hasFolders      = $derived(mangaCategories.filter(c => c.id !== 0).length > 0);

  const jumpChapter = $derived.by(() => {
    const q = jumpInput.trim().toLowerCase();
    if (!q) return null;
    const num = parseFloat(q);
    if (!isNaN(num)) return sortedChapters.find(c => c.chapterNumber === num) ?? null;
    return sortedChapters.find(c => c.name.toLowerCase().includes(q)) ?? null;
  });

  function focusOnMount(node: HTMLElement) { node.focus(); }

  function doJump() {
    if (!jumpChapter) return;
    const pageIdx = sortedChapters.indexOf(jumpChapter);
    if (pageIdx >= 0) onPageChange(Math.floor(pageIdx / 25) + 1);
    jumpOpen = false; jumpInput = "";
  }

  function enqueueRange() {
    const from = parseFloat(rangeFrom), to = parseFloat(rangeTo);
    if (isNaN(from) || isNaN(to)) return;
    const lo = Math.min(from, to), hi = Math.max(from, to);
    onEnqueueMultiple(sortedChapters.filter(c => c.chapterNumber >= lo && c.chapterNumber <= hi && !c.isDownloaded).map(c => c.id));
  }

  function submitNewFolder() {
    const name = folderNewName.trim();
    if (!name) return;
    onCreateCategory(name);
    folderNewName = ""; folderCreating = false;
  }

  $effect(() => {
    if (dlOpen) { setTimeout(() => document.addEventListener("mousedown", handleDlOutside, true), 0); }
    else document.removeEventListener("mousedown", handleDlOutside, true);
  });
  $effect(() => {
    if (folderPickerOpen) { setTimeout(() => document.addEventListener("mousedown", handleFolderOutside, true), 0); }
    else document.removeEventListener("mousedown", handleFolderOutside, true);
  });
  $effect(() => {
    if (!scanFilterOpen) return;
    function onOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".scan-filter-wrap")) scanFilterOpen = false;
    }
    setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    return () => document.removeEventListener("mousedown", onOutside, true);
  });

  function handleDlOutside(e: MouseEvent)     { if (dlDropRef     && !dlDropRef.contains(e.target as Node))     dlOpen = false; }
  function handleFolderOutside(e: MouseEvent) { if (folderPickerRef && !folderPickerRef.contains(e.target as Node)) { folderPickerOpen = false; folderCreating = false; folderNewName = ""; } }
</script>

<div class="list-header">
  <div class="list-header-left">
    {#if hasSelection}
      <span class="sel-count">{selectedCount} selected</span>
      <button class="sel-action-btn" onclick={onDownloadSelected} title="Download selected"><Download size={13} weight="light" /></button>
      <button class="sel-action-btn sel-action-danger" onclick={onDeleteSelected} title="Delete selected downloads"><Trash size={13} weight="light" /></button>
      <button class="sel-action-btn" onclick={() => onMarkSelectedRead(true)} title="Mark selected as read"><CheckCircle size={13} weight="light" /></button>
      <button class="sel-action-btn" onclick={() => onMarkSelectedRead(false)} title="Mark selected as unread"><Circle size={13} weight="light" /></button>
      <button class="sel-action-btn" onclick={onClearSelection} title="Clear selection"><X size={13} weight="light" /></button>
    {:else}
      <div class="sort-wrap">
        <button class="sort-btn" onclick={() => sortMenuOpen = !sortMenuOpen}>
          {#if sortDir === "desc"}<SortDescending size={14} weight="light" />{:else}<SortAscending size={14} weight="light" />{/if}
          {{ source: "Source order", chapterNumber: "Ch. number", uploadDate: "Upload date" }[sortMode]}
          <CaretDown size={10} weight="light" />
        </button>
        {#if sortMenuOpen}
          <div class="sort-menu" role="presentation" onmouseleave={() => sortMenuOpen = false}>
            {#each [["source","Source order"],["chapterNumber","Chapter number"],["uploadDate","Upload date"]] as [val, label]}
              <button class="sort-option" class:active={sortMode === val}
                onclick={() => { updateSettings({ chapterSortMode: val as any }); onPageChange(1); sortMenuOpen = false; }}>
                {label}
              </button>
            {/each}
            <div class="sort-divider"></div>
            <button class="sort-option" onclick={() => { updateSettings({ chapterSortDir: sortDir === "desc" ? "asc" : "desc" }); onPageChange(1); sortMenuOpen = false; }}>
              {sortDir === "desc" ? "↑ Ascending" : "↓ Descending"}
            </button>
          </div>
        {/if}
      </div>
      <button class="icon-btn" class:active={viewMode === "grid"} onclick={onViewModeToggle} title={viewMode === "list" ? "Grid view" : "List view"}>
        {#if viewMode === "list"}<SquaresFour size={14} weight="light" />{:else}<List size={14} weight="light" />{/if}
      </button>
    {/if}
  </div>

  <div class="list-header-right">

    <div class="jump-wrap">
      <button class="icon-btn" class:active={jumpOpen} onclick={() => { jumpOpen = !jumpOpen; jumpInput = ""; }} title="Jump to chapter">
        <MagnifyingGlass size={14} weight="light" />
      </button>
      {#if jumpOpen}
        <div class="jump-popover">
          <input class="jump-input" placeholder="Chapter # or name…" bind:value={jumpInput} use:focusOnMount
            onkeydown={(e) => { if (e.key === "Enter") doJump(); if (e.key === "Escape") { jumpOpen = false; jumpInput = ""; } }} />
          {#if jumpChapter}
            <button class="jump-go" onclick={doJump}>Go · {jumpChapter.name}</button>
          {:else if jumpInput.trim()}
            <p class="jump-none">No match</p>
          {/if}
        </div>
      {/if}
    </div>


    {#if availableScanlators.length > 1}
      <div class="scan-filter-wrap">
        <button class="icon-btn" class:active={scanlatorFilter.length > 0 || scanlatorBlacklist.length > 0} onclick={() => scanFilterOpen = !scanFilterOpen} title="Filter by scanlator">
          <Funnel size={14} weight={scanlatorFilter.length > 0 || scanlatorBlacklist.length > 0 ? "fill" : "light"} />
        </button>
        {#if scanFilterOpen}
          <div class="scan-filter-panel" role="menu">
            <div class="scan-filter-header">
              <div class="scan-filter-tabs">
                <button class="scan-filter-tab" class:scan-filter-tab-active={scanTab === "prefer"} onclick={() => scanTab = "prefer"}>Prefer</button>
                <button class="scan-filter-tab" class:scan-filter-tab-active={scanTab === "block"}  onclick={() => scanTab = "block"}>Block</button>
              </div>
              {#if scanTab === "prefer" && scanlatorFilter.length > 0}
                <button class="scan-filter-clear" onclick={() => { onSetScanlatorFilter([]); onSetScanlatorForce(false); onPageChange(1); }}>Clear</button>
              {:else if scanTab === "block" && scanlatorBlacklist.length > 0}
                <button class="scan-filter-clear" onclick={() => { onSetScanlatorBlacklist([]); onPageChange(1); }}>Clear</button>
              {/if}
            </div>
            <div class="scan-filter-divider"></div>
            {#if scanTab === "prefer"}
              <div class="scan-filter-force-row">
                <span class="scan-filter-force-label" title="Hide chapters with no preferred group match, rather than falling back to any available group.">Enforce</span>
                <button class="scan-force-toggle" class:scan-force-on={scanlatorForce}
                  onclick={() => { onSetScanlatorForce(!scanlatorForce); onPageChange(1); }}>
                  {scanlatorForce ? "On" : "Off"}
                </button>
              </div>
              <div class="scan-filter-divider"></div>
              {#each availableScanlators as s}
                <button class="scan-filter-item" class:scan-filter-item-active={scanlatorFilter.includes(s)} role="menuitem"
                  onclick={() => { onSetScanlatorFilter(scanlatorFilter.includes(s) ? scanlatorFilter.filter(x => x !== s) : [...scanlatorFilter, s]); onPageChange(1); }}>
                  <span class="scan-filter-check" class:scan-filter-check-on={scanlatorFilter.includes(s)}>
                    {#if scanlatorFilter.includes(s)}<Check size={9} weight="bold" />{/if}
                  </span>
                  {s}
                </button>
              {/each}
            {:else}
              {#each availableScanlators as s}
                <button class="scan-filter-item" class:scan-filter-item-active={scanlatorBlacklist.includes(s)} class:scan-filter-item-block={scanlatorBlacklist.includes(s)} role="menuitem"
                  onclick={() => { onSetScanlatorBlacklist(scanlatorBlacklist.includes(s) ? scanlatorBlacklist.filter(x => x !== s) : [...scanlatorBlacklist, s]); onPageChange(1); }}>
                  <span class="scan-filter-check" class:scan-filter-check-block={scanlatorBlacklist.includes(s)}>
                    {#if scanlatorBlacklist.includes(s)}<X size={9} weight="bold" />{/if}
                  </span>
                  {s}
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
    {/if}


    <button class="icon-btn" onclick={onRefresh} disabled={refreshing}>
      <ArrowsClockwise size={14} weight="light" class={refreshing ? "anim-spin" : ""} />
    </button>


    <div class="fp-wrap" bind:this={folderPickerRef}>
      <button class="icon-btn" class:active={hasFolders} onclick={() => folderPickerOpen = !folderPickerOpen}>
        <FolderSimplePlus size={14} weight={hasFolders ? "fill" : "light"} />
      </button>
      {#if folderPickerOpen}
        <div class="fp-menu">
          {#if catsLoading}
            <p class="fp-empty">Loading…</p>
          {:else if allCategories.length === 0 && !folderCreating}
            <p class="fp-empty">No folders yet</p>
          {/if}
          {#each allCategories as cat}
            {@const isIn = mangaCategories.some(c => c.id === cat.id)}
            <button class="fp-item" class:fp-item-active={isIn} onclick={() => onToggleCategory(cat)}>
              <span class="fp-check">{isIn ? "✓" : ""}</span>{cat.name}
            </button>
          {/each}
          <div class="fp-div"></div>
          {#if folderCreating}
            <div class="fp-create">
              <input class="fp-input" placeholder="Folder name…" bind:value={folderNewName} use:focusOnMount
                onkeydown={(e) => { if (e.key === "Enter") submitNewFolder(); if (e.key === "Escape") { folderCreating = false; folderNewName = ""; } }} />
              <button class="fp-confirm" onclick={submitNewFolder} disabled={!folderNewName.trim()}>Add</button>
              <button class="fp-cancel" onclick={() => { folderCreating = false; folderNewName = ""; }}><X size={12} weight="light" /></button>
            </div>
          {:else}
            <button class="fp-new" onclick={() => folderCreating = true}>+ New folder</button>
          {/if}
        </div>
      {/if}
    </div>


    {#if chapters.length > 0}
      <div class="dl-wrap" bind:this={dlDropRef}>
        <button class="icon-btn dl-unified-btn" class:active={dlOpen} class:dl-has-count={downloadedCount > 0} onclick={() => dlOpen = !dlOpen} title="Download options">
          <Download size={13} weight={downloadedCount > 0 ? "fill" : "light"} />
          {#if downloadedCount > 0}<span class="dl-unified-count">{downloadedCount}</span>{/if}
        </button>
        {#if dlOpen}
          <div class="dl-dropdown">
            {#if downloadedCount > 0}
              <p class="dl-section-label">{downloadedCount} / {totalCount} downloaded</p>
              <div class="dl-divider"></div>
            {/if}
            {#if continueChapter}
              {@const contIdx = sortedChapters.indexOf(continueChapter.chapter)}
              {#if contIdx >= 0}
                <p class="dl-section-label">From Ch.{continueChapter.chapter.chapterNumber}</p>
                <div class="dl-next-row">
                  {#each [5, 10, 25] as n}
                    {@const avail = sortedChapters.slice(contIdx, contIdx + n).filter(c => !c.isDownloaded).length}
                    <button class="dl-next-btn" disabled={avail === 0} onclick={() => { onEnqueueNext(n); dlOpen = false; }}>
                      <span>Next {n}</span><span class="dl-next-sub">{avail} new</span>
                    </button>
                  {/each}
                </div>
                <div class="dl-divider"></div>
              {/if}
            {/if}
            {#if !showRange}
              <button class="dl-item" onclick={() => showRange = true}>
                <span>Custom range…</span><span class="dl-item-sub">Enter chapter numbers</span>
              </button>
            {:else}
              <div class="dl-range-row">
                <button class="dl-range-back" onclick={() => showRange = false}>‹</button>
                <input class="dl-range-input" placeholder="From" bind:value={rangeFrom} onkeydown={(e) => e.key === "Enter" && enqueueRange()} use:focusOnMount />
                <span class="dl-range-sep">–</span>
                <input class="dl-range-input" placeholder="To" bind:value={rangeTo} onkeydown={(e) => e.key === "Enter" && enqueueRange()} />
                <button class="dl-range-go" disabled={!rangeFrom.trim() || !rangeTo.trim()} onclick={enqueueRange}>Go</button>
              </div>
            {/if}
            <div class="dl-divider"></div>
            <button class="dl-item" onclick={() => { onEnqueueMultiple(sortedChapters.filter(c => !c.isRead && !c.isDownloaded).map(c => c.id)); dlOpen = false; }}>
              <span>Unread chapters</span><span class="dl-item-sub">{sortedChapters.filter(c => !c.isRead && !c.isDownloaded).length} remaining</span>
            </button>
            <button class="dl-item" onclick={() => { onEnqueueMultiple(sortedChapters.filter(c => !c.isDownloaded).map(c => c.id)); dlOpen = false; }}>
              <span>Download all</span><span class="dl-item-sub">{sortedChapters.filter(c => !c.isDownloaded).length} not downloaded</span>
            </button>
            {#if downloadedCount > 0}
              <div class="dl-divider"></div>
              <button class="dl-item dl-item-danger" onclick={() => { onDeleteAll(); dlOpen = false; }} disabled={deletingAll}>
                <span>{deletingAll ? "Deleting…" : "Delete all downloads"}</span>
                <span class="dl-item-sub">{downloadedCount} downloaded</span>
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}


    {#if totalPages > 1}
      <div class="pagination">
        <button class="page-btn" onclick={() => onPageChange(Math.max(1, chapterPage - 1))} disabled={chapterPage === 1}>←</button>
        <span class="page-num">{chapterPage} / {totalPages}</span>
        <button class="page-btn" onclick={() => onPageChange(Math.min(totalPages, chapterPage + 1))} disabled={chapterPage === totalPages}>→</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .list-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0; gap: var(--sp-2); flex-wrap: wrap;
  }
  .list-header-left,
  .list-header-right { display: flex; align-items: center; gap: var(--sp-1); }

  .sort-btn {
    display: flex; align-items: center; gap: 5px;
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 4px var(--sp-2); border-radius: var(--radius-sm);
    color: var(--text-muted); transition: color var(--t-base), background var(--t-base);
  }
  .sort-btn:hover { color: var(--text-secondary); background: var(--bg-raised); }
  .sort-wrap { position: relative; }
  .sort-menu {
    position: absolute; top: calc(100% + 4px); left: 0; min-width: 160px;
    background: var(--bg-raised); border: 1px solid var(--border-base);
    border-radius: var(--radius-md); padding: var(--sp-1); z-index: 200;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    animation: scaleIn 0.1s ease both; transform-origin: top left;
  }
  .sort-option {
    display: block; width: 100%; padding: 6px var(--sp-3); border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary);
    background: none; border: none; cursor: pointer; text-align: left;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .sort-option:hover { background: var(--bg-overlay); color: var(--text-primary); }
  .sort-option.active { color: var(--accent-fg); }
  .sort-divider { height: 1px; background: var(--border-dim); margin: var(--sp-1) var(--sp-2); }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--radius-md);
    border: 1px solid var(--border-dim); color: var(--text-muted);
    background: none; cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .icon-btn:hover:not(:disabled) { color: var(--text-secondary); border-color: var(--border-strong); background: var(--bg-raised); }
  .icon-btn.active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .icon-btn:disabled { opacity: 0.3; cursor: default; }

  .jump-wrap { position: relative; }
  .jump-popover {
    position: absolute; top: calc(100% + 4px); right: 0; width: 220px;
    background: var(--bg-raised); border: 1px solid var(--border-base);
    border-radius: var(--radius-md); padding: var(--sp-2); z-index: 200;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    animation: scaleIn 0.1s ease both; transform-origin: top right;
    display: flex; flex-direction: column; gap: var(--sp-1);
  }
  .jump-input {
    width: 100%; background: var(--bg-overlay); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); padding: 5px 9px;
    font-size: var(--text-xs); color: var(--text-secondary); outline: none;
    transition: border-color var(--t-base);
  }
  .jump-input:focus { border-color: var(--border-focus); }
  .jump-go {
    width: 100%; padding: 6px var(--sp-2); border-radius: var(--radius-sm);
    background: var(--accent-muted); border: 1px solid var(--accent-dim); color: var(--accent-fg);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    cursor: pointer; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: background var(--t-fast), border-color var(--t-fast);
  }
  .jump-go:hover { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast, #fff); }
  .jump-none { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); padding: 4px var(--sp-1); letter-spacing: var(--tracking-wide); }

  .fp-wrap { position: relative; }
  .fp-menu {
    position: absolute; top: calc(100% + 4px); right: 0; min-width: 180px;
    background: var(--bg-raised); border: 1px solid var(--border-base);
    border-radius: var(--radius-md); padding: var(--sp-1); z-index: 200;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    animation: scaleIn 0.1s ease both; transform-origin: top right;
  }
  .fp-empty { padding: var(--sp-2) var(--sp-3); font-size: var(--text-xs); color: var(--text-faint); }
  .fp-item {
    display: flex; align-items: center; gap: var(--sp-2); width: 100%;
    padding: 6px var(--sp-3); border-radius: var(--radius-sm); font-size: var(--text-xs);
    color: var(--text-secondary); background: none; border: none; cursor: pointer; text-align: left;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .fp-item:hover { background: var(--bg-overlay); }
  .fp-item.fp-item-active { color: var(--accent-fg); }
  .fp-check { width: 12px; font-size: var(--text-xs); color: var(--accent-fg); flex-shrink: 0; }
  .fp-div { height: 1px; background: var(--border-dim); margin: var(--sp-1) var(--sp-2); }
  .fp-create { display: flex; align-items: center; gap: var(--sp-1); padding: 4px var(--sp-2); }
  .fp-input {
    flex: 1; background: var(--bg-overlay); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); padding: 4px 8px;
    font-size: var(--text-xs); color: var(--text-secondary); outline: none; min-width: 0;
  }
  .fp-input:focus { border-color: var(--border-focus); }
  .fp-confirm {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 4px 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--accent-dim); background: var(--accent-muted); color: var(--accent-fg); cursor: pointer;
  }
  .fp-confirm:disabled { opacity: 0.4; cursor: default; }
  .fp-cancel {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: var(--radius-sm);
    border: 1px solid transparent; background: none; color: var(--text-faint); cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base);
  }
  .fp-cancel:hover { color: var(--text-muted); border-color: var(--border-dim); }
  .fp-new {
    width: 100%; padding: 6px var(--sp-3); border-radius: var(--radius-sm);
    font-size: var(--text-xs); color: var(--text-faint); background: none; border: none;
    cursor: pointer; text-align: left; transition: color var(--t-fast), background var(--t-fast);
  }
  .fp-new:hover { color: var(--text-secondary); background: var(--bg-overlay); }

  .dl-wrap { position: relative; }
  .dl-dropdown {
    position: absolute; top: calc(100% + 4px); right: 0; min-width: 220px;
    background: var(--bg-raised); border: 1px solid var(--border-base);
    border-radius: var(--radius-lg); padding: var(--sp-1); z-index: 200;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: scaleIn 0.1s ease both; transform-origin: top right;
  }
  .dl-section-label {
    padding: 6px var(--sp-3) 4px; font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase;
  }
  .dl-next-row { display: flex; gap: 4px; padding: 2px var(--sp-2) var(--sp-2); }
  .dl-next-btn {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
    padding: 5px 6px; border-radius: var(--radius-md); border: 1px solid var(--border-dim);
    background: var(--bg-overlay); color: var(--text-secondary);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); cursor: pointer;
    transition: background var(--t-fast), border-color var(--t-fast), color var(--t-fast);
  }
  .dl-next-btn:hover:not(:disabled) { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
  .dl-next-btn:disabled { opacity: 0.3; cursor: default; }
  .dl-next-sub { font-size: var(--text-2xs); color: var(--text-faint); }
  .dl-divider { height: 1px; background: var(--border-dim); margin: var(--sp-1) var(--sp-2); }
  .dl-item {
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    width: 100%; padding: 7px var(--sp-3); border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--text-secondary); background: none; border: none;
    cursor: pointer; text-align: left; transition: background var(--t-fast), color var(--t-fast);
  }
  .dl-item:hover:not(:disabled) { background: var(--bg-overlay); color: var(--text-primary); }
  .dl-item:disabled { opacity: 0.3; cursor: default; }
  .dl-item.dl-item-danger { color: var(--color-error); }
  .dl-item.dl-item-danger:hover:not(:disabled) { background: var(--color-error-bg); }
  .dl-item-sub { font-size: var(--text-xs); color: var(--text-faint); }
  .dl-range-row { display: flex; align-items: center; gap: 4px; padding: 7px var(--sp-2); }
  .dl-range-back {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: none; color: var(--text-faint); font-size: 14px; cursor: pointer;
  }
  .dl-range-back:hover { color: var(--text-muted); background: var(--bg-overlay); }
  .dl-range-input {
    flex: 1; min-width: 0; padding: 4px 8px; background: var(--bg-overlay);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    color: var(--text-secondary); font-family: var(--font-ui); font-size: var(--text-xs);
    outline: none; text-align: center;
  }
  .dl-range-input:focus { border-color: var(--border-focus); }
  .dl-range-sep { color: var(--text-faint); font-size: var(--text-xs); }
  .dl-range-go {
    padding: 4px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--accent-dim); background: var(--accent-muted); color: var(--accent-fg);
    font-family: var(--font-ui); font-size: var(--text-xs); cursor: pointer;
  }
  .dl-range-go:disabled { opacity: 0.3; cursor: default; }
  .dl-unified-btn { gap: 5px; padding: 0 8px; width: auto; min-width: 28px; }
  .dl-unified-count {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    color: var(--text-faint); transition: color var(--t-base);
  }
  .dl-unified-btn:hover .dl-unified-count,
  .dl-unified-btn.active .dl-unified-count { color: var(--text-secondary); }
  .dl-unified-btn.dl-has-count { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .dl-unified-btn.dl-has-count .dl-unified-count { color: var(--accent-fg); opacity: 0.8; }
  .dl-unified-btn.dl-has-count:hover { background: var(--accent-muted); border-color: var(--accent); opacity: 0.9; }
  .dl-unified-btn.active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .pagination { display: flex; align-items: center; gap: var(--sp-2); }
  .page-btn {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim);
    color: var(--text-faint); background: none; cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base);
  }
  .page-btn:hover:not(:disabled) { color: var(--text-muted); border-color: var(--border-strong); }
  .page-btn:disabled { opacity: 0.3; cursor: default; }
  .page-num { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .sel-count {
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted);
    letter-spacing: var(--tracking-wide); padding: 0 var(--sp-1);
  }
  .sel-action-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: none; color: var(--text-muted); cursor: pointer;
    transition: color var(--t-base), background var(--t-base), border-color var(--t-base);
  }
  .sel-action-btn:hover { color: var(--text-primary); background: var(--bg-raised); border-color: var(--border-strong); }
  .sel-action-danger { color: var(--color-error) !important; }
  .sel-action-danger:hover { background: var(--color-error-bg) !important; border-color: var(--color-error) !important; }

  .scan-filter-wrap { position: relative; }
  .scan-filter-panel {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 200; min-width: 200px;
    background: var(--bg-raised); border: 1px solid var(--border-base);
    border-radius: var(--radius-lg); padding: var(--sp-1);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: scaleIn 0.1s ease both; transform-origin: top right;
  }
  .scan-filter-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 6px; }
  .scan-filter-clear {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0;
    transition: color var(--t-base);
  }
  .scan-filter-clear:hover { color: var(--color-error); }
  .scan-filter-divider { height: 1px; background: var(--border-dim); margin: 0 2px 4px; }
  .scan-filter-item {
    display: flex; align-items: center; gap: var(--sp-2); width: 100%;
    padding: 7px 10px; border-radius: var(--radius-sm); border: none; background: transparent;
    color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs);
    cursor: pointer; text-align: left;
    transition: background var(--t-base), color var(--t-base);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .scan-filter-item:hover { background: var(--bg-overlay); color: var(--text-primary); }
  .scan-filter-item-active { color: var(--accent-fg); background: var(--accent-muted); }
  .scan-filter-item-active:hover { background: var(--accent-dim); }
  .scan-filter-tabs {
    display: flex; gap: 2px; background: var(--bg-overlay);
    border: 1px solid var(--border-base); border-radius: var(--radius-sm); padding: 2px;
  }
  .scan-filter-tab {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 2px 8px; border-radius: 2px; border: none; background: none;
    color: var(--text-faint); cursor: pointer; transition: color var(--t-fast), background var(--t-fast);
  }
  .scan-filter-tab:hover { color: var(--text-muted); }
  .scan-filter-tab.scan-filter-tab-active { background: var(--bg-surface); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
  .scan-filter-force-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; }
  .scan-filter-force-label {
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted);
    letter-spacing: var(--tracking-wide); cursor: default;
    text-decoration: underline; text-decoration-style: dotted;
    text-decoration-color: var(--border-strong); text-underline-offset: 3px;
  }
  .scan-force-toggle {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 2px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim);
    background: none; color: var(--text-faint); cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .scan-force-toggle:hover { color: var(--text-muted); border-color: var(--border-strong); }
  .scan-force-toggle.scan-force-on { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .scan-filter-check {
    width: 13px; height: 13px; border-radius: 2px; border: 1px solid var(--border-strong);
    background: transparent; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; color: var(--bg-base);
    transition: background var(--t-base), border-color var(--t-base);
  }
  .scan-filter-check-on { background: var(--accent); border-color: var(--accent); }
  .scan-filter-check-block { background: var(--color-error); border-color: var(--color-error); }
  .scan-filter-item-block { color: var(--color-error) !important; background: color-mix(in srgb, var(--color-error) 8%, transparent) !important; }
  .scan-filter-item-block:hover { background: color-mix(in srgb, var(--color-error) 14%, transparent) !important; }

  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>