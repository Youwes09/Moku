<script lang="ts">
  import { readerState } from "$lib/state/mangaReader.svelte";

  interface Props {
    imgCls:    string;
    src:       string | null;
    fadingOut: boolean;
    isFade:    boolean;
  }

  const { imgCls, src, fadingOut, isFade }: Props = $props();
</script>

<div
  class="inspect-wrap"
  style="transform:scale({readerState.inspectScale}) translate({readerState.inspectPanX / readerState.inspectScale}px,{readerState.inspectPanY / readerState.inspectScale}px)"
>
  {#if src}
    <img
      {src}
      alt="Page {readerState.pageNumber}"
      class={imgCls}
      decoding="async"
      draggable="false"
      style={isFade ? `opacity:${fadingOut ? 0 : 1};transition:opacity 0.1s ease` : undefined}
    />
  {:else}
    <div class="page-loader page-loader-single" aria-hidden="true">{@render skeleton()}</div>
  {/if}
</div>

{#snippet skeleton()}
  <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect class="ps-r ps-r1" x="2"  y="2"  width="62" height="88" rx="1"/>
    <rect class="ps-r ps-r2" x="68" y="2"  width="30" height="42" rx="1"/>
    <rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/>
    <rect class="ps-r ps-r4" x="2"  y="94" width="44" height="54" rx="1"/>
    <rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/>
  </svg>
{/snippet}

<style>
  .inspect-wrap { display: flex; align-items: center; justify-content: center; transform-origin: center center; will-change: transform; }

  .page-loader { border-radius: var(--radius-sm); display: flex; align-items: stretch; }
  .page-loader-single {
    width: min(100%, var(--effective-width, 100%));
    max-width: var(--effective-width, 100%);
    max-height: calc(var(--visual-vh, 100vh) - 80px);
    aspect-ratio: 2 / 3;
  }

  .panel-skeleton { width: 100%; height: 100%; }
  .panel-skeleton :global(.ps-r) {
    stroke: var(--border-strong); stroke-width: 0.8; fill: none;
    stroke-dasharray: 400; stroke-dashoffset: 400;
    animation: ps-shimmer 2s ease-in-out infinite;
  }
  .panel-skeleton :global(.ps-r1) { animation-delay: 0s; }
  .panel-skeleton :global(.ps-r2) { animation-delay: 0.15s; }
  .panel-skeleton :global(.ps-r3) { animation-delay: 0.3s; }
  .panel-skeleton :global(.ps-r4) { animation-delay: 0.1s; }
  .panel-skeleton :global(.ps-r5) { animation-delay: 0.25s; }

  @keyframes ps-shimmer {
    0%   { stroke-dashoffset: 400;  opacity: 0.25; }
    40%  { stroke-dashoffset: 0;    opacity: 0.55; }
    70%  { stroke-dashoffset: 0;    opacity: 0.55; }
    100% { stroke-dashoffset: -400; opacity: 0.25; }
  }
</style>
