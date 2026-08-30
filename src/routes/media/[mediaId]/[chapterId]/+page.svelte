<script lang="ts">
  import { page }        from "$app/stores";
  import { goto }        from "$app/navigation";
  import { readerState } from "$lib/state/mangaReader.svelte";
  import { seriesState, resolveMediaId }  from "$lib/state/series.svelte";
  import { tsunagu }      from "$lib/server-adapters/tsunagu";
  import MediaViewer     from "$lib/components/media/MediaViewer.svelte";

  const mediaId   = $derived($page.params.mediaId);
  const chapterId = $derived($page.params.chapterId);

  let booted = $state(false);
  let error  = $state<string | null>(null);

  $effect(() => {
    const mId = mediaId;
    const cId = chapterId;
    if (!mId || !cId) { error = "Invalid route params"; return; }

    const alreadyLoaded =
      readerState.activeChapter?.id      === cId &&
      readerState.activeManga?.id        === mId &&
      readerState.activeManga?.contentType != null &&
      readerState.activeChapterList.length > 0;

    if (alreadyLoaded) { booted = true; return; }

    let cancelled = false;

    (async () => {
      try {
        const realId = await resolveMediaId(mId);
        if (cancelled) return;
        if (realId !== mId) {
          goto(`/media/${encodeURIComponent(realId)}/${encodeURIComponent(cId)}`, { replaceState: true });
          return;
        }

        const entry = await tsunagu.libraryEntry(realId);
        if (cancelled) return;
        if (!entry) throw new Error(`Manga ${realId} not found`);
        seriesState.ingestEntry(realId, entry);

        await seriesState.loadChapters(realId, { mediaId: realId });
        if (cancelled) return;

        const chapterList = seriesState.chaptersFor(realId);
        const chapter = chapterList.find(c => c.id === cId);
        if (!chapter) throw new Error(`Chapter ${cId} not found in chapter list`);

        seriesState.setActiveManga({
          id: entry.id,
          mediaId: entry.id,
          libraryEntryId: entry.id,
          prefsKey: entry.extensionId ? `${entry.extensionId}:${entry.externalId}` : String(entry.id),
          contentType: entry.contentType,
          title: entry.title,
          thumbnailUrl: entry.thumbnailUrl ?? "",
          inLibrary: entry.inLibrary ?? true,
          description: entry.description,
          status: entry.status,
          author: entry.author,
          artist: entry.artist,
          genre: entry.genres,
          tags: entry.tags,
        });
        readerState.activeChapter     = chapter;
        booted = true;
      } catch (e) {
        if (!cancelled) error = e instanceof Error ? e.message : String(e);
      }
    })();

    return () => { cancelled = true; };
  });
</script>

{#if error}
  <div class="error">
    <p>{error}</p>
    <button onclick={() => goto(-1 as any)}>Go back</button>
  </div>
{:else if booted}
  <MediaViewer />
{:else}
  <div class="spinner" aria-label="Loading…"></div>
{/if}

<style>
  .error {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    background: #000;
    color: #fff;
    font-family: sans-serif;
  }

  .error button {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    border: 1px solid #555;
    background: transparent;
    color: #fff;
    cursor: pointer;
  }

  .spinner {
    position: fixed;
    inset: 0;
    background: #000;
  }
</style>
