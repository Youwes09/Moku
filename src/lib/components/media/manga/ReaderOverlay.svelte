<script lang="ts">
  import { readerState }                    from "$lib/state/mangaReader.svelte";
  import { tsunagu }                        from "$lib/server-adapters/tsunagu";
  import type { Chapter }                   from "$lib/types";

  interface Props {
    showResumeBanner: boolean;
    resumePage:       number;
    resumeFading:     boolean;
    adjacent:         { prev: Chapter | null; next: Chapter | null; remaining: Chapter[] };
    onDismissResume:  () => void;
    barPosition:      "top" | "left" | "right";
  }

  const { showResumeBanner, resumePage, resumeFading, adjacent, onDismissResume, barPosition }: Props = $props();

  async function runDl(fn: () => Promise<void>) {
    readerState.dlBusy = true;
    try { await fn(); } catch (e) { console.error(e); }
    readerState.dlBusy = false;
    readerState.dlOpen = false;
  }

  let bannerMounted = $state(false);
  let bannerFading  = $state(false);

  $effect(() => {
    if (showResumeBanner) {
      bannerMounted = true;
      bannerFading  = false;
    } else if (bannerMounted) {
      bannerFading = true;
    }
  });

  const queueable = $derived(adjacent.remaining.filter(c => !c.downloaded));
  const realMediaId = $derived(readerState.activeManga?.mediaId ?? readerState.activeManga?.libraryEntryId ?? "");

  function onBannerAnimationEnd() {
    if (bannerFading) { bannerMounted = false; bannerFading = false; }
  }
</script>

{#if bannerMounted}
  <button class="resume-banner resume-banner-{barPosition}" class:fading={bannerFading} onclick={onDismissResume} onanimationend={onBannerAnimationEnd}>
    Bookmark at page {resumePage}
  </button>
{/if}

{#if readerState.dlOpen && readerState.activeChapter}
  {@const chapter = readerState.activeChapter}
  <div class="dl-backdrop dl-backdrop-{barPosition}" role="presentation" onclick={() => readerState.dlOpen = false}>
    <div class="dl-modal" role="presentation" onclick={(e) => e.stopPropagation()}>
      <p class="dl-title">Download</p>

      <button class="dl-option" disabled={readerState.dlBusy || !!chapter.downloaded}
        onclick={() => runDl(async () => { await tsunagu.enqueueDownload(realMediaId, chapter.id); })}>
        This chapter
        <span class="dl-sub">{chapter.downloaded ? "Already downloaded" : chapter.name}</span>
      </button>

      <div class="dl-row">
        <button class="dl-option" disabled={readerState.dlBusy || queueable.length === 0}
          onclick={() => runDl(async () => { await tsunagu.enqueueDownloads(realMediaId, queueable.slice(0, readerState.nextN).map(c => c.id)); })}>
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
        onclick={() => runDl(async () => { await tsunagu.enqueueDownloads(realMediaId, queueable.map(c => c.id)); })}>
        All remaining
        <span class="dl-sub">{queueable.length} not yet downloaded</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .resume-banner { position: fixed; left: 50%; translate: -50% 0; display: flex; align-items: center; gap: var(--sp-2); background: var(--frost-bg); border: 1px solid var(--frost-border); backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur); border-radius: var(--radius-lg); padding: 6px var(--sp-3); font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary); z-index: 39; box-shadow: var(--frost-shadow); animation: bannerIn 0.2s cubic-bezier(0.16,1,0.3,1) both; white-space: nowrap; cursor: pointer; }
  .resume-banner-top   { top: calc(var(--sp-3) + 44px + var(--sp-2)); }
  .resume-banner-left,
  .resume-banner-right { top: var(--sp-3); }
  .resume-banner.fading { animation: bannerOut 1s ease forwards; }
  @keyframes bannerIn  { from { opacity: 0; translate: -50% -6px; scale: 0.97; } to { opacity: 1; translate: -50% 0; scale: 1; } }
  @keyframes bannerOut { from { opacity: 1; translate: -50% 0;  scale: 1;    } to { opacity: 0; translate: -50% -4px; scale: 0.97; } }

  .dl-backdrop { position: fixed; inset: 0; z-index: calc(var(--z-reader) + 10); display: flex; padding: var(--sp-4); }
  .dl-backdrop-top   { align-items: flex-start; justify-content: flex-end; padding-top: 52px; padding-right: var(--sp-4); }
  .dl-backdrop-left  { align-items: flex-end;   justify-content: flex-start; padding-bottom: var(--sp-4); padding-left: 52px; }
  .dl-backdrop-right { align-items: flex-end;   justify-content: flex-end;   padding-bottom: var(--sp-4); padding-right: 52px; }
  .dl-modal    { background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-xl); padding: var(--sp-3); min-width: 210px; display: flex; flex-direction: column; gap: var(--sp-1); box-shadow: 0 8px 32px rgba(0,0,0,0.6); animation: scaleIn 0.12s ease both; }
  .dl-backdrop-top   .dl-modal { transform-origin: top right; }
  .dl-backdrop-left  .dl-modal { transform-origin: bottom left; }
  .dl-backdrop-right .dl-modal { transform-origin: bottom right; }
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