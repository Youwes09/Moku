import { settingsState, updateSettings } from '$lib/state/settings.svelte'
import type { Manga } from '$lib/types'

function linkManga(focalId: string, targetId: string) {
  const existing = settingsState.settings.mangaLinks?.[focalId] ?? []
  if (existing.includes(targetId)) return
  updateSettings({
    mangaLinks: {
      ...settingsState.settings.mangaLinks,
      [focalId]: [...existing, targetId],
    },
  })
}

export function autoLinkLibrary(focal: Manga | null | undefined, allManga: Manga[]): Promise<number> {
  if (!focal) return Promise.resolve(0)
  return new Promise(resolve => {
    const worker = new Worker(new URL('./autoLinkWorker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (e: MessageEvent<string[]>) => {
      const matches = e.data
      for (const id of matches) linkManga(focal.id, id)
      worker.terminate()
      resolve(matches.length)
    }

    worker.onerror = () => { worker.terminate(); resolve(0) }

    worker.postMessage({
      focalTitle: focal.title,
      focalId:    focal.id,
      allManga:   allManga.map(m => ({ id: m.id, title: m.title })),
      linkedIds:  settingsState.settings.mangaLinks?.[focal.id] ?? [],
    })
  })
}