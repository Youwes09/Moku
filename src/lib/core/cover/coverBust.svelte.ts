export const coverBust = $state<Record<string, number>>({})

export function bustCover(...ids: Array<string | number | null | undefined>): void {
	const now = Date.now()
	for (const id of ids) {
		if (id == null || id === '') continue
		coverBust[String(id)] = now
	}
}
