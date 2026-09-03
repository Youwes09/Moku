export interface LibraryManga {
  id: string;
  title: string;
  thumbnailUrl: string;
  unreadCount: number;
  downloadCount: number;
  contentType?: string | null;
  source: { id: string; displayName: string } | null;
}

export interface SourceNode {
  id:          string;
  displayName: string;
  iconUrl?:    string | null;
}

export interface SourceLibrary {
  sourceId: string;
  displayName: string;
  manga: LibraryManga[];
}

export function libraryByExtension(
  libraryManga: LibraryManga[],
  pkgNameOf:     (sourceId: string) => string | undefined,
  pkgName:       string,
): SourceLibrary[] {
  const bySource = new Map<string, { displayName: string; manga: LibraryManga[] }>();
  for (const m of libraryManga) {
    if (!m.source) continue;
    if (pkgNameOf(m.source.id) !== pkgName) continue;
    if (!bySource.has(m.source.id)) bySource.set(m.source.id, { displayName: m.source.displayName, manga: [] });
    bySource.get(m.source.id)!.manga.push(m);
  }
  return Array.from(bySource.entries())
    .map(([sourceId, g]) => ({ sourceId, displayName: g.displayName, manga: g.manga }))
    .filter(g => g.manga.length > 0);
}

export function libraryCountByPkg(
  libraryManga: LibraryManga[],
  pkgNameOf:     (sourceId: string) => string | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of libraryManga) {
    if (!m.source) continue;
    const pkg = pkgNameOf(m.source.id);
    if (pkg) counts[pkg] = (counts[pkg] ?? 0) + 1;
  }
  return counts;
}
