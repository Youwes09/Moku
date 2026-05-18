<script lang="ts">
  import { X, CaretLeft, CaretRight, CircleNotch } from "phosphor-svelte";
  import { setPref }                  from "@features/series/lib/mangaPrefs";
  import { coverCandidatesSync, dedupeByImage } from "@core/cover/coverResolver";
  import Thumbnail                    from "@shared/manga/Thumbnail.svelte";
  import type { Manga }               from "@types";

  interface Props {
    manga:    Manga;
    allManga: Manga[];
    onClose:  () => void;
  }

  let { manga, allManga, onClose }: Props = $props();

  type MangaWithTitle = Manga & { title: string };

  const mangaById = $derived(new Map(allManga.map(m => [m.id, m as MangaWithTitle])));

  const syncCandidates = $derived(
    coverCandidatesSync(manga.id, manga.title, manga.thumbnailUrl, mangaById)
  );

  let candidates  = $state<typeof syncCandidates>([]);
  let hashingDone = $state(false);
  let index       = $state(0);

  $effect(() => {
    const snap = syncCandidates;
    candidates  = [];
    hashingDone = false;
    index       = 0;

    dedupeByImage(snap).then(merged => {
      candidates  = merged;
      index       = Math.max(0, merged.findIndex(c => c.isActive));
      hashingDone = true;
    });
  });

  const current = $derived(candidates[index]);

  function prev() { index = (index - 1 + candidates.length) % candidates.length; }
  function next() { index = (index + 1) % candidates.length; }

  function confirm() {
    if (!current) return;
    if (current.mangaId === manga.id) setPref(manga.id, "coverUrl", undefined as any);
    else                               setPref(manga.id, "coverUrl", current.url);
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft")  { e.preventDefault(); prev(); }
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    if (e.key === "Enter")      { e.preventDefault(); confirm(); }
    if (e.key === "Escape")     onClose();
  }
</script>

<div
  class="backdrop"
  role="button"
  tabindex="-1"
  aria-label="Close cover picker"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => e.key === "Escape" && onClose()}
>
  <div class="modal" role="dialog" aria-label="Choose cover image" tabindex="-1" onkeydown={onKeydown}>
    <div class="header">
      <span class="title">Cover Image</span>
<button class="close-btn" onclick={onClose}><X size={14} weight="light" /></button>
    </div>

    {#if !hashingDone}
      <div class="loading">
        <CircleNotch size={24} weight="light" class="anim-spin" style="color:var(--text-faint)" />
      </div>
    {:else}
      <div class="stage">
        <button class="arrow" onclick={prev} disabled={candidates.length <= 1} aria-label="Previous">
          <CaretLeft size={18} weight="bold" />
        </button>

        <div class="cover-wrap">
          {#if current}
            <Thumbnail src={current.url} alt="" class="cover-img" />
          {/if}
        </div>

        <button class="arrow" onclick={next} disabled={candidates.length <= 1} aria-label="Next">
          <CaretRight size={18} weight="bold" />
        </button>
      </div>

      {#if candidates.length > 1}
        <div class="filmstrip">
          {#each candidates as c, i (c.url)}
            <button
              class="film-thumb"
              class:film-active={i === index}
              onclick={() => index = i}
              aria-label="Cover {i + 1}"
            >
              <Thumbnail src={c.url} alt="" class="film-img" />
            </button>
          {/each}
        </div>
      {/if}
    {/if}

    <div class="footer">
      <button class="confirm-btn" onclick={confirm}>Use this cover</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: calc(var(--z-settings) + 2);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.1s ease both;
  }
  .modal {
    width: min(380px, calc(100vw - 48px));
    display: flex; flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-base); border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    animation: scaleIn 0.14s ease both;
    outline: none;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-4) var(--sp-5);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0; gap: var(--sp-2);
  }
  .title {
    font-size: var(--text-sm); font-weight: var(--weight-medium);
    color: var(--text-secondary); flex: 1;
  }
  .close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    color: var(--text-faint); background: none; border: none; cursor: pointer;
    transition: color var(--t-base), background var(--t-base);
  }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }
  .stage {
    display: flex; align-items: center; justify-content: center;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-4) var(--sp-4);
  }
  .cover-wrap {
    flex: 1; max-width: 200px; aspect-ratio: 2/3;
    border-radius: var(--radius-md); overflow: hidden;
    border: 1px solid var(--border-dim);
    background: var(--bg-raised);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  :global(.cover-img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .arrow {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; flex-shrink: 0;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-dim);
    background: var(--bg-raised);
    color: var(--text-muted);
    cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .arrow:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); background: var(--bg-overlay); }
  .arrow:disabled { opacity: 0.2; cursor: default; }
  .filmstrip {
    display: flex; gap: var(--sp-2); align-items: center; justify-content: center;
    padding: 0 var(--sp-4) var(--sp-4);
    overflow-x: auto; scrollbar-width: none;
  }
  .filmstrip::-webkit-scrollbar { display: none; }
  .film-thumb {
    flex-shrink: 0; width: 44px; aspect-ratio: 2/3;
    border-radius: var(--radius-sm); overflow: hidden;
    border: 2px solid transparent;
    background: var(--bg-raised);
    cursor: pointer; padding: 0;
    opacity: 0.5;
    transition: border-color var(--t-base), opacity var(--t-base);
  }
  .film-thumb:hover { opacity: 0.8; }
  .film-active { border-color: var(--accent); opacity: 1; }
  :global(.film-img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .footer { padding: 0 var(--sp-4) var(--sp-4); flex-shrink: 0; }
  .confirm-btn {
    width: 100%; padding: 9px;
    border-radius: var(--radius-md);
    background: var(--accent); border: 1px solid var(--accent);
    color: var(--accent-contrast, #fff);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    cursor: pointer;
    transition: opacity var(--t-base);
  }
  .confirm-btn:hover { opacity: 0.88; }
  .loading { display: flex; align-items: center; justify-content: center; padding: var(--sp-10) 0; }
  @keyframes fadeIn  { from { opacity: 0 }                         to { opacity: 1 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
  @keyframes pulse   { 0%, 100% { opacity: 0.4 }                  50% { opacity: 1 } }
</style>