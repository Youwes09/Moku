const LS_KEY = 'moku.coverBust'

type BustState = { all: number; ids: Record<string, number> }

function load(): BustState {
	try {
		const raw = localStorage.getItem(LS_KEY)
		if (raw) {
			const p = JSON.parse(raw)
			return {
				all: Number(p?.all) || 0,
				ids: p?.ids && typeof p.ids === 'object' ? p.ids : {},
			}
		}
	} catch {
	}
	return { all: 0, ids: {} }
}

export const coverBust = $state<BustState>(load())

function persist(): void {
	try {
		localStorage.setItem(LS_KEY, JSON.stringify({ all: coverBust.all, ids: coverBust.ids }))
	} catch {
	}
}

export function bustCover(...ids: Array<string | number | null | undefined>): void {
	const now = Date.now()
	coverBust.all = now
	for (const id of ids) {
		if (id == null || id === '') continue
		coverBust.ids[String(id)] = now
	}
	persist()
}

export function coverBustToken(key: string | null): number {
	if (key != null && coverBust.ids[key]) return coverBust.ids[key]
	return coverBust.all
}
