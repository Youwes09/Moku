<script lang="ts">
  import TrackerPanel from '$lib/components/series/panels/TrackerPanel.svelte'
  import { trackingState } from '$lib/state/tracking.svelte'
  import type { FlatRecord } from '$lib/components/tracking/lib/trackingSync'
  import type { Manga } from '$lib/types'

  interface Props {
    record:  FlatRecord
    onClose: () => void
  }
  let { record, onClose }: Props = $props()

  const manga = $derived({
    id: record.media.id,
    title: record.media.title,
    thumbnailUrl: record.media.thumbnailUrl ?? '',
    contentType: record.media.contentType,
  } as unknown as Manga)
</script>

<TrackerPanel
  mediaId={record.media.id}
  {manga}
  links={record.media.trackLinks}
  onClose={onClose}
  onChanged={() => trackingState.loadAll(true)}
/>
