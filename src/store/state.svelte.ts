import type { Manga, Chapter, Category, Source }                      from "../types";
import type { Settings, ReaderSettings, ReaderPreset, CustomTheme,
              LibraryFilter }                                          from "../types/settings";
import type { HistoryEntry, BookmarkEntry, MarkerEntry, MarkerColor,
              ReadLogEntry, ReadingStats, LibraryUpdateEntry }        from "../types/history";
import { DEFAULT_KEYBINDS }                                           from "../core/keybinds/defaultBinds";
import { DEFAULT_SETTINGS }                                           from "../types/settings";
import { DEFAULT_READING_STATS }                                      from "../types/history";
import { notifications }                                              from "./notifications.svelte";
import { app }                                                        from "./app.svelte";
import { persistSettings, persistLibrary, persistUpdates }           from "../core/persistence/persist";
import type { PersistedData }                                         from "../core/persistence/persist";
import { untrack }                                                    from "svelte";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type { NavPage }               from "./app.svelte";
export type { Toast, ActiveDownload } from "./notifications.svelte";
export type { Settings, ReaderSettings, ReaderPreset, CustomTheme,
              LibraryFilter, LibrarySortMode, LibrarySortDir,
              LibraryStatusFilter, LibraryContentFilter,
              PageStyle, FitMode, ReadingDirection,
              ChapterSortDir, ChapterSortMode,
              BuiltinTheme, Theme, ThemeTokens,
              MangaPrefs }                                            from "../types/settings";
export { DEFAULT_SETTINGS, DEFAULT_MANGA_PREFS,
         DEFAULT_THEME_TOKENS }                                       from "../types/settings";
export type { HistoryEntry, BookmarkEntry, MarkerEntry, MarkerColor,
              ReadLogEntry, ReadingStats, LibraryUpdateEntry }        from "../types/history";

const STORE_VERSION       = 3;
const AVG_MIN_PER_CHAPTER = 5;
const RESET_ON_UPGRADE: (keyof Settings)[] = ["serverBinary", "readerZoom", "uiZoom"];

function mergeSettings(saved: any): Settings {
  return {
    ...DEFAULT_SETTINGS, ...saved?.settings,
    keybinds:             { ...DEFAULT_KEYBINDS, ...saved?.settings?.keybinds },
    heroSlots:            saved?.settings?.heroSlots            ?? [null, null, null, null],
    mangaLinks:           saved?.settings?.mangaLinks           ?? {},
    mangaPrefs:           saved?.settings?.mangaPrefs           ?? {},
    customThemes:         saved?.settings?.customThemes         ?? [],
    hiddenCategoryIds:    saved?.settings?.hiddenCategoryIds    ?? [],
    nsfwFilteredTags:     saved?.settings?.nsfwFilteredTags     ?? DEFAULT_SETTINGS.nsfwFilteredTags,
    nsfwAllowedSourceIds: saved?.settings?.nsfwAllowedSourceIds ?? [],
    nsfwBlockedSourceIds: saved?.settings?.nsfwBlockedSourceIds ?? [],
    libraryTabSort:       saved?.settings?.libraryTabSort       ?? {},
    libraryTabStatus:     saved?.settings?.libraryTabStatus     ?? {},
    libraryTabFilters:    saved?.settings?.libraryTabFilters    ?? {},
    extraScanDirs:        saved?.settings?.extraScanDirs        ?? [],
    pinnedSourceIds:      saved?.settings?.pinnedSourceIds      ?? [],
    readerPresets:        saved?.settings?.readerPresets        ?? [],
    mangaReaderSettings:  saved?.settings?.mangaReaderSettings  ?? {},
    categoryFrecency:     saved?.settings?.categoryFrecency     ?? {},
    hiddenLibraryTabs:    saved?.settings?.hiddenLibraryTabs    ?? [],
    libraryPinnedTabOrder: saved?.settings?.libraryPinnedTabOrder ?? [],
  };
}

class Store {
  settings:            Settings       = $state(mergeSettings(null));
  activeManga:         Manga | null   = $state(null);
  previewManga:        Manga | null   = $state(null);
  activeChapter:       Chapter | null = $state(null);
  activeChapterList:   Chapter[]      = $state([]);
  pageUrls:            string[]       = $state([]);
  pageNumber:          number         = $state(1);
  libraryFilter:       LibraryFilter  = $state("all");
  categories:          Category[]     = $state([]);
  activeSource:        Source | null  = $state(null);
  libraryTagFilter:    string[]       = $state([]);
  history:             HistoryEntry[] = $state([]);
  bookmarks:           BookmarkEntry[]= $state([]);
  markers:             MarkerEntry[]  = $state([]);
  readLog:             ReadLogEntry[] = $state([]);
  readingStats:        ReadingStats   = $state({ ...DEFAULT_READING_STATS });
  dailyReadCounts:     Record<string, number> = $state({});
  searchCache:         Map<string, any> = $state(new Map());
  searchLibraryIds:    Set<number>    = $state(new Set());
  searchSrcOffset:     number         = $state(0);
  readerSessionId:     number         = $state(0);
  libraryUpdates:      LibraryUpdateEntry[] = $state([]);
  lastLibraryRefresh:  number         = $state(0);
  acknowledgedUpdates: Set<number>    = $state(new Set());
  isFullscreen:        boolean         = $state(false);

  #ready = false;

  get toasts()          { return notifications.toasts; }
  get activeDownloads() { return notifications.activeDownloads; }
  get navPage()         { return app.navPage; }
  set navPage(v)        { app.setNavPage(v); }
  get settingsOpen()    { return app.settingsOpen; }
  set settingsOpen(v)   { app.setSettingsOpen(v); }
  get searchPrefill()   { return app.searchPrefill; }
  set searchPrefill(v)  { app.setSearchPrefill(v); }
  get searchQuery()     { return app.searchQuery; }
  set searchQuery(v)    { app.setSearchQuery(v); }
  get genreFilter()     { return app.genreFilter; }
  set genreFilter(v)    { app.setGenreFilter(v); }

  hydrate(saved: PersistedData) {
    if (this.#ready) return;

    if ((saved.storeVersion ?? 1) < STORE_VERSION && saved.settings) {
      for (const key of RESET_ON_UPGRADE)
        (saved.settings as any)[key] = (DEFAULT_SETTINGS as any)[key];
    }

    // Assign all persisted values outside of reactive tracking so the
    // $effects registered below don't fire on this initial write.
    untrack(() => {
      this.settings            = mergeSettings(saved);
      this.history             = saved.history             ?? [];
      this.bookmarks           = saved.bookmarks           ?? [];
      this.markers             = saved.markers             ?? [];
      this.readLog             = saved.readLog             ?? [];
      this.readingStats        = saved.readingStats        ?? { ...DEFAULT_READING_STATS };
      this.dailyReadCounts     = saved.dailyReadCounts     ?? {};
      this.libraryUpdates      = saved.libraryUpdates      ?? [];
      this.lastLibraryRefresh  = saved.lastLibraryRefresh  ?? 0;
      this.acknowledgedUpdates = new Set(saved.acknowledgedUpdateIds ?? []);
    });

    // Mark ready before registering effects so the first reactive run
    // (which Svelte schedules after the current microtask) is allowed through.
    this.#ready = true;

    $effect.root(() => {
      $effect(() => {
        const s = this.settings;
        if (!this.#ready) return;
        persistSettings({ settings: s, storeVersion: STORE_VERSION });
      });

      $effect(() => {
        const h  = this.history;
        const bk = this.bookmarks;
        const mk = this.markers;
        const rl = this.readLog;
        const rs = this.readingStats;
        const dc = this.dailyReadCounts;
        if (!this.#ready) return;
        persistLibrary({ history: h, bookmarks: bk, markers: mk, readLog: rl, readingStats: rs, dailyReadCounts: dc });
      });

      $effect(() => {
        const lu  = this.libraryUpdates;
        const llr = this.lastLibraryRefresh;
        const au  = this.acknowledgedUpdates;
        if (!this.#ready) return;
        persistUpdates({ libraryUpdates: lu, lastLibraryRefresh: llr, acknowledgedUpdateIds: [...au] });
      });
    });
  }

  openReader(chapter: Chapter, chapterList: Chapter[], manga?: Manga | null) {
    this.activeChapter = chapter; this.activeChapterList = chapterList;
    if (manga !== undefined) this.activeManga = manga;
  }

  closeReader() {
    this.activeChapter = null; this.activeChapterList = [];
    this.pageUrls = []; this.pageNumber = 1;
  }

  addHistory(entry: HistoryEntry, completed = false, minutes?: number) {
    this.history = [entry, ...this.history.filter(h => h.chapterId !== entry.chapterId)].slice(0, 500);
    if (completed && !this.readLog.find(e => e.chapterId === entry.chapterId)) {
      this.readLog = [...this.readLog, { mangaId: entry.mangaId, chapterId: entry.chapterId, readAt: entry.readAt, minutes: minutes ?? AVG_MIN_PER_CHAPTER }];
      const uniqueChapters = new Set(this.readLog.map(e => e.chapterId));
      const uniqueManga    = new Set(this.readLog.map(e => e.mangaId));
      const totalMinutes   = this.readLog.reduce((sum, e) => sum + e.minutes, 0);
      const todayStr       = localDateStr(new Date());
      const yesterday      = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr   = localDateStr(yesterday);
      const lastDate       = this.readingStats.lastStreakDate;
      const streak         = lastDate === todayStr ? this.readingStats.currentStreakDays
                           : lastDate === yesterdayStr ? this.readingStats.currentStreakDays + 1 : 1;
      this.readingStats = {
        totalChaptersRead: uniqueChapters.size, totalMangaRead: uniqueManga.size,
        totalMinutesRead: totalMinutes, firstReadAt: this.readingStats.firstReadAt || entry.readAt,
        lastReadAt: entry.readAt, currentStreakDays: streak,
        longestStreakDays: Math.max(this.readingStats.longestStreakDays, streak), lastStreakDate: todayStr,
      };
      const dayKey = localDateStr(new Date());
      this.dailyReadCounts = { ...this.dailyReadCounts, [dayKey]: (this.dailyReadCounts[dayKey] ?? 0) + 1 };
    }
  }

  addBookmark(entry: Omit<BookmarkEntry, "savedAt">, label?: string) {
    this.bookmarks = [{ ...entry, savedAt: Date.now(), label }, ...this.bookmarks.filter(b => b.chapterId !== entry.chapterId)].slice(0, 200);
  }

  removeBookmark(chapterId: number) { this.bookmarks = this.bookmarks.filter(b => b.chapterId !== chapterId); }
  clearBookmarks()                  { this.bookmarks = []; }
  getBookmark(chapterId: number)    { return this.bookmarks.find(b => b.chapterId === chapterId); }

  addMarker(entry: Omit<MarkerEntry, "id" | "createdAt">): string {
    const id = Math.random().toString(36).slice(2);
    this.markers = [...this.markers, { ...entry, id, createdAt: Date.now() }];
    return id;
  }

  updateMarker(id: string, patch: Partial<Pick<MarkerEntry, "note" | "color">>) {
    this.markers = this.markers.map(m => m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m);
  }

  removeMarker(id: string)                           { this.markers = this.markers.filter(m => m.id !== id); }
  getMarkersForPage(chapterId: number, page: number) { return this.markers.filter(m => m.chapterId === chapterId && m.pageNumber === page); }
  getMarkersForChapter(chapterId: number)            { return this.markers.filter(m => m.chapterId === chapterId); }
  getMarkersForManga(mangaId: number)                { return this.markers.filter(m => m.mangaId === mangaId); }
  clearMarkersForManga(mangaId: number)              { this.markers = this.markers.filter(m => m.mangaId !== mangaId); }
  clearHistory()                                     { this.history = []; this.readLog = []; this.dailyReadCounts = {}; }

  clearHistoryForManga(mangaId: number) {
    this.history = this.history.filter(x => x.mangaId !== mangaId);
    this.readLog = this.readLog.filter(x => x.mangaId !== mangaId);
    this.readingStats = {
      ...this.readingStats,
      totalChaptersRead: new Set(this.readLog.map(e => e.chapterId)).size,
      totalMangaRead:    new Set(this.readLog.map(e => e.mangaId)).size,
      totalMinutesRead:  this.readLog.reduce((sum, e) => sum + e.minutes, 0),
    };
  }

  wipeAllData() {
    this.history = []; this.readLog = []; this.markers = [];
    this.dailyReadCounts = {};
    this.readingStats = { ...DEFAULT_READING_STATS };
    this.settings = { ...this.settings, heroSlots: [null, null, null, null], mangaLinks: {} };
  }

  linkManga(idA: number, idB: number) {
    if (idA === idB) return;
    const links = { ...this.settings.mangaLinks };
    links[idA] = [...new Set([...(links[idA] ?? []), idB])];
    links[idB] = [...new Set([...(links[idB] ?? []), idA])];
    this.settings = { ...this.settings, mangaLinks: links };
  }

  unlinkManga(idA: number, idB: number) {
    const links = { ...this.settings.mangaLinks };
    links[idA] = (links[idA] ?? []).filter(id => id !== idB);
    links[idB] = (links[idB] ?? []).filter(id => id !== idA);
    if (!links[idA].length) delete links[idA];
    if (!links[idB].length) delete links[idB];
    this.settings = { ...this.settings, mangaLinks: links };
  }

  getLinkedMangaIds(mangaId: number) { return this.settings.mangaLinks[mangaId] ?? []; }

  setHeroSlot(index: 1 | 2 | 3, mangaId: number | null) {
    const slots = [...(this.settings.heroSlots ?? [null, null, null, null])];
    slots[index] = mangaId;
    this.settings = { ...this.settings, heroSlots: slots };
  }

  saveCustomTheme(theme: CustomTheme) {
    const i = this.settings.customThemes.findIndex(t => t.id === theme.id);
    this.settings = { ...this.settings, customThemes: i >= 0
      ? this.settings.customThemes.map((t, j) => j === i ? theme : t)
      : [...this.settings.customThemes, theme] };
  }

  deleteCustomTheme(id: string) {
    this.settings = { ...this.settings,
      customThemes: this.settings.customThemes.filter(t => t.id !== id),
      theme: this.settings.theme === id ? "dark" : this.settings.theme };
  }

  toggleHiddenCategory(id: number) {
    const ids = this.settings.hiddenCategoryIds ?? [];
    this.settings = { ...this.settings, hiddenCategoryIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
  }

  clearSearchCache()    { this.searchCache = new Map(); this.searchLibraryIds = new Set(); this.searchSrcOffset++; }
  bumpReaderSession()   { this.readerSessionId++; }

  setLibraryUpdates(entries: LibraryUpdateEntry[]) { this.libraryUpdates = entries; this.lastLibraryRefresh = Date.now(); }
  clearLibraryUpdates() { this.libraryUpdates = []; this.lastLibraryRefresh = 0; this.acknowledgedUpdates = new Set(); }

  acknowledgeUpdate(mangaId: number) {
    if (this.acknowledgedUpdates.has(mangaId)) return;
    this.acknowledgedUpdates = new Set([...this.acknowledgedUpdates, mangaId]);
  }

  async checkAndMarkCompleted(
    mangaId: number, chaps: Chapter[], categories: Category[],
    gqlFn: (query: string, vars: Record<string, unknown>) => Promise<unknown>,
    UPDATE_MANGA_CATEGORIES: string, UPDATE_MANGA?: string, mangaStatus?: string,
  ): Promise<void> {
    if (this.settings.disableAutoComplete) return;
    if (!chaps.length || mangaStatus === "ONGOING") return;
    const completed = categories.find(c => c.name === "Completed");
    if (!completed) return;
    const allRead = chaps.every(c => c.isRead);
    if (allRead) {
      await gqlFn(UPDATE_MANGA_CATEGORIES, { mangaId, addTo: [completed.id], removeFrom: [] }).catch(console.error);
      if (UPDATE_MANGA) await gqlFn(UPDATE_MANGA, { id: mangaId, inLibrary: true }).catch(console.error);
    } else {
      await gqlFn(UPDATE_MANGA_CATEGORIES, { mangaId, addTo: [], removeFrom: [completed.id] }).catch(console.error);
    }
  }

  togglePinnedSource(sourceId: string) {
    const pins = this.settings.pinnedSourceIds ?? [];
    this.settings = { ...this.settings, pinnedSourceIds: pins.includes(sourceId) ? pins.filter(id => id !== sourceId) : [...pins, sourceId] };
  }

  saveReaderPreset(name: string, settings: ReaderSettings): string {
    const id = Math.random().toString(36).slice(2);
    this.settings = { ...this.settings, readerPresets: [...(this.settings.readerPresets ?? []), { id, name: name.trim() || "Preset", settings }] };
    return id;
  }

  updateReaderPreset(id: string, patch: Partial<Pick<ReaderPreset, "name" | "settings">>) {
    this.settings = { ...this.settings, readerPresets: (this.settings.readerPresets ?? []).map(p => p.id === id ? { ...p, ...patch } : p) };
  }

  deleteReaderPreset(id: string) {
    this.settings = { ...this.settings, readerPresets: (this.settings.readerPresets ?? []).filter(p => p.id !== id) };
  }

  setMangaReaderSettings(mangaId: number, settings: ReaderSettings) {
    this.settings = { ...this.settings, mangaReaderSettings: { ...(this.settings.mangaReaderSettings ?? {}), [mangaId]: settings } };
  }

  clearMangaReaderSettings(mangaId: number) {
    const next = { ...(this.settings.mangaReaderSettings ?? {}) };
    delete next[mangaId];
    this.settings = { ...this.settings, mangaReaderSettings: next };
  }

  bumpCategoryFrecency(catId: number) {
    const prev = this.settings.categoryFrecency ?? {};
    this.settings = { ...this.settings, categoryFrecency: { ...prev, [catId]: (prev[catId] ?? 0) + 1 } };
  }

  setCategories(cats: Category[])       { this.categories       = cats; }
  setActiveManga(next: Manga | null)    { this.activeManga      = next; }
  setPreviewManga(next: Manga | null)   { this.previewManga     = next; }
  setActiveSource(next: Source | null)  { this.activeSource     = next; }
  setPageUrls(next: string[])           { this.pageUrls         = next; }
  setPageNumber(next: number)           { this.pageNumber       = next; }
  setLibraryFilter(next: LibraryFilter) { this.libraryFilter    = next; }
  setLibraryTagFilter(next: string[])   { this.libraryTagFilter = next; }
  updateSettings(patch: Partial<Settings>) { this.settings = { ...this.settings, ...patch }; }
  resetKeybinds()                       { this.settings = { ...this.settings, keybinds: DEFAULT_KEYBINDS }; }
}

export const store = new Store();

export function openReader(chapter: Chapter, chapterList: Chapter[], manga?: Manga | null) { store.openReader(chapter, chapterList, manga); }
export function closeReader()                                                               { store.closeReader(); }
export function addHistory(entry: HistoryEntry, completed?: boolean, minutes?: number)     { store.addHistory(entry, completed, minutes); }
export function clearHistory()                                                              { store.clearHistory(); }
export function clearHistoryForManga(mangaId: number)                                      { store.clearHistoryForManga(mangaId); }
export function wipeAllData()                                                               { store.wipeAllData(); }
export function linkManga(idA: number, idB: number)                                        { store.linkManga(idA, idB); }
export function unlinkManga(idA: number, idB: number)                                      { store.unlinkManga(idA, idB); }
export function getLinkedMangaIds(mangaId: number)                                         { return store.getLinkedMangaIds(mangaId); }
export function setHeroSlot(i: 1|2|3, mangaId: number | null)                             { store.setHeroSlot(i, mangaId); }
export function setCategories(cats: Category[])                                            { store.setCategories(cats); }
export function setActiveManga(next: Manga | null)                                         { store.setActiveManga(next); }
export function setPreviewManga(next: Manga | null)                                        { store.setPreviewManga(next); }
export function setActiveSource(next: Source | null)                                       { store.setActiveSource(next); }
export function setPageUrls(next: string[])                                                { store.setPageUrls(next); }
export function setPageNumber(next: number)                                                { store.setPageNumber(next); }
export function setLibraryFilter(next: LibraryFilter)                                      { store.setLibraryFilter(next); }
export function setLibraryTagFilter(next: string[])                                        { store.setLibraryTagFilter(next); }
export function togglePinnedSource(sourceId: string)                                       { store.togglePinnedSource(sourceId); }
export function saveReaderPreset(name: string, settings: ReaderSettings): string           { return store.saveReaderPreset(name, settings); }
export function updateReaderPreset(id: string, patch: Partial<Pick<ReaderPreset, "name" | "settings">>) { store.updateReaderPreset(id, patch); }
export function deleteReaderPreset(id: string)                                             { store.deleteReaderPreset(id); }
export function setMangaReaderSettings(mangaId: number, settings: ReaderSettings)         { store.setMangaReaderSettings(mangaId, settings); }
export function clearMangaReaderSettings(mangaId: number)                                  { store.clearMangaReaderSettings(mangaId); }
export function bumpCategoryFrecency(catId: number)                                        { store.bumpCategoryFrecency(catId); }
export function updateSettings(patch: Partial<Settings>)                                   { store.updateSettings(patch); }
export function resetKeybinds()                                                            { store.resetKeybinds(); }
export function clearSearchCache()                                                         { store.clearSearchCache(); }
export function setLibraryUpdates(entries: LibraryUpdateEntry[])                           { store.setLibraryUpdates(entries); }
export function clearLibraryUpdates()                                                      { store.clearLibraryUpdates(); }
export function acknowledgeUpdate(mangaId: number)                                         { store.acknowledgeUpdate(mangaId); }
export function bumpReaderSession()                                                        { store.bumpReaderSession(); }
export function addBookmark(entry: Omit<BookmarkEntry, "savedAt">, label?: string)         { store.addBookmark(entry, label); }
export function removeBookmark(chapterId: number)                                          { store.removeBookmark(chapterId); }
export function clearBookmarks()                                                           { store.clearBookmarks(); }
export function getBookmark(chapterId: number)                                             { return store.getBookmark(chapterId); }
export function addMarker(entry: Omit<MarkerEntry, "id" | "createdAt">): string           { return store.addMarker(entry); }
export function updateMarker(id: string, patch: Partial<Pick<MarkerEntry, "note" | "color">>) { store.updateMarker(id, patch); }
export function removeMarker(id: string)                                                   { store.removeMarker(id); }
export function getMarkersForPage(chapterId: number, page: number)                        { return store.getMarkersForPage(chapterId, page); }
export function getMarkersForChapter(chapterId: number)                                    { return store.getMarkersForChapter(chapterId); }
export function getMarkersForManga(mangaId: number)                                        { return store.getMarkersForManga(mangaId); }
export function clearMarkersForManga(mangaId: number)                                      { store.clearMarkersForManga(mangaId); }
export function toggleHiddenCategory(id: number)                                           { store.toggleHiddenCategory(id); }
export function saveCustomTheme(theme: CustomTheme)                                        { store.saveCustomTheme(theme); }
export function deleteCustomTheme(id: string)                                              { store.deleteCustomTheme(id); }
export async function checkAndMarkCompleted(
  mangaId: number, chaps: Chapter[], categories: Category[],
  gqlFn: (query: string, vars: Record<string, unknown>) => Promise<unknown>,
  UPDATE_MANGA_CATEGORIES: string, UPDATE_MANGA?: string, mangaStatus?: string,
): Promise<void> { return store.checkAndMarkCompleted(mangaId, chaps, categories, gqlFn, UPDATE_MANGA_CATEGORIES, UPDATE_MANGA, mangaStatus); }

export { addToast, dismissToast, setActiveDownloads } from "./notifications.svelte";
export { setNavPage, setSettingsOpen, setSearchPrefill, setSearchQuery, setGenreFilter, saveScroll, getScroll } from "./app.svelte";