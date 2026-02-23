import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Manga, Chapter, Source } from "../lib/types";
import { DEFAULT_KEYBINDS, type Keybinds } from "../lib/keybinds";

export type PageStyle        = "single" | "double" | "longstrip";
export type FitMode          = "width" | "height" | "screen" | "original";
export type LibraryFilter    = "all" | "library" | "downloaded" | string; // string = folder id
export type NavPage          = "library" | "sources" | "explore" | "downloads" | "extensions" | "history" | "search";
export type ReadingDirection = "ltr" | "rtl";
export type ChapterSortDir   = "desc" | "asc";

export interface HistoryEntry {
  mangaId: number;
  mangaTitle: string;
  thumbnailUrl: string;
  chapterId: number;
  chapterName: string;
  pageNumber: number;
  readAt: number;
}

export interface ActiveDownload {
  chapterId: number;
  mangaId: number;
  progress: number;
}

export interface Folder {
  id: string;
  name: string;
  mangaIds: number[];
  showTab: boolean;
}

export interface Settings {
  pageStyle: PageStyle;
  readingDirection: ReadingDirection;
  fitMode: FitMode;
  maxPageWidth: number;
  pageGap: boolean;
  optimizeContrast: boolean;
  offsetDoubleSpreads: boolean;
  preloadPages: number;
  autoMarkRead: boolean;
  autoNextChapter: boolean;
  libraryCropCovers: boolean;
  libraryPageSize: number;
  showNsfw: boolean;
  chapterSortDir: ChapterSortDir;
  chapterPageSize: number;
  uiScale: number;
  compactSidebar: boolean;
  gpuAcceleration: boolean;
  serverUrl: string;
  serverBinary: string;
  autoStartServer: boolean;
  preferredExtensionLang: string;
  keybinds: Keybinds;
  storageLimitGb: number | null;
  folders: Folder[];
  /** Debounce delay (ms) applied to the reader's scroll/page-change handler. 0 = off. */
  readerDebounceMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  pageStyle: "longstrip",
  readingDirection: "ltr",
  fitMode: "width",
  maxPageWidth: 900,
  pageGap: true,
  optimizeContrast: false,
  offsetDoubleSpreads: false,
  preloadPages: 3,
  autoMarkRead: true,
  autoNextChapter: false,
  libraryCropCovers: true,
  libraryPageSize: 48,
  showNsfw: false,
  chapterSortDir: "desc",
  chapterPageSize: 25,
  uiScale: 100,
  compactSidebar: false,
  gpuAcceleration: true,
  serverUrl: "http://localhost:4567",
  serverBinary: "tachidesk-server",
  autoStartServer: true,
  preferredExtensionLang: "en",
  keybinds: DEFAULT_KEYBINDS,
  storageLimitGb: null,
  folders: [],
  readerDebounceMs: 120,
};

interface Store {
  navPage: NavPage;
  setNavPage: (page: NavPage) => void;
  activeManga: Manga | null;
  setActiveManga: (manga: Manga | null) => void;
  activeChapter: Chapter | null;
  activeChapterList: Chapter[];
  openReader: (chapter: Chapter, chapterList: Chapter[]) => void;
  closeReader: () => void;
  activeSource: Source | null;
  setActiveSource: (source: Source | null) => void;
  pageUrls: string[];
  setPageUrls: (urls: string[]) => void;
  pageNumber: number;
  setPageNumber: (n: number) => void;
  libraryFilter: LibraryFilter;
  setLibraryFilter: (filter: LibraryFilter) => void;
  libraryTagFilter: string[];
  setLibraryTagFilter: (tags: string[]) => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  activeDownloads: ActiveDownload[];
  setActiveDownloads: (items: ActiveDownload[]) => void;
  history: HistoryEntry[];
  addHistory: (entry: HistoryEntry) => void;
  clearHistory: () => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetKeybinds: () => void;
  // Folder helpers
  addFolder: (name: string) => string;
  removeFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  toggleFolderTab: (id: string) => void;
  assignMangaToFolder: (folderId: string, mangaId: number) => void;
  removeMangaFromFolder: (folderId: string, mangaId: number) => void;
  getMangaFolders: (mangaId: number) => Folder[];
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      navPage: "library",
      setNavPage: (navPage) => set({ navPage }),
      activeManga: null,
      setActiveManga: (activeManga) => set({ activeManga }),
      activeChapter: null,
      activeChapterList: [],
      openReader: (chapter, chapterList) =>
        set({ activeChapter: chapter, activeChapterList: chapterList, pageUrls: [], pageNumber: 1 }),
      closeReader: () =>
        set({ activeChapter: null, activeChapterList: [], pageUrls: [], pageNumber: 1 }),
      activeSource: null,
      setActiveSource: (activeSource) => set({ activeSource }),
      pageUrls: [],
      setPageUrls: (pageUrls) => set({ pageUrls }),
      pageNumber: 1,
      setPageNumber: (pageNumber) => set({ pageNumber }),
      libraryFilter: "library",
      setLibraryFilter: (libraryFilter) => set({ libraryFilter }),
      libraryTagFilter: [],
      setLibraryTagFilter: (libraryTagFilter) => set({ libraryTagFilter }),
      settingsOpen: false,
      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
      activeDownloads: [],
      setActiveDownloads: (activeDownloads) => set({ activeDownloads }),
      history: [],
      addHistory: (entry) =>
        set((s) => {
          const existing = s.history.findIndex((h) => h.chapterId === entry.chapterId);
          if (existing === 0) {
            const updated = [...s.history];
            updated[0] = { ...updated[0], pageNumber: entry.pageNumber, readAt: entry.readAt };
            return { history: updated };
          }
          const deduped = s.history.filter((h) => h.chapterId !== entry.chapterId);
          return { history: [entry, ...deduped].slice(0, 300) };
        }),
      clearHistory: () => set({ history: [] }),
      settings: DEFAULT_SETTINGS,
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetKeybinds: () =>
        set((s) => ({ settings: { ...s.settings, keybinds: DEFAULT_KEYBINDS } })),

      // ── Folder actions ──────────────────────────────────────────────────────
      addFolder: (name) => {
        const id = genId();
        set((s) => ({
          settings: {
            ...s.settings,
            folders: [...s.settings.folders, { id, name: name.trim(), mangaIds: [], showTab: false }],
          },
        }));
        return id;
      },
      removeFolder: (id) =>
        set((s) => ({
          settings: {
            ...s.settings,
            folders: s.settings.folders.filter((f) => f.id !== id),
          },
        })),
      renameFolder: (id, name) =>
        set((s) => ({
          settings: {
            ...s.settings,
            folders: s.settings.folders.map((f) => f.id === id ? { ...f, name: name.trim() } : f),
          },
        })),
      toggleFolderTab: (id) =>
        set((s) => ({
          settings: {
            ...s.settings,
            folders: s.settings.folders.map((f) => f.id === id ? { ...f, showTab: !f.showTab } : f),
          },
        })),
      assignMangaToFolder: (folderId, mangaId) =>
        set((s) => ({
          settings: {
            ...s.settings,
            folders: s.settings.folders.map((f) =>
              f.id === folderId && !f.mangaIds.includes(mangaId)
                ? { ...f, mangaIds: [...f.mangaIds, mangaId] }
                : f
            ),
          },
        })),
      removeMangaFromFolder: (folderId, mangaId) =>
        set((s) => ({
          settings: {
            ...s.settings,
            folders: s.settings.folders.map((f) =>
              f.id === folderId
                ? { ...f, mangaIds: f.mangaIds.filter((id) => id !== mangaId) }
                : f
            ),
          },
        })),
      getMangaFolders: (mangaId) =>
        get().settings.folders.filter((f) => f.mangaIds.includes(mangaId)),
    }),
    {
      name: "moku-store",
      partialize: (s) => ({
        settings: s.settings,
        navPage: s.navPage,
        libraryFilter: s.libraryFilter,
        history: s.history,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...(persisted as object),
        settings: {
          ...DEFAULT_SETTINGS,
          ...(persisted as any)?.settings,
          folders: (persisted as any)?.settings?.folders ?? [],
          keybinds: {
            ...DEFAULT_KEYBINDS,
            ...(persisted as any)?.settings?.keybinds,
          },
        },
      }),
    }
  )
);