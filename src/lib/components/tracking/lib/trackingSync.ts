import type { Tracker, TrackLink } from '$lib/server-adapters/types'
import type { TrackedMedia } from '$lib/server-adapters/tsunagu/trackers'
import { statusesFor } from '$lib/state/trackers.svelte'

export type SortKey = 'title' | 'status' | 'score' | 'progress'

export interface FlatRecord {
	id: string
	link: TrackLink
	media: TrackedMedia
	tracker: Tracker
	title: string
	status: number
	statusName: string
	score: number
	lastChapterRead: number
	totalChapters: number
	thumbnailUrl: string | null
	url: string
}

export function flattenRecords(media: TrackedMedia[], trackers: Tracker[]): FlatRecord[] {
	const byKey = new Map(trackers.map((t) => [t.key, t]))
	const out: FlatRecord[] = []
	for (const m of media) {
		for (const link of m.trackLinks ?? []) {
			const tracker = byKey.get(link.trackerKey)
			if (!tracker) continue
			out.push({
				id: link.id,
				link,
				media: m,
				tracker,
				title: link.title || m.title,
				status: link.status,
				statusName: link.statusName,
				score: link.score,
				lastChapterRead: link.lastChapterRead,
				totalChapters: link.totalChapters,
				thumbnailUrl: m.thumbnailUrl,
				url: link.url,
			})
		}
	}
	return out
}

export function filterRecords(
	records: FlatRecord[],
	trackerKey: string | 'all',
	status: number | 'all',
	query: string,
): FlatRecord[] {
	const needle = query.trim().toLowerCase()
	return records.filter(
		(r) =>
			(trackerKey === 'all' || r.tracker.key === trackerKey) &&
			(status === 'all' || r.status === status) &&
			(!needle || r.title.toLowerCase().includes(needle)),
	)
}

export function sortRecords(records: FlatRecord[], key: SortKey): FlatRecord[] {
	const byTitle = (a: FlatRecord, b: FlatRecord) => a.title.localeCompare(b.title)
	const copy = [...records]
	switch (key) {
		case 'status':
			return copy.sort((a, b) => a.status - b.status || byTitle(a, b))
		case 'score':
			return copy.sort((a, b) => b.score - a.score || byTitle(a, b))
		case 'progress':
			return copy.sort(
				(a, b) =>
					(calcProgress(b.lastChapterRead, b.totalChapters) ?? -1) -
						(calcProgress(a.lastChapterRead, a.totalChapters) ?? -1) || byTitle(a, b),
			)
		default:
			return copy.sort(byTitle)
	}
}

export function dedupeStatuses(trackers: Tracker[]): { value: number; name: string }[] {
	const seen = new Map<number, string>()
	for (const t of trackers) {
		for (const s of statusesFor(t)) if (!seen.has(s.value)) seen.set(s.value, s.label)
	}
	return [...seen].map(([value, name]) => ({ value, name }))
}

export function calcProgress(read: number, total: number): number | null {
	if (!total || total <= 0) return null
	return Math.min(100, Math.round((read / total) * 100))
}
