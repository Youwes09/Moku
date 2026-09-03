import { tsunagu } from '$lib/server-adapters/tsunagu'
import { seriesState } from '$lib/state/series.svelte'
import { settingsState, updateSettings } from '$lib/state/settings.svelte'
import type { Chapter, LibraryEntry } from '$lib/server-adapters/types'

const numKey = (n: number) => Math.round(n * 100)
const prefsKey = (extId: string | null, extExternalId: string) => (extId ? `${extId}:${extExternalId}` : '')

async function resolveExtensionId(idOrPkg: string): Promise<string> {
	if (/^\d+$/.test(idOrPkg)) return idOrPkg
	const exts = await tsunagu.installedExtensions()
	const hit = exts.find((e) => e.packageName === idOrPkg || e.id === idOrPkg)
	if (!hit) throw new Error(`Unknown migration target: ${idOrPkg}`)
	return hit.id
}

export interface MigrateResult {
	entry: LibraryEntry
	newChapters: Chapter[]
}

export async function migrateMedia(
	fromMediaId: string,
	toExtensionId: string,
	toExternalId: string,
): Promise<MigrateResult> {
	const src = await tsunagu.libraryEntry(fromMediaId)

	const extId = await resolveExtensionId(toExtensionId)
	const entry = await tsunagu.migrateMedia(fromMediaId, extId, toExternalId)
	const newChapters = entry.chapters ?? []

	if (src) {
		const oldNumById = new Map((src.chapters ?? []).map((c) => [c.id, c.number ?? -1]))
		const numToNew = new Map<number, string>()
		for (const c of newChapters) {
			const n = c.number ?? -1
			if (n >= 0 && !numToNew.has(numKey(n))) numToNew.set(numKey(n), c.id)
		}

		seriesState.bookmarks = seriesState.bookmarks
			.map((b) => {
				if (b.mangaId !== fromMediaId) return b
				const n = oldNumById.get(b.chapterId) ?? -1
				const nc = n >= 0 ? numToNew.get(numKey(n)) : undefined
				return nc
					? { ...b, mangaId: entry.id, chapterId: nc, mangaTitle: entry.title, thumbnailUrl: entry.thumbnailUrl ?? b.thumbnailUrl }
					: null
			})
			.filter((b): b is NonNullable<typeof b> => b != null)

		const oldKey = prefsKey(src.extensionId, src.externalId)
		const newKey = prefsKey(entry.extensionId, entry.externalId)
		const prefs = settingsState.settings.mangaPrefs ?? {}
		if (oldKey && newKey && prefs[oldKey] && !prefs[newKey]) {
			updateSettings({ mangaPrefs: { ...prefs, [newKey]: prefs[oldKey] } })
		}
	}

	return { entry, newChapters }
}
