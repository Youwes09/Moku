import type { Manga }  from "$lib/types";
import type { Folder, LibraryEntry } from "$lib/server-adapters/types";
import { settingsState, updateSettings } from "$lib/state/settings.svelte";
import { tsunagu } from "$lib/server-adapters/tsunagu";

export type LibrarySortOption =
  | "az"
  | "unreadCount"
  | "lastRead"
  | "dateAdded"
  | "totalChapters"
  | "latestFetched"
  | "latestUploaded";

export type LibrarySortDir = "asc" | "desc";

export type LibraryContentFilter = "unread" | "started" | "downloaded" | "bookmarked";

export type LibraryViewMode = "grid" | "list";

export type LibraryStatusFilter =
  | "ALL"
  | "ONGOING"
  | "COMPLETED"
  | "ON_HIATUS"
  | "CANCELLED"
  | "PUBLISHING_FINISHED";

class LibraryState {
  items   = $state<Manga[]>([]);
  folders = $state<Folder[]>([]);
  folderMembership = $state<Record<string, Manga[]>>({});
  loading    = $state(false);
  error      = $state<string | null>(null);
  refreshing = $state(false);

  tab = $state<string>("library");

  tabSort    = $state<Record<string, { mode: LibrarySortOption; dir: LibrarySortDir }>>({});
  tabStatus  = $state<Record<string, LibraryStatusFilter>>({});
  tabFilters = $state<Record<string, Partial<Record<LibraryContentFilter, boolean>>>>({});

  hiddenTabs            = $state<Set<string>>(new Set());
  pinnedTabOrder        = $state<string[]>([]);
  defaultFolderId       = $state<string | null>(null);
  showAllInSaved        = $state(true);
  hideCompletedInSaved  = $state(false);
  folderFrecency        = $state<Record<string, number>>({});
  viewMode              = $state<LibraryViewMode>("grid");

  filter = $state({ query: "" });

  selected   = $state(new Set<string>());
  selectMode = $state(false);

  refreshProgress   = $state({ finished: 0, total: 0 });
  refreshDone       = $state(false);

  refreshingMangaId  = $state<string | null>(null);
  refreshingFolderId = $state<string | null>(null);

  private tabInitialized = false;

  readonly COMPLETED_NAME = "Completed";

  get completedFolderId(): string | null {
    return this.folders.find(f => f.name === this.COMPLETED_NAME)?.id ?? null;
  }

  get folderMangaMap(): Map<string, Manga[]> {
    const map = new Map<string, Manga[]>();
    for (const folder of this.folders) {
      map.set(folder.id, this.folderMembership[folder.id] ?? []);
    }
    return map;
  }

  get uncategorizedManga(): Manga[] {
    const inAnyFolder = new Set<string>();
    for (const mangas of Object.values(this.folderMembership)) {
      for (const m of mangas) inAnyFolder.add(m.id);
    }
    return this.items.filter(m => m.inLibrary && !inAnyFolder.has(m.id));
  }

  get allTabIds(): string[] {
    const folderIds = this.folders.map(f => f.id);
    const BUILTIN    = ["library", "downloaded"];
    const known      = new Set([...BUILTIN, ...folderIds]);
    const ordered: string[] = [];
    const inOrder = new Set<string>();
    for (const id of this.pinnedTabOrder) {
      if (known.has(id) && !inOrder.has(id)) { ordered.push(id); inOrder.add(id); }
    }
    for (const id of [...BUILTIN, ...folderIds]) {
      if (!inOrder.has(id)) { ordered.push(id); inOrder.add(id); }
    }
    return ordered;
  }

  get visibleTabIds(): string[] {
    return this.allTabIds.filter(id => !this.hiddenTabs.has(id));
  }

  get visibleFolders(): Folder[] {
    const pinned   = this.pinnedTabOrder;
    const defId    = this.defaultFolderId;
    const folders  = this.folders.filter(f => !this.hiddenTabs.has(f.id));
    const pinOrder = (id: string) => { const i = pinned.indexOf(id); return i === -1 ? Infinity : i; };
    return [...folders].sort((a, b) => {
      if (a.id === defId) return -1;
      if (b.id === defId) return  1;
      const pd = pinOrder(a.id) - pinOrder(b.id);
      return pd !== 0 ? pd : a.sortOrder - b.sortOrder;
    });
  }

  private matchesContentType = (m: Manga): boolean => {
    const ct = settingsState.settings.contentTypeFilter;
    return !ct || ct === "all" || m.contentType === ct;
  };

  get counts(): Record<string, number> {
    const inType = (arr: Manga[]) => arr.filter(this.matchesContentType);
    const m: Record<string, number> = {
      library:    this.showAllInSaved
        ? inType(this.items.filter(x => x.inLibrary)).length
        : inType(this.uncategorizedManga).length,
      downloaded: inType(this.items.filter(x => (x.downloadCount ?? 0) > 0)).length,
    };
    for (const folder of this.visibleFolders) {
      m[folder.id] = inType(this.folderMangaMap.get(folder.id) ?? []).length;
    }
    return m;
  }

  filteredItems = $derived.by(() => {
    const tab = this.tab;

    let items: Manga[];
    if (tab === "library") {
      items = this.showAllInSaved
        ? this.items.filter(m => m.inLibrary)
        : this.uncategorizedManga;

      if (this.showAllInSaved && this.hideCompletedInSaved) {
        const completedFolder = this.folders.find(f => f.name === this.COMPLETED_NAME);
        if (completedFolder) {
          const completedIds = new Set((this.folderMangaMap.get(completedFolder.id) ?? []).map(m => m.id));
          items = items.filter(m => !completedIds.has(m.id));
        }
      }
    } else if (tab === "downloaded") {
      items = this.items.filter(m => (m.downloadCount ?? 0) > 0);
    } else {
      items = this.folderMangaMap.get(tab) ?? [];
    }

    const ct = settingsState.settings.contentTypeFilter;
    if (ct && ct !== "all") items = items.filter(m => m.contentType === ct);

    const q = this.filter.query.trim().toLowerCase();
    if (q) items = items.filter(m => m.title.toLowerCase().includes(q));

    const status = this.tabStatus[tab] ?? "ALL";
    if (status !== "ALL") {
      items = items.filter(m => {
        const s = m.status?.toUpperCase().replace(/\s+/g, "_") ?? "UNKNOWN";
        return s === status;
      });
    }

    const f = this.tabFilters[tab] ?? {};
    if (f.unread)     items = items.filter(m => (m.unreadCount ?? 0) > 0);
    if (f.started)    items = items.filter(m => (m.unreadCount ?? 0) > 0 && (m.chapters?.totalCount ?? 0) > (m.unreadCount ?? 0));
    if (f.downloaded) items = items.filter(m => (m.downloadCount ?? 0) > 0);
    if (f.bookmarked) items = items.filter(m => (m.bookmarkCount ?? 0) > 0);

    const { mode, dir } = this.tabSort[tab] ?? { mode: "az" as LibrarySortOption, dir: "asc" as LibrarySortDir };

    const sorted = [...items].sort((a, b) => {
      switch (mode) {
        case "unreadCount":    return (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
        case "lastRead":       return (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0);
        case "dateAdded":      return (b.addedAt ?? 0) - (a.addedAt ?? 0);
        case "totalChapters":  return (b.chapters?.totalCount ?? 0) - (a.chapters?.totalCount ?? 0);
        case "latestFetched":  return Number(b.latestFetchedChapter?.uploadDate ?? 0) - Number(a.latestFetchedChapter?.uploadDate ?? 0);
        case "latestUploaded": return Number(b.latestUploadedChapter?.uploadDate ?? 0) - Number(a.latestUploadedChapter?.uploadDate ?? 0);
        default:               return a.title.localeCompare(b.title);
      }
    });

    return dir === "desc" ? sorted.reverse() : sorted;
  });

  get hasActiveFilters(): boolean {
    const tab     = this.tab;
    const status  = this.tabStatus[tab]  ?? "ALL";
    const filters = this.tabFilters[tab] ?? {};
    return status !== "ALL" || Object.values(filters).some(Boolean);
  }

  setTabSort(tab: string, mode: LibrarySortOption, dir?: LibrarySortDir) {
    const prev   = this.tabSort[tab];
    const newDir = dir ?? prev?.dir ?? "asc";
    this.tabSort = { ...this.tabSort, [tab]: { mode, dir: newDir } };
    updateSettings({ libraryTabSort: this.tabSort as any });
  }

  toggleTabSortDir(tab: string) {
    const prev = this.tabSort[tab];
    const mode = prev?.mode ?? "az";
    const dir  = prev?.dir  === "asc" ? "desc" : "asc";
    this.setTabSort(tab, mode, dir);
  }

  setTabStatus(tab: string, status: LibraryStatusFilter) {
    this.tabStatus = { ...this.tabStatus, [tab]: status };
    updateSettings({ libraryTabStatus: this.tabStatus as any });
  }

  toggleTabFilter(tab: string, filter: LibraryContentFilter) {
    const current = this.tabFilters[tab] ?? {};
    this.tabFilters = { ...this.tabFilters, [tab]: { ...current, [filter]: !current[filter] } };
    updateSettings({ libraryTabFilters: this.tabFilters as any });
  }

  clearTabFilters(tab: string) {
    this.tabStatus  = { ...this.tabStatus,  [tab]: "ALL" };
    this.tabFilters = { ...this.tabFilters, [tab]: {} };
    updateSettings({ libraryTabStatus: this.tabStatus as any, libraryTabFilters: this.tabFilters as any });
  }

  syncFromSettings(s: {
    hiddenLibraryTabs?:          string[];
    libraryPinnedTabOrder?:      string[];
    defaultLibraryCategoryId?:   string | null;
    libraryShowAllInSaved?:      boolean;
    libraryHideCompletedInSaved?: boolean;
    libraryViewMode?:            LibraryViewMode;
    libraryTabSort?:             Record<string, { mode: LibrarySortOption; dir: LibrarySortDir }>;
    libraryTabStatus?:           Record<string, LibraryStatusFilter>;
    libraryTabFilters?:          Record<string, Partial<Record<LibraryContentFilter, boolean>>>;
  }) {
    if (s.hiddenLibraryTabs)                        this.hiddenTabs          = new Set(s.hiddenLibraryTabs);
    if (s.libraryPinnedTabOrder)                    this.pinnedTabOrder      = s.libraryPinnedTabOrder;
    if (s.defaultLibraryCategoryId !== undefined)   this.defaultFolderId    = s.defaultLibraryCategoryId ?? null;
    if (s.libraryShowAllInSaved !== undefined)       this.showAllInSaved      = s.libraryShowAllInSaved;
    if (s.libraryHideCompletedInSaved !== undefined) this.hideCompletedInSaved = s.libraryHideCompletedInSaved;
    if (s.libraryViewMode !== undefined)             this.viewMode            = s.libraryViewMode;
    if (s.libraryTabSort)                            this.tabSort             = s.libraryTabSort;
    if (s.libraryTabStatus)                          this.tabStatus           = s.libraryTabStatus;
    if (s.libraryTabFilters)                         this.tabFilters          = s.libraryTabFilters;
  }

  setViewMode(mode: LibraryViewMode) {
    this.viewMode = mode;
    updateSettings({ libraryViewMode: mode });
  }

  setFolders(folders: Folder[]) {
    this.folders = folders;
    if (!this.tabInitialized) {
      this.tabInitialized = true;
      if (this.defaultFolderId !== null && folders.some(f => f.id === this.defaultFolderId)) {
        this.tab = this.defaultFolderId;
      }
    }
  }

  addFolder(folder: Folder) {
    this.folders = [...this.folders, folder];
    this.folderMembership = { ...this.folderMembership, [folder.id]: [] };
  }

  setFolderMembership(membership: Record<string, Manga[]>) {
    this.folderMembership = membership;
  }

  bumpFolderFrecency(folderId: string) {
    this.folderFrecency = { ...this.folderFrecency, [folderId]: (this.folderFrecency[folderId] ?? 0) + 1 };
  }

  enterSelect(id?: string) {
    this.selectMode = true;
    if (id !== undefined) this.selected = new Set([id]);
  }

  exitSelect() {
    this.selectMode = false;
    this.selected   = new Set();
  }

  toggleSelect(id: string) {
    const next = new Set(this.selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selected = next;
    if (next.size === 0) this.exitSelect();
  }

  selectAll(ids: string[]) {
    this.selected = new Set(ids);
  }

  guardTab() {
    if (this.tab === "library" || this.tab === "downloaded") return;
    if (!this.folders.some(f => f.id === this.tab)) this.tab = "library";
  }
}

export const libraryState = new LibraryState();

export function mapEntryToManga(entry: LibraryEntry): Manga {
  return {
    id:             entry.id,
    title:          entry.title,
    thumbnailUrl:   entry.thumbnailUrl ?? "",
    inLibrary:      true,
    contentType:    entry.contentType,
    description:    entry.description,
    status:         entry.status,
    author:         entry.author,
    artist:         entry.artist,
    genre:          entry.genres,
    tags:           entry.tags,
    unreadCount:    entry.unreadCount,
    downloadCount:  entry.downloadCount,
    chapters:       entry.chapterCount != null ? { totalCount: entry.chapterCount } : undefined,
    latestUploadedChapter: entry.latestChapter
      ? { id: "", chapterNumber: entry.latestChapter.number ?? 0, uploadDate: entry.latestChapter.uploadedAt ?? undefined }
      : null,
    extensionId:    entry.source?.id,
    sourceEntryId:  entry.externalId,
    mediaId:        entry.id,
    libraryEntryId: entry.id,
  } as Manga;
}

const LIBRARY_TTL_MS = 20_000;
let lastLibraryLoad = 0;
let inFlight: Promise<void> | null = null;

export async function loadLibrary(force = false) {
  if (!force && inFlight) return inFlight;
  if (!force && libraryState.items.length && Date.now() - lastLibraryLoad < LIBRARY_TTL_MS) return;

  libraryState.loading = libraryState.items.length === 0;
  libraryState.error   = null;

  inFlight = (async () => {
    try {
      const [entries, folders] = await Promise.all([tsunagu.library(), tsunagu.folders()]);
      const items = entries.map(mapEntryToManga);
      libraryState.items = items;

      const byId = new Map(items.map((m, i) => [entries[i].id, m]));
      const membership: Record<string, Manga[]> = {};
      for (const f of folders) membership[f.id] = [];
      for (const e of entries) {
        for (const f of e.folders ?? []) (membership[f.id] ??= []).push(byId.get(e.id)!);
      }
      libraryState.setFolders(folders);
      libraryState.setFolderMembership(membership);

      lastLibraryLoad = Date.now();
    } catch (e) {
      libraryState.error = String(e);
    } finally {
      libraryState.loading = false;
      inFlight = null;
    }
  })();
  return inFlight;
}

export const loadFolders = (force = true) => loadLibrary(force);

