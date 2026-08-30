<script lang="ts">
  import { PuzzlePiece } from "phosphor-svelte";
  import Thumbnail from "$lib/components/shared/manga/Thumbnail.svelte";

  interface Props {
    src?:   string | null;
    alt?:   string;
    size?:  number;
    class?: string;
  }
  let { src, alt = "", size = 32, class: cls = "ext-icon" }: Props = $props();

  let failed = $state(false);
  $effect(() => { src; failed = false; });
</script>

{#if src && !failed}
  <Thumbnail {src} {alt} class={cls} onerror={() => (failed = true)} />
{:else}
  <div class="{cls} ext-icon-fallback" style="width:{size}px;height:{size}px" aria-label={alt}>
    <PuzzlePiece size={Math.round(size * 0.52)} weight="fill" />
  </div>
{/if}

<style>
  .ext-icon-fallback {
    display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-md);
    background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    color: var(--text-faint);
    flex-shrink: 0;
  }
</style>
