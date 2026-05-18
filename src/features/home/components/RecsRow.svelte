<script lang="ts">
  import { ArrowLeft, ArrowRight, Sparkle } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import type { Manga } from "@types";
  import type { HistoryEntry } from "@store/state.svelte";
  import { fetchRecommendations, topGenres } from "../lib/recommendations";
  import type { RecommendedManga } from "../lib/recommendations";

  let {
    libraryManga,
    history,
    onopenrecommended,
  }: {
    libraryManga: Manga[];
    history: HistoryEntry[];
    onopenrecommended: (m: Manga) => void;
  } = $props();

  const CARD_MIN_WIDTH = 100;
  const GAP            = 12;
  const ROWS           = 2;

  let containerEl: HTMLDivElement | undefined = $state();
  let containerWidth = $state(0);

  $effect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver(([entry]) => {
      containerWidth = entry.contentRect.width;
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  const cols         = $derived(containerWidth > 0 ? Math.max(1, Math.floor((containerWidth + GAP) / (CARD_MIN_WIDTH + GAP))) : 6);
  const visibleCount = $derived(cols * ROWS);
  const gridStyle    = $derived(`grid-template-columns: repeat(${cols}, 1fr);`);

  let allRecs: RecommendedManga[] = $state([]);
  let loading = $state(false);
  let _ctrl: AbortController | null = null;

  $effect(() => {
    const _history = history;
    const _library = libraryManga;
    if (!_history.length || !_library.length) { allRecs = []; return; }
    _ctrl?.abort();
    const ctrl = new AbortController();
    _ctrl = ctrl;
    loading = true;
    fetchRecommendations(_history, _library, ctrl.signal)
      .then(r => { if (!ctrl.signal.aborted) { allRecs = r; loading = false; } })
      .catch(() => { if (!ctrl.signal.aborted) loading = false; });
  });

  const genres = $derived(topGenres(history, libraryManga));

  let genreIdx = $state(0);

  const activeGenre = $derived(genres[genreIdx] ?? null);

  const visibleRecs = $derived(
    (activeGenre
      ? allRecs.filter(r => r.matchedGenres.some(g => g.toLowerCase() === activeGenre.toLowerCase()))
      : allRecs
    ).slice(0, visibleCount)
  );

  function prev() { genreIdx = (genreIdx - 1 + genres.length) % genres.length; }
  function next() { genreIdx = (genreIdx + 1) % genres.length; }
</script>

<div class="col">
  <div class="col-header">
    <span class="col-title">
      <Sparkle size={10} weight="bold" /> Recommended
    </span>
    {#if genres.length > 1}
      <div class="genre-switcher">
        <button class="nav-btn" onclick={prev}><ArrowLeft size={9} weight="bold" /></button>
        <span class="genre-label">{activeGenre}</span>
        <button class="nav-btn" onclick={next}><ArrowRight size={9} weight="bold" /></button>
      </div>
    {/if}
  </div>

  <div class="grid-container" bind:this={containerEl}>
    {#if loading}
      <p class="empty-msg">Loading…</p>
    {:else if visibleRecs.length > 0}
      <div class="card-grid" style={gridStyle}>
        {#each visibleRecs as r (r.manga.id)}
          <button class="card" onclick={() => onopenrecommended(r.manga)}>
            <div class="card-cover-wrap">
              <Thumbnail src={r.manga.thumbnailUrl} alt={r.manga.title} class="card-cover" />
              <div class="card-gradient"></div>
              <div class="card-footer">
                <p class="card-title">{r.manga.title}</p>
                <p class="card-badge">{r.matchedGenres.slice(0, 2).join(" · ")}</p>
              </div>
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty-msg">No recommendations found</p>
    {/if}
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; min-width: 0; height: 100%; }

  .col-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--sp-2);
    flex-shrink: 0;
  }
  .col-title {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .genre-switcher {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .genre-label {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    min-width: 48px;
    text-align: center;
  }
  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    color: var(--text-faint);
    transition: color var(--t-base);
  }
  .nav-btn:hover { color: var(--accent-fg); }

  .grid-container {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .card-grid {
    display: grid;
    grid-template-rows: repeat(2, auto);
    grid-auto-rows: 0;
    overflow: hidden;
    gap: var(--sp-3);
    align-content: start;
  }

  .card {
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .card:hover :global(.card-cover) { filter: brightness(1.1) saturate(1.05); transform: scale(1.02); }

  .card-cover-wrap {
    position: relative;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    box-shadow: 0 2px 14px rgba(0, 0, 0, 0.38);
  }
  :global(.card-cover) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: filter 0.15s ease, transform 0.15s ease;
  }
  .card-gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.08) 55%, transparent 75%);
    pointer-events: none;
  }
  .card-footer {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: var(--sp-2);
    pointer-events: none;
  }
  .card-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: rgba(255,255,255,0.92);
    line-height: var(--leading-snug);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 1px 4px rgba(0,0,0,0.7);
  }
  .card-badge {
    font-family: var(--font-ui);
    font-size: 9px;
    color: rgba(255,255,255,0.45);
    letter-spacing: var(--tracking-wide);
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty-msg {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    padding: var(--sp-1) 0;
  }
</style>