import type { Settings } from "$lib/types/settings";
import type { Manga } from "$lib/types";
import type { SearchResult, Extension } from "$lib/server-adapters/types";
import type { Source } from "$lib/types";
import { shouldHideNsfw } from "$lib/core/util";

export { shouldHideNsfw };

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
  id:            string;
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
  if (genrePart  && !statusPart) return genrePart;
  if (!genrePart && statusPart)  return statusPart;
  return { and: [genrePart, statusPart] };
}

export function filterSourceCache(
  sourceCache: Map<string, CachedManga>,
  tags:        string[],
  mode:        TagMode,
  statuses:    string[],
  settings:    Pick<Settings, "contentLevel" | "sourceOverridesEnabled" | "nsfwAllowedSourceIds" | "nsfwBlockedSourceIds">,
): CachedManga[] {
  return [...sourceCache.values()].filter((m) => {
    if (shouldHideNsfw(m as any, settings)) return false;

    const statusMatch = statuses.length === 0 || statuses.includes(m.status);

    let genreMatch = true;
    if (tags.length > 0) {
      const lower = m.lowerGenres;
      genreMatch = mode === "AND"
        ? tags.every((t) => lower.some((g) => g.includes(t.toLowerCase())))
        : tags.some((t)  => lower.some((g) => g.includes(t.toLowerCase())));
    }

    return statusMatch && genreMatch;
  });
}

export function toCachedManga(
  m:     { id: string; title: string; thumbnailUrl: string | null; inLibrary: boolean; genres?: string[]; status?: string | null },
  srcId: string,
): CachedManga {
  const genre = m.genres ?? [];
  return {
    id:            m.id,
    title:         m.title,
    thumbnailUrl:  m.thumbnailUrl ?? "",
    inLibrary:     m.inLibrary,
    status:        m.status ?? "UNKNOWN",
    genre,
    lowerGenres:   genre.map((g) => g.toLowerCase()),
    sourceId:      srcId,
    genreEnriched: genre.length > 0,
  };
}

export function toBrowseManga(r: SearchResult, extensionId: string, sourceId?: string): Manga {
  return {
    id:             r.id ?? `${extensionId}-${r.externalId}`,
    title:          r.title,
    thumbnailUrl:   r.thumbnailUrl ?? "",
    inLibrary:      r.inLibrary,
    status:         r.status ?? undefined,
    genre:          r.genres,
    sourceId:       sourceId ?? extensionId,
    sourceEntryId:  r.externalId,
    extensionId,
    libraryEntryId: r.inLibrary ? r.id : null,
  };
}

export async function resolveMangaDetail(
  m: Manga,
  tsunagu: {
    libraryEntry: (id: string) => Promise<any>;
    sourceDetails: (extensionId: string, sourceEntryId: string) => Promise<any>;
    mangaInfo: (extensionId: string, sourceEntryId: string, includeChapters: boolean) => Promise<any>;
  },
): Promise<{ manga: Manga; entry?: any; info?: any } | null> {
  const libraryId = m.libraryEntryId ?? (m.inLibrary ? m.id : null);

  if (libraryId) {
    const entry = await tsunagu.libraryEntry(libraryId);
    if (!entry) return null;
    return {
      manga: {
        id:             entry.id,
        title:          entry.title,
        thumbnailUrl:   entry.thumbnailUrl ?? "",
        inLibrary:      true,
        description:    entry.description,
        status:         entry.status,
        author:         entry.author,
        artist:         entry.artist,
        genre:          entry.genres,
        tags:           entry.tags,
        unreadCount:    entry.unreadCount,
        downloadCount:  entry.downloadCount,
        sourceId:       m.sourceId,
        extensionId:    m.extensionId,
        sourceEntryId:  m.sourceEntryId,
        libraryEntryId: entry.id,
        sourceName:     entry.sourceName ?? m.sourceName ?? null,
        source:         entry.source
          ? { id: entry.source.id, name: entry.source.name, displayName: entry.source.displayName, isNsfw: entry.source.isNsfw, iconUrl: entry.source.iconUrl }
          : null,
      },
      entry,
    };
  }

  if (m.extensionId && m.sourceEntryId) {
    const info = await tsunagu.mangaInfo(m.extensionId, m.sourceEntryId, true);
    if (!info) return null;
    return {
      manga: {
        id:             info.id ?? `${m.extensionId}:${m.sourceEntryId}`,
        title:          info.title,
        thumbnailUrl:   info.thumbnailUrl ?? m.thumbnailUrl,
        inLibrary:      info.inLibrary,
        description:    info.description,
        status:         info.status,
        author:         info.author,
        artist:         info.artist,
        genre:          info.genres,
        tags:           info.tags,
        unreadCount:    info.unreadCount,
        downloadCount:  info.downloadCount,
        sourceId:       m.sourceId,
        sourceEntryId:  m.sourceEntryId,
        extensionId:    m.extensionId,
        libraryEntryId: info.inLibrary ? info.id : null,
        sourceName:     info.sourceName ?? m.sourceName ?? null,
        source:         info.source
          ? { id: info.source.id, name: info.source.displayName, displayName: info.source.displayName, iconUrl: info.source.iconUrl }
          : null,
      },
      info,
    };
  }

  return null;
}

export function toSource(e: Extension): Source {
  return {
    id:             e.id,
    name:           e.name,
    lang:           e.lang,
    displayName:    e.displayName,
    iconUrl:        e.iconUrl ?? "",
    isNsfw:         e.isNsfw,
    isConfigurable: false,

    supportsLatest: e.supportsLatest,
    contentType:    e.contentType,
    extension: { packageName: e.packageName },
  };
}
