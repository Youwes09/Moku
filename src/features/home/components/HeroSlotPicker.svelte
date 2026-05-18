<script lang="ts">
  import { MagnifyingGlass, X as XIcon } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import type { Manga } from "@types";

  let {
    slotIndex,
    libraryManga,
    loading,
    onpin,
    onclose,
  }: {
    slotIndex: 1 | 2 | 3;
    libraryManga: Manga[];
    loading: boolean;
    onpin: (m: Manga) => void;
    onclose: () => void;
  } = $props();

  let search = $state("");

  function focusEl(node: HTMLElement) { node.focus(); }

  const results = $derived(
    search.trim()
      ? libraryManga.filter(m => m.title.toLowerCase().includes(search.toLowerCase())).slice(0, 20)
      : libraryManga.slice(0, 20)
  );
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  onkeydown={(e) => { if (e.key === "Escape") onclose(); }}
>
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">Pin manga — slot {slotIndex + 1}</span>
      <button class="modal-close" onclick={onclose}><XIcon size={13} weight="light" /></button>
    </div>
    <div class="search-wrap">
      <MagnifyingGlass size={12} weight="light" style="color:var(--text-faint);flex-shrink:0" />
      <input class="search-input" placeholder="Search library…" bind:value={search} use:focusEl />
    </div>
    <div class="list">
      {#if loading}
        <p class="empty-msg">Loading…</p>
      {:else if results.length === 0}
        <p class="empty-msg">No results</p>
      {:else}
        {#each results as m (m.id)}
          <button class="list-row" onclick={() => onpin(m)}>
            <Thumbnail src={m.thumbnailUrl} alt={m.title} class="row-thumb" />
            <div class="row-info">
              <span class="row-title">{m.title}</span>
              {#if m.source?.displayName}<span class="row-source">{m.source.displayName}</span>{/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.62);
    z-index: var(--z-settings);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.1s ease both;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .modal {
    width: min(460px, calc(100vw - 48px));
    max-height: 68vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
    animation: scaleIn 0.14s ease both;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-4) var(--sp-5);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .modal-title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-secondary);
  }
  .modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--text-faint);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .modal-close:hover { color: var(--text-muted); background: var(--bg-raised); }

  .search-wrap {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .search-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: var(--text-sm);
  }
  .search-input::placeholder { color: var(--text-faint); }

  .list {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-2);
    scrollbar-width: none;
  }
  .list::-webkit-scrollbar { display: none; }

  .empty-msg {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-faint);
    padding: var(--sp-4) var(--sp-3);
    text-align: center;
  }
  .list-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    padding: 8px var(--sp-3);
    border-radius: var(--radius-md);
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background var(--t-fast);
  }
  .list-row:hover { background: var(--bg-raised); }
  :global(.row-thumb) {
    height: 50px;
    width: 35px;
    aspect-ratio: 1 / 1.42;
    border-radius: var(--radius-sm);
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid var(--border-dim);
    background: var(--bg-raised);
    display: block;
  }
  .row-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
  .row-title {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-source {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
  }

  @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>
