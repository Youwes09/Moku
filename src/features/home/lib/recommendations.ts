import { gql } from "@api/client";
import { MANGAS_BY_GENRE } from "@api/queries/manga";
import { buildTagFilter } from "@features/discover/lib/searchFilter";
import type { Manga } from "@types";
import type { HistoryEntry } from "@store/state.svelte";

export interface RecommendedManga {
  manga:         Manga;
  matchedGenres: string[];
}

const TOP_GENRES        = 6;
const PAGE_SIZE         = 100;
const MAX_PAGES         = 10;
const TARGET_PER_GENRE  = 20;
const EXCLUDED_STATUSES = ["CANCELLED", "ABANDONED"];

export function topGenres(history: HistoryEntry[], libraryManga: Manga[]): string[] {
  const byId  = new Map(libraryManga.map(m => [m.id, m]));
  const tally = new Map<string, { count: number; original: string }>();

  for (const entry of history) {
    const manga = byId.get(entry.mangaId);
    if (!manga?.genre?.length) continue;
    for (const g of manga.genre) {
      const key      = g.toLowerCase();
      const existing = tally.get(key);
      if (existing) { existing.count++; }
      else { tally.set(key, { count: 1, original: g }); }
    }
  }

  return [...tally.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_GENRES)
    .map(e => e.original);
}

type Result = { mangas: { nodes: Manga[] } };

async function fetchGenrePages(
  genre:      string,
  globalSeen: Set<number>,
  signal?:    AbortSignal,
): Promise<Manga[]> {
  const filter = {
    and: [
      buildTagFilter([genre], "OR", []),
      { inLibrary: { equalTo: false } },
    ],
  };

  const localSeen = new Set<number>();
  const nodes: Manga[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) break;

    let batch: Manga[];
    try {
      const d = await gql<Result>(MANGAS_BY_GENRE, { filter, first: PAGE_SIZE, offset: page * PAGE_SIZE }, signal);
      batch = d.mangas.nodes;
    } catch {
      break;
    }

    if (!batch.length) break;

    for (const m of batch) {
      if (localSeen.has(m.id) || globalSeen.has(m.id)) continue;
      if (EXCLUDED_STATUSES.includes(m.status ?? "")) continue;
      localSeen.add(m.id);
      nodes.push(m);
    }

    if (nodes.length >= TARGET_PER_GENRE) break;
    if (batch.length < PAGE_SIZE) break;
  }

  return nodes;
}

export async function fetchRecommendations(
  history:      HistoryEntry[],
  libraryManga: Manga[],
  signal?:      AbortSignal,
): Promise<RecommendedManga[]> {
  if (!history.length || !libraryManga.length) return [];

  const genres = topGenres(history, libraryManga);
  if (!genres.length) return [];

  const globalSeen = new Set<number>();
  const merged: Manga[] = [];

  for (const genre of genres) {
    const results = await fetchGenrePages(genre, globalSeen, signal);
    for (const m of results) {
      globalSeen.add(m.id);
      merged.push(m);
    }
  }

  return merged.map(m => ({
    manga: m,
    matchedGenres: (m.genre ?? []).filter(g =>
      genres.some(tg => tg.toLowerCase() === g.toLowerCase())
    ),
  }));
}