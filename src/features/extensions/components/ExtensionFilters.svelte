<script lang="ts">
  import { MagnifyingGlass, ArrowsClockwise, Plus, GitBranch, ArrowCircleUp } from "phosphor-svelte";
  import { FILTERS, type Filter, type Panel } from "../lib/extensionHelpers";

  interface Props {
    filter:         Filter;
    search:         string;
    panel:          Panel;
    refreshing:     boolean;
    updateCount:    number;
    updatingAll:    boolean;
    availableLangs: string[];
    langFilter:     string | null;
    anims:          boolean;
    tabIndicator:   { left: number; width: number };
    tabsEl:         HTMLDivElement | undefined;
    onFilter:       (f: Filter) => void;
    onSearch:       (q: string) => void;
    onLang:         (lang: string | null) => void;
    onPanel:        (p: Panel) => void;
    onRefresh:      () => void;
    onUpdateAll:    () => void;
  }

  let {
    filter, search, panel, refreshing, updateCount, updatingAll,
    availableLangs, langFilter,
    anims, tabIndicator,
    tabsEl = $bindable(),
    onFilter, onSearch, onLang, onPanel, onRefresh, onUpdateAll,
  }: Props = $props();
</script>

<div class="header">
  <h1 class="heading">Extensions</h1>

  <div class="tabs" class:tabs-anims={anims} bind:this={tabsEl}>
    {#if anims && tabIndicator.width > 0}
      <div class="tab-slide-indicator" style="left:{tabIndicator.left}px;width:{tabIndicator.width}px" aria-hidden="true"></div>
    {/if}
    {#each FILTERS as f}
      <button class="tab" class:active={filter === f.id} onclick={() => onFilter(f.id)}>
        {f.id === "updates" && updateCount > 0 ? `Updates (${updateCount})` : f.label}
      </button>
    {/each}
  </div>

  <div class="header-right">
    <div class="search-wrap">
      <MagnifyingGlass size={12} class="search-icon" weight="light" />
      <input class="search" placeholder="Search" value={search} oninput={(e) => onSearch((e.target as HTMLInputElement).value)} />
    </div>
    <button class="icon-btn" class:active={panel === "repos"} onclick={() => onPanel("repos")} title="Manage repos">
      <Plus size={14} weight="light" />
    </button>
    <button class="icon-btn" class:active={panel === "apk"} onclick={() => onPanel("apk")} title="Install from URL">
      <GitBranch size={14} weight="light" />
    </button>
    <button class="icon-btn" onclick={onRefresh} disabled={refreshing} title="Refresh repo">
      <ArrowsClockwise size={14} weight="light" class={refreshing ? "anim-spin" : ""} />
    </button>
    {#if updateCount > 0}
      <button class="icon-btn update-badge" onclick={onUpdateAll} disabled={updatingAll} title="Update all ({updateCount})">
        <ArrowCircleUp size={14} weight="fill" class={updatingAll ? "anim-spin" : ""} />
      </button>
    {/if}
  </div>
</div>

{#if availableLangs.length > 1}
  <div class="lang-bar">
    <button class="lang-pill" class:active={langFilter === null} onclick={() => onLang(null)}>All</button>
    {#each availableLangs as lang}
      <button class="lang-pill" class:active={langFilter === lang} onclick={() => onLang(langFilter === lang ? null : lang)}>
        {lang.toUpperCase()}
      </button>
    {/each}
  </div>
{/if}

<style>
  .heading { font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-normal); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .header { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4) var(--sp-6); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .header-right { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }
  .icon-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-md); color: var(--text-muted); transition: color var(--t-base), background var(--t-base); }
  .icon-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .icon-btn:disabled { opacity: 0.4; }
  .icon-btn.active { color: var(--accent-fg); background: var(--accent-muted); }
  .tabs { display: flex; gap: 2px; background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 2px; position: relative; }
  .tab-slide-indicator { position: absolute; top: 2px; bottom: 2px; border-radius: var(--radius-sm); background: var(--accent-muted); border: 1px solid var(--accent-dim); pointer-events: none; z-index: 0; transition: left 0.22s cubic-bezier(0.16,1,0.3,1), width 0.22s cubic-bezier(0.16,1,0.3,1); }
  .tab { position: relative; z-index: 1; display: flex; align-items: center; gap: 5px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; padding: 4px 10px; border-radius: var(--radius-sm); color: var(--text-faint); white-space: nowrap; transition: background var(--t-base), color var(--t-base); }
  .tab:hover { color: var(--text-muted); }
  .tab.active { background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); }
  .tabs-anims .tab.active { background: transparent; border-color: transparent; }
  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-wrap :global(.search-icon) { position: absolute; left: 9px; color: var(--text-faint); pointer-events: none; }
  .search { background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 5px 10px 5px 26px; color: var(--text-primary); font-size: var(--text-sm); width: 160px; outline: none; transition: border-color var(--t-base); }
  .search::placeholder { color: var(--text-faint); }
  .search:focus { border-color: var(--border-strong); }
  .icon-btn.update-badge { color: var(--accent-fg); }
  .icon-btn.update-badge:hover:not(:disabled) { background: var(--accent-muted); }
  .lang-bar { display: flex; align-items: center; gap: 4px; padding: var(--sp-2) var(--sp-6); flex-shrink: 0; flex-wrap: wrap; border-bottom: 1px solid var(--border-dim); }
  .lang-pill { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; padding: 3px 9px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast); }
  .lang-pill:hover { color: var(--text-muted); border-color: var(--border-strong); background: var(--bg-raised); }
  .lang-pill.active { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
</style>