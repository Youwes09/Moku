<script lang="ts">
  import { X, LinkSimple, LinkBreak, Sparkle } from "phosphor-svelte";
  import Thumbnail  from "@shared/manga/Thumbnail.svelte";
  import { store, linkManga, unlinkManga } from "@store/state.svelte";
  import type { Manga } from "@types";

  interface Props {
    manga:    Manga;
    allManga: Manga[];
    onClose:  () => void;
  }

  let { manga, allManga, onClose }: Props = $props();

  let query = $state("");

  function titleSimilarity(a: string, b: string): number {
    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    const wa = new Set(norm(a));
    const wb = new Set(norm(b));
    if (!wa.size || !wb.size) return 0;
    const intersection = [...wa].filter(w => wb.has(w)).length;
    return intersection / new Set([...wa, ...wb]).size;
  }

  const linkedIds = $derived(store.settings.mangaLinks?.[manga.id] ?? []);

  const others = $derived(allManga.filter(m => m.id !== manga.id));

  const suggestions = $derived.by(() => {
    if (linkedIds.length === others.length) return [];
    return others
      .filter(m => !linkedIds.includes(m.id))
      .map(m => ({ manga: m, score: titleSimilarity(manga.title, m.title) }))
      .filter(r => r.score >= 0.65)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  });

  const searchResults = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return others
      .filter(m => m.title.toLowerCase().includes(q))
      .slice(0, 30);
  });

  const linked = $derived(
    others.filter(m => linkedIds.includes(m.id))
  );

  function toggle(other: Manga) {
    if (linkedIds.includes(other.id)) unlinkManga(manga.id, other.id);
    else linkManga(manga.id, other.id);
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => e.key === "Escape" && onClose()}
>
  <div class="modal" role="dialog" aria-label="Link as same series">
    <div class="header">
      <span class="title">Link as same series</span>
      <button class="close-btn" onclick={onClose}><X size={14} weight="light" /></button>
    </div>

    <p class="hint">Linked entries share covers and are merged in search. Click a linked entry to unlink.</p>

    <div class="search-wrap">
      <input class="search" placeholder="Search your library…" bind:value={query} />
    </div>

    <div class="list">
      {#if query.trim()}
        {#if searchResults.length === 0}
          <p class="empty">No results</p>
        {:else}
          {#each searchResults as m (m.id)}
            {@const isLinked = linkedIds.includes(m.id)}
            <button class="row" class:row-linked={isLinked} onclick={() => toggle(m)}>
              <Thumbnail src={m.thumbnailUrl} alt={m.title} class="thumb" />
              <div class="info">
                <span class="manga-title">{m.title}</span>
                {#if m.source?.displayName}<span class="source">{m.source.displayName}</span>{/if}
              </div>
              <span class="row-icon">{#if isLinked}<LinkBreak size={14} />{:else}<LinkSimple size={14} />{/if}</span>
            </button>
          {/each}
        {/if}

      {:else}
        {#if linked.length > 0}
          <p class="section-label">Linked</p>
          {#each linked as m (m.id)}
            <button class="row row-linked" onclick={() => toggle(m)}>
              <Thumbnail src={m.thumbnailUrl} alt={m.title} class="thumb" />
              <div class="info">
                <span class="manga-title">{m.title}</span>
                {#if m.source?.displayName}<span class="source">{m.source.displayName}</span>{/if}
              </div>
              <span class="row-icon"><LinkBreak size={14} /></span>
            </button>
          {/each}
        {/if}

        {#if suggestions.length > 0}
          <p class="section-label">
            <Sparkle size={10} weight="fill" style="color:var(--accent)" />
            Suggested
          </p>
          {#each suggestions as { manga: m, score } (m.id)}
            <button class="row" onclick={() => toggle(m)}>
              <Thumbnail src={m.thumbnailUrl} alt={m.title} class="thumb" />
              <div class="info">
                <span class="manga-title">{m.title}</span>
                {#if m.source?.displayName}<span class="source">{m.source.displayName}</span>{/if}
              </div>
              <span class="sim-bar">
                <span class="sim-fill" style="width:{Math.round(score * 100)}%"></span>
              </span>
              <span class="row-icon"><LinkSimple size={14} /></span>
            </button>
          {/each}
        {/if}

        {#if linked.length === 0 && suggestions.length === 0}
          <p class="empty">No suggestions — search your library above.</p>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: var(--z-settings);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.12s ease both;
  }
  .modal {
    width: min(460px, calc(100vw - 48px));
    max-height: 70vh;
    display: flex; flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-base); border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    animation: scaleIn 0.14s ease both;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-4) var(--sp-5);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .title {
    font-size: var(--text-sm); font-weight: var(--weight-medium);
    color: var(--text-secondary);
  }
  .close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--radius-sm);
    color: var(--text-faint); background: none; border: none; cursor: pointer;
    transition: color var(--t-base), background var(--t-base);
  }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }
  .hint {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide);
    line-height: var(--leading-snug);
    padding: var(--sp-3) var(--sp-5) 0;
    flex-shrink: 0;
  }
  .search-wrap {
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .search {
    width: 100%; background: var(--bg-raised);
    border: 1px solid var(--border-dim); border-radius: var(--radius-md);
    padding: 6px 10px; color: var(--text-primary);
    font-size: var(--text-sm); outline: none;
    transition: border-color var(--t-base);
  }
  .search:focus { border-color: var(--border-strong); }
  .list {
    flex: 1; overflow-y: auto;
    padding: var(--sp-2);
    scrollbar-width: none;
  }
  .list::-webkit-scrollbar { display: none; }
  .section-label {
    display: flex; align-items: center; gap: var(--sp-1);
    font-family: var(--font-ui); font-size: 9px;
    color: var(--text-faint); letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    padding: var(--sp-3) var(--sp-3) var(--sp-1);
  }
  .empty {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-faint); padding: var(--sp-4) var(--sp-3);
    text-align: center; letter-spacing: var(--tracking-wide);
  }
  .row {
    display: flex; align-items: center; gap: var(--sp-3);
    width: 100%; padding: 8px var(--sp-3);
    border-radius: var(--radius-md); border: none;
    background: none; text-align: left; cursor: pointer;
    transition: background var(--t-fast);
  }
  .row:hover { background: var(--bg-raised); }
  .row-linked { background: var(--accent-muted) !important; }
  :global(.thumb) { width: 34px; height: 48px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; border: 1px solid var(--border-dim); }
  .info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
  .manga-title { font-size: var(--text-sm); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .source { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .sim-bar {
    width: 36px; height: 3px;
    background: var(--bg-overlay); border-radius: var(--radius-full);
    overflow: hidden; flex-shrink: 0;
  }
  .sim-fill { display: block; height: 100%; background: var(--accent); border-radius: var(--radius-full); }
  .row-icon { display: flex; align-items: center; color: var(--text-faint); flex-shrink: 0; opacity: 0.6; transition: opacity var(--t-base); }
  .row:hover .row-icon { opacity: 1; }
  .row-linked .row-icon { color: var(--accent-fg); opacity: 1; }

  @keyframes fadeIn  { from { opacity: 0 }                         to { opacity: 1 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>