import type { Settings } from "@types";
import { shouldHideNsfw } from "@core/util";

export const PAGE_SIZE     = 50;
export const INITIAL_PAGES = 3;
export const MAX_SOURCES   = 12;
export const CONCURRENCY   = 4;

export function parseTags(f: string): string[] {
  return f.split("+").map((t) => t.trim()).filter(Boolean);
}

export function tagsLabel(tags: string[]): string {
  if (tags.length === 1) return tags[0];
  return tags.slice(0, -1).join(", ") + " & " + tags[tags.length - 1];
}

export function matchesAllTags(m: { genre?: string[] }, tags: string[]): boolean {
  const g = (m.genre ?? []).map((x) => x.toLowerCase());
  return tags.every((t) => g.includes(t.toLowerCase()));
}

export async function runConcurrent<T>(
  items:  T[],
  fn:     (item: T) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      if (signal.aborted) return;
      await fn(items[i++]).catch(() => {});
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

export type TagMode = "AND" | "OR";

export interface CachedManga {
  id:            number;
  title:         string;
  thumbnailUrl:  string;
  inLibrary:     boolean;
  status:        string;
  genre:         string[];
  lowerGenres:   string[];
  sourceId:      string;
  genreEnriched: boolean;
}

export const COMMON_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Romance",
  "Sci-Fi", "Slice of Life", "Horror", "Mystery", "Thriller", "Sports",
  "Supernatural", "Mecha", "Historical", "Psychological", "School Life",
  "Shounen", "Seinen", "Josei", "Shoujo", "Isekai", "Martial Arts",
  "Magic", "Music", "Cooking", "Medical", "Military", "Harem", "Ecchi",
] as const;

export const MANGA_STATUSES: { value: string; label: string }[] = [
  { value: "ONGOING",   label: "Ongoing"   },
  { value: "COMPLETED", label: "Completed" },
  { value: "HIATUS",    label: "Hiatus"    },
  { value: "ABANDONED", label: "Abandoned" },
  { value: "UNKNOWN",   label: "Unknown"   },
];

export function buildTagFilter(
  tags:     string[],
  mode:     TagMode,
  statuses: string[],
): Record<string, unknown> {
  const genrePart: Record<string, unknown> | null =
    tags.length === 0 ? null :
    mode === "AND"
      ? { and: tags.map((t) => ({ genre: { includesInsensitive: t } })) }
      : { or:  tags.map((t) => ({ genre: { includesInsensitive: t } })) };

  const statusPart: Record<string, unknown> | null =
    statuses.length === 0 ? null :
    statuses.length === 1
      ? { status: { equalTo: statuses[0] } }
      : { or: statuses.map((s) => ({ status: { equalTo: s } })) };

  if (!genrePart && !statusPart) return {};
  if (genrePart && !statusPart)  return genrePart;
  if (!genrePart && statusPart)  return statusPart;
  return { and: [genrePart, statusPart] };
}

export function filterSourceCache(
  sourceCache: Map<number, CachedManga>,
  tags:        string[],
  mode:        TagMode,
  statuses:    string[],
  settings:    Pick<Settings, "contentLevel" | "sourceOverridesEnabled" | "nsfwAllowedSourceIds" | "nsfwBlockedSourceIds">,
): CachedManga[] {
  return [...sourceCache.values()].filter((m) => {
    if (shouldHideNsfw(m as any, settings)) return false;

    const statusMatch =
      statuses.length === 0 || statuses.includes(m.status);

    let genreMatch = true;
    if (tags.length > 0) {
      const lower = m.lowerGenres;
      if (mode === "AND") {
        genreMatch = tags.every((t) => lower.some((g) => g.includes(t.toLowerCase())));
      } else {
        genreMatch = tags.some((t) => lower.some((g) => g.includes(t.toLowerCase())));
      }
    }

    return statusMatch && genreMatch;
  });
}

export function toCachedManga(
  m:      { id: number; title: string; thumbnailUrl: string; inLibrary: boolean; genre?: string[]; status?: string },
  srcId:  string,
): CachedManga {
  const genre = m.genre ?? [];
  return {
    id:            m.id,
    title:         m.title,
    thumbnailUrl:  m.thumbnailUrl,
    inLibrary:     m.inLibrary,
    status:        m.status ?? "UNKNOWN",
    genre,
    lowerGenres:   genre.map((g) => g.toLowerCase()),
    sourceId:      srcId,
    genreEnriched: genre.length > 0,
  };
}