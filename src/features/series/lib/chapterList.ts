import type { Chapter } from "@types";

export type ChapterSortMode = "source" | "chapterNumber" | "uploadDate";
export type ChapterSortDir  = "asc" | "desc";

export interface ChapterDisplayPrefs {
  sortMode?:            ChapterSortMode;
  sortDir?:             ChapterSortDir;
  preferredScanlator?:  string;
  scanlatorFilter?:     string[];
  scanlatorBlacklist?:  string[];
  scanlatorForce?:      boolean;
}

function sortByMode(a: Chapter, b: Chapter, mode: ChapterSortMode): number {
  if (mode === "chapterNumber") return a.chapterNumber - b.chapterNumber;
  if (mode === "uploadDate")    return Number(a.uploadDate ?? 0) - Number(b.uploadDate ?? 0);
  return a.sourceOrder - b.sourceOrder;
}

export function buildChapterList(chapters: Chapter[], prefs: ChapterDisplayPrefs = {}): Chapter[] {
  const {
    sortMode          = "source",
    sortDir           = "asc",
    preferredScanlator = "",
    scanlatorFilter   = [],
    scanlatorBlacklist = [],
    scanlatorForce    = false,
  } = prefs;

  let base = [...chapters];

  if (scanlatorBlacklist.length > 0) {
    base = base.filter(c => !scanlatorBlacklist.includes(c.scanlator ?? ""));
  }

  base.sort((a, b) => sortByMode(a, b, sortMode));

  if (preferredScanlator) {
    const pref: Chapter[] = [], rest: Chapter[] = [];
    for (const c of base) (c.scanlator === preferredScanlator ? pref : rest).push(c);
    base = [...pref, ...rest];
  }

  if (scanlatorFilter.length > 0) {
    const seen = new Map<number, Chapter>();
    for (const ch of base) {
      const existing = seen.get(ch.chapterNumber);
      if (!existing) {
        if (!scanlatorForce || scanlatorFilter.includes(ch.scanlator ?? "")) {
          seen.set(ch.chapterNumber, ch);
        }
      } else {
        const np = scanlatorFilter.indexOf(ch.scanlator ?? "");
        const op = scanlatorFilter.indexOf(existing.scanlator ?? "");
        if (np !== -1 && (op === -1 || np < op)) seen.set(ch.chapterNumber, ch);
      }
    }
    base = [...seen.values()].sort((a, b) => sortByMode(a, b, sortMode));
  }

  return sortDir === "desc" ? base.reverse() : base;
}

export function chaptersAscending(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.sourceOrder - b.sourceOrder);
}

export function buildReaderChapterList(
  chapters:  Chapter[],
  prefs:     Pick<ChapterDisplayPrefs, "preferredScanlator" | "scanlatorFilter"> | undefined,
): Chapter[] {
  return buildChapterList(chapters, {
    sortMode: "source",
    sortDir:  "asc",
    preferredScanlator: prefs?.preferredScanlator,
    scanlatorFilter:    prefs?.scanlatorFilter,
  });
}