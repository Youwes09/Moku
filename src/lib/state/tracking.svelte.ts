import { tsunagu } from '$lib/server-adapters/tsunagu'
import type { TrackedMedia } from '$lib/server-adapters/tsunagu/trackers'
import { trackerState } from '$lib/state/trackers.svelte'

class TrackingState {
	media   = $state<TrackedMedia[]>([])
	loading = $state(false)
	error   = $state<string | null>(null)

	#loaded = false

	get allTrackers() { return trackerState.list }
	get loadingAll()  { return this.loading || trackerState.loading }

	async loadAll(force = false): Promise<void> {
		if (this.loading) return
		if (this.#loaded && !force) return
		this.loading = true
		this.error = null
		try {
			const [media] = await Promise.all([
				tsunagu.trackedMedia(),
				trackerState.load(force),
			])
			this.media = media
			this.#loaded = true
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e)
		} finally {
			this.loading = false
		}
	}
}

export const trackingState = new TrackingState()
