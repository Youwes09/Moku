<script lang="ts">
  import { Check, Funnel } from "phosphor-svelte";
  import type { LibraryStatusFilter, LibraryContentFilter } from "@store/state.svelte";

  interface Props {
    tabStatus:        LibraryStatusFilter;
    tabFilters:       Partial<Record<LibraryContentFilter, boolean>>;
    hasActiveFilters: boolean;
    filterPanelOpen:  boolean;
    onStatusChange:   (s: LibraryStatusFilter) => void;
    onFilterToggle:   (f: LibraryContentFilter) => void;
    onFiltersClear:   () => void;
    onFilterPanelToggle: () => void;
  }

  let {
    tabStatus, tabFilters, hasActiveFilters, filterPanelOpen,
    onStatusChange, onFilterToggle, onFiltersClear, onFilterPanelToggle,
  }: Props = $props();

  const STATUS_LABELS: Record<LibraryStatusFilter, string> = {
    ALL: "All statuses", ONGOING: "Ongoing", COMPLETED: "Completed",
    CANCELLED: "Cancelled", HIATUS: "Hiatus", UNKNOWN: "Unknown",
  };

  const ALL_STATUS_FILTERS: LibraryStatusFilter[] = [
    "ALL", "ONGOING", "COMPLETED", "CANCELLED", "HIATUS", "UNKNOWN",
  ];

  const CONTENT_FILTERS: [LibraryContentFilter, string][] = [
    ["unread", "Unread"],
    ["started", "Started"],
    ["downloaded", "Downloaded"],
    ["bookmarked", "Bookmarked"],
  ];
</script>

<div class="filter-panel-wrap">
  <button
    class="icon-btn"
    class:icon-btn-active={hasActiveFilters}
    title="Filter"
    onclick={onFilterPanelToggle}
  >
    <Funnel size={15} weight={hasActiveFilters ? "fill" : "bold"} />
  </button>

  {#if filterPanelOpen}
    <div class="dropdown-panel filter-panel" role="menu">
      <div class="panel-header">
        <span class="panel-heading">Filter</span>
        {#if hasActiveFilters}
          <button class="panel-clear-btn" onclick={onFiltersClear}>Clear all</button>
        {/if}
      </div>
      <div class="panel-divider"></div>

      <p class="panel-label">Content</p>
      {#each CONTENT_FILTERS as [f, label]}
        <button
          class="panel-item panel-item-check"
          class:panel-item-active={tabFilters[f]}
          role="menuitem"
          onclick={() => onFilterToggle(f)}
        >
          <span class="panel-check" class:panel-check-on={tabFilters[f]}>
            {#if tabFilters[f]}<Check size={9} weight="bold" />{/if}
          </span>
          {label}
        </button>
      {/each}

      <div class="panel-divider"></div>

      <p class="panel-label">Status</p>
      {#each ALL_STATUS_FILTERS.filter(s => s !== "ALL") as s}
        <button
          class="panel-item panel-item-check"
          class:panel-item-active={tabStatus === s}
          role="menuitem"
          onclick={() => onStatusChange(tabStatus === s ? "ALL" : s)}
        >
          <span class="panel-check" class:panel-check-on={tabStatus === s}>
            {#if tabStatus === s}<Check size={9} weight="bold" />{/if}
          </span>
          {STATUS_LABELS[s]}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .filter-panel-wrap { position: relative; }
  .icon-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .icon-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .icon-btn-active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .dropdown-panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 9999; min-width: 220px; background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); padding: var(--sp-1); box-shadow: 0 8px 32px rgba(0,0,0,0.5); animation: fadeIn 0.1s ease both; }
  .panel-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 4px; }
  .panel-heading { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-secondary); font-weight: var(--weight-medium, 500); }
  .panel-clear-btn { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base); }
  .panel-clear-btn:hover { color: var(--color-error); }
  .panel-divider { height: 1px; background: var(--border-dim); margin: 4px 2px; }
  .panel-label { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--text-faint); padding: 4px 8px 8px; }
  .panel-item { display: flex; align-items: center; justify-content: flex-start; gap: var(--sp-2); width: 100%; padding: 7px 10px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); cursor: pointer; text-align: left; transition: background var(--t-base), color var(--t-base); }
  .panel-item:hover { background: var(--bg-overlay); color: var(--text-primary); }
  .panel-item-active { color: var(--accent-fg); background: var(--accent-muted); font-weight: var(--weight-medium, 500); }
  .panel-item-active:hover { background: var(--accent-dim); }
  .panel-item-check { justify-content: flex-start; }
  .panel-check { width: 13px; height: 13px; border-radius: 2px; border: 1px solid var(--border-strong); background: transparent; flex-shrink: 0; transition: background var(--t-base), border-color var(--t-base); display: flex; align-items: center; justify-content: center; color: var(--bg-base); }
  .panel-check-on { background: var(--accent); border-color: var(--accent); }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
