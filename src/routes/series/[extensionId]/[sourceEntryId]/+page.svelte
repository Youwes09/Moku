<script lang="ts">
  import { page }       from '$app/stores'
  import SeriesDetail   from '$lib/components/series/SeriesDetail.svelte'

  const extensionId   = $derived(decodeURIComponent($page.params.extensionId ?? ''))
  const sourceEntryId = $derived(decodeURIComponent($page.params.sourceEntryId ?? ''))
  const mid = $derived($page.url.searchParams.get('mid') ?? undefined)
</script>

<SeriesDetail {extensionId} {sourceEntryId} {mid} />
