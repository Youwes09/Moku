export interface LibraryManga {
  id: number;
  title: string;
  thumbnailUrl: string;
  unreadCount: number;
  downloadCount: number;
  source: { id: string; displayName: string };
}

export interface SourceLibrary {
  sourceId: string;
  displayName: string;
  manga: LibraryManga[];
}

export type SourceNode = {
  id: string;
  displayName: string;
  isConfigurable: boolean;
  extension: { pkgName: string };
};

export function libraryByExtension(
  libraryManga: LibraryManga[],
  sources: SourceNode[],
  pkgName: string,
): SourceLibrary[] {
  const pkgSources = sources.filter(s => s.extension?.pkgName === pkgName);
  const sourceIds  = new Set(pkgSources.map(s => s.id));

  const bySource = new Map<string, LibraryManga[]>();
  for (const src of pkgSources) bySource.set(src.id, []);
  for (const m of libraryManga) {
    if (sourceIds.has(m.source.id)) bySource.get(m.source.id)!.push(m);
  }

  return pkgSources
    .map(src => ({ sourceId: src.id, displayName: src.displayName, manga: bySource.get(src.id)! }))
    .filter(g => g.manga.length > 0);
}

export function libraryCountByPkg(
  libraryManga: LibraryManga[],
  sources: SourceNode[],
): Record<string, number> {
  const sourceIdToPkg = new Map<string, string>();
  for (const s of sources) {
    if (s.extension?.pkgName) sourceIdToPkg.set(s.id, s.extension.pkgName);
  }
  const counts: Record<string, number> = {};
  for (const m of libraryManga) {
    const pkg = sourceIdToPkg.get(m.source.id);
    if (pkg) counts[pkg] = (counts[pkg] ?? 0) + 1;
  }
  return counts;
}