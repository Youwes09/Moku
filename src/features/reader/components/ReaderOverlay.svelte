<script lang="ts">
  import { gql }         from "@api/client";
  import { store }       from "@store/state.svelte";
  import { readerState } from "../store/readerState.svelte";
  import { ENQUEUE_DOWNLOAD, ENQUEUE_CHAPTERS_DOWNLOAD } from "@api/mutations/downloads";
  import type { Chapter } from "@types";

  interface Props {
    showResumeBanner: boolean;
    resumePage:       number;
    resumeFading:     boolean;
    adjacent:         { remaining: Chapter[] };
    onDismissResume:  () => void;
  }

  const { showResumeBanner, resumePage, resumeFading, adjacent, onDismissResume }: Props = $props();

  async function runDl(fn: () => Promise<unknown>) {
    readerState.dlBusy = true;
    try { await fn(); } catch (e) { console.error(e); }
    readerState.dlBusy = false;
    readerState.dlOpen = false;
  }
</script>

{#if showResumeBanner}
  <button class="resume-banner" class:fading={resumeFading} onclick={onDismissResume}>
    <span>Bookmark at page {resumePage}</span>
  </button>
{/if}

{#if readerState.dlOpen && store.activeChapter}
  {@const queueable = adjacent.remaining.filter(c => !c.isDownloaded)}
  <div class="dl-backdrop" role="presentation" onclick={() => readerState.dlOpen = false}>
    <div class="dl-modal" role="presentation" onclick={(e) => e.stopPropagation()}>
      <p class="dl-title">Download</p>
      <button class="dl-option" disabled={readerState.dlBusy || !!store.activeChapter.isDownloaded}
        onclick={() => runDl(() => gql(ENQUEUE_DOWNLOAD, { chapterId: store.activeChapter!.id }))}>
        This chapter
        <span class="dl-sub">{store.activeChapter.isDownloaded ? "Already downloaded" : store.activeChapter.name}</span>
      </button>
      <div class="dl-row">
        <button class="dl-option" disabled={readerState.dlBusy || queueable.length === 0}
          onclick={() => runDl(() => gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: queueable.slice(0, readerState.nextN).map(c => c.id) }))}>
          Next chapters
          <span class="dl-sub">{Math.min(readerState.nextN, queueable.length)} not yet downloaded</span>
        </button>
        <div class="dl-stepper" role="presentation" onclick={(e) => e.stopPropagation()}>
          <button class="dl-step-btn" onclick={() => readerState.nextN = Math.max(1, readerState.nextN - 1)} disabled={readerState.nextN <= 1}>−</button>
          <span class="dl-step-val">{readerState.nextN}</span>
          <button class="dl-step-btn" onclick={() => readerState.nextN = Math.min(queueable.length || 1, readerState.nextN + 1)} disabled={readerState.nextN >= queueable.length}>+</button>
        </div>
      </div>
      <button class="dl-option" disabled={readerState.dlBusy || queueable.length === 0}
        onclick={() => runDl(() => gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: queueable.map(c => c.id) }))}>
        All remaining
        <span class="dl-sub">{queueable.length} not yet downloaded</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .resume-banner { position: fixed; top: 48px; left: 50%; display: flex; align-items: center; gap: var(--sp-2); background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); padding: 6px var(--sp-3); font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary); z-index: 20; box-shadow: 0 4px 16px rgba(0,0,0,0.4); animation: bannerIn 0.2s cubic-bezier(0.16,1,0.3,1) both; white-space: nowrap; cursor: pointer; text-align: left; }
  .resume-banner.fading { animation: bannerOut 1s ease forwards; }
  @keyframes bannerIn  { from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.97); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
  @keyframes bannerOut { from { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } to { opacity: 0; transform: translateX(-50%) translateY(-4px) scale(0.97); } }

  .dl-backdrop { position: fixed; inset: 0; z-index: calc(var(--z-reader) + 10); display: flex; align-items: flex-start; justify-content: flex-end; padding: 48px var(--sp-4) 0; }
  .dl-modal    { background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-xl); padding: var(--sp-3); min-width: 210px; display: flex; flex-direction: column; gap: var(--sp-1); box-shadow: 0 8px 32px rgba(0,0,0,0.6); animation: scaleIn 0.12s ease both; transform-origin: top right; }
  .dl-title    { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; padding: 2px var(--sp-2) var(--sp-2); border-bottom: 1px solid var(--border-dim); margin-bottom: var(--sp-1); }
  .dl-option   { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 7px var(--sp-3); border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--text-secondary); background: none; border: none; cursor: pointer; text-align: left; transition: background var(--t-fast), color var(--t-fast); }
  .dl-option:hover:not(:disabled) { background: var(--bg-overlay); color: var(--text-primary); }
  .dl-option:disabled { opacity: 0.3; cursor: default; }
  .dl-sub      { font-size: var(--text-xs); color: var(--text-faint); }
  .dl-row      { display: flex; align-items: center; gap: var(--sp-2); }
  .dl-stepper  { display: flex; align-items: center; gap: 2px; background: var(--bg-overlay); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; }
  .dl-step-btn { display: flex; align-items: center; justify-content: center; width: 22px; height: 28px; font-size: var(--text-base); color: var(--text-muted); background: none; border: none; cursor: pointer; line-height: 1; transition: color var(--t-fast), background var(--t-fast); }
  .dl-step-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .dl-step-btn:disabled { opacity: 0.25; cursor: default; }
  .dl-step-val { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary); min-width: 24px; text-align: center; letter-spacing: var(--tracking-wide); }

  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>