import { createSorter } from "@core/algorithms/sort";
import type { Manga }   from "@types";
import type { LibrarySortMode, LibrarySortDir } from "@store/state.svelte";

export const librarySorter = createSorter<Manga>({
  defaultField: "az",
  defaultDir:   "asc",
  fields: [
    {
      key: "az",
      comparator: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    },
    {
      key: "unreadCount",
      comparator: (a, b) => (a.unreadCount ?? 0) - (b.unreadCount ?? 0),
    },
    {
      key: "totalChapters",
      comparator: (a, b) => (a.chapters?.totalCount ?? 0) - (b.chapters?.totalCount ?? 0),
    },
    {
      key: "recentlyAdded",
      comparator: (a, b) => Number(a.inLibraryAt ?? 0) - Number(b.inLibraryAt ?? 0),
    },
    {
      key: "recentlyRead",
      comparator: (a, b, ctx) => {
        const map = ctx?.recentlyReadMap as Map<number, number> | undefined;
        const ra  = map?.get(a.id) ?? 0;
        const rb  = map?.get(b.id) ?? 0;
        return ra - rb;
      },
    },
    {
      key: "latestFetched",
      comparator: (a, b) => Number(a.latestFetchedChapter?.uploadDate ?? 0) - Number(b.latestFetchedChapter?.uploadDate ?? 0),
    },
    {
      key: "latestUploaded",
      comparator: (a, b) => Number(a.latestUploadedChapter?.uploadDate ?? 0) - Number(b.latestUploadedChapter?.uploadDate ?? 0),
    },
  ],
});

export function sortLibrary(
  items: Manga[],
  mode: LibrarySortMode,
  dir: LibrarySortDir,
  recentlyReadMap?: Map<number, number>,
): Manga[] {
  return librarySorter.sort(items, mode, dir, recentlyReadMap ? { recentlyReadMap } : undefined);
}