<script lang="ts">
  import { seriesState } from "$lib/state/series.svelte";
  import MangaReader from "$lib/components/media/manga/MangaReader.svelte";
  import NovelReader from "$lib/components/media/novel/NovelReader.svelte";
  import AnimePlayer from "$lib/components/media/anime/AnimePlayer.svelte";

  const contentType = $derived(seriesState.activeManga?.contentType ?? "MANGA");
</script>

{#if contentType === "NOVEL"}
  <NovelReader />
{:else if contentType === "ANIME"}
  <AnimePlayer />
{:else}
  <MangaReader />
{/if}
