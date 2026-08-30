import { historyState } from '$lib/state/history.svelte'

export const homeState = $state({
  heroSlots: [null, null, null, null] as [string | null, string | null, string | null, string | null],
})

export function setHeroSlot(i: 0 | 1 | 2 | 3, mangaId: string | null) {
  homeState.heroSlots[i] = mangaId
}

export function clearHistory() {
  historyState.clearHistory()
}
