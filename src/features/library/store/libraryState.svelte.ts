import { store, updateSettings, setCategories, setLibraryUpdates, addToast } from "@store/state.svelte";
import type { LibrarySortMode, LibrarySortDir, LibraryStatusFilter, LibraryContentFilter } from "@store/state.svelte";
import type { Category } from "@types";

export { store };

export function setTabSort(tab: string, mode: LibrarySortMode, dir?: LibrarySortDir) {
  const prev   = store.settings.libraryTabSort[tab];
  const newDir = dir ?? prev?.dir ?? "asc";
  updateSettings({
    libraryTabSort: { ...store.settings.libraryTabSort, [tab]: { mode, dir: newDir } },
  });
}

export function toggleTabSortDir(tab: string) {
  const prev = store.settings.libraryTabSort[tab];
  const mode = prev?.mode ?? "az";
  const dir  = prev?.dir  === "asc" ? "desc" : "asc";
  setTabSort(tab, mode, dir);
}

export function setTabStatus(tab: string, status: LibraryStatusFilter) {
  updateSettings({
    libraryTabStatus: { ...store.settings.libraryTabStatus, [tab]: status },
  });
}

export function toggleTabFilter(tab: string, filter: LibraryContentFilter) {
  const current = store.settings.libraryTabFilters?.[tab] ?? {};
  updateSettings({
    libraryTabFilters: {
      ...(store.settings.libraryTabFilters ?? {}),
      [tab]: { ...current, [filter]: !current[filter] },
    },
  });
}

export function clearTabFilters(tab: string) {
  updateSettings({
    libraryTabStatus: { ...store.settings.libraryTabStatus, [tab]: "ALL" },
    libraryTabFilters: { ...(store.settings.libraryTabFilters ?? {}), [tab]: {} },
  });
}

export { setCategories, setLibraryUpdates, addToast };
