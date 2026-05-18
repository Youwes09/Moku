import { store, updateSettings } from "@store/state.svelte";
import { DEFAULT_MANGA_PREFS }   from "@store/state.svelte";
import type { MangaPrefs }       from "@store/state.svelte";

export function getPref<K extends keyof MangaPrefs>(mangaId: number, key: K): MangaPrefs[K] {
  const prefs = store.settings.mangaPrefs?.[mangaId] ?? {};
  return (prefs[key] ?? DEFAULT_MANGA_PREFS[key]) as MangaPrefs[K];
}

export function setPref<K extends keyof MangaPrefs>(mangaId: number, key: K, value: MangaPrefs[K]) {
  updateSettings({
    mangaPrefs: {
      ...store.settings.mangaPrefs,
      [mangaId]: { ...(store.settings.mangaPrefs?.[mangaId] ?? {}), [key]: value },
    },
  });
}
