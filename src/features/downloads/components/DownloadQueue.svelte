<script lang="ts">
  import { CircleNotch } from "phosphor-svelte";
  import DownloadItem from "./DownloadItem.svelte";
  import type { DownloadQueueItem } from "@types/index";

  interface Props {
    queue:      DownloadQueueItem[];
    loading:    boolean;
    isRunning:  boolean;
    dequeueing: Set<number>;
    selected:   Set<number>;
    onRemove:      (chapterId: number) => void;
    onRetry:       (chapterId: number) => void;
    onReorder:     (chapterId: number, dir: "up" | "down") => void;
    onReorderEdge: (chapterId: number, edge: "top" | "bottom") => void;
    onSelect:      (chapterId: number, e: MouseEvent) => void;
  }

  const {
    queue, loading, isRunning, dequeueing, selected,
    onRemove, onRetry, onReorder, onReorderEdge, onSelect,
  }: Props = $props();
</script>

{#if loading}
  <div class="empty">
    <CircleNotch size={16} weight="light" class="anim-spin" style="color:var(--text-faint)" />
  </div>
{:else if queue.length === 0}
  <div class="empty">Queue is empty.</div>
{:else}
  <div class="list">
    {#each queue as item, i (item.chapter.id)}
      <DownloadItem
        {item}
        isActive={i === 0 && isRunning}
        isRemoving={dequeueing.has(item.chapter.id)}
        isSelected={selected.has(item.chapter.id)}
        {onRemove}
        {onRetry}
        {onReorder}
        {onReorderEdge}
        {onSelect}
      />
    {/each}
  </div>
{/if}

<style>
  .list { display: flex; flex-direction: column; gap: var(--sp-2); }
  .empty { display: flex; align-items: center; justify-content: center; height: 160px; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); }
</style>