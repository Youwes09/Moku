<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invoke }           from "@tauri-apps/api/core";
  import { gql }              from "@api/client";
  import {
    GET_CATEGORIES, GET_LIBRARY, UPDATE_MANGA, UPDATE_MANGAS,
    GET_CHAPTERS, DELETE_DOWNLOADED_CHAPTERS, DEQUEUE_DOWNLOAD,
    CREATE_CATEGORY, UPDATE_MANGA_CATEGORIES,
    UPDATE_CATEGORY_ORDER, UPDATE_STOP, UPDATE_LIBRARY_MANGA, UPDATE_CATEGORY_MANGA,
  } from "@api";
  import { cache, CACHE_KEYS, CACHE_GROUPS, DEFAULT_TTL_MS } from "@core/cache/queryCache";
  import { dedupeMangaById, dedupeMangaByTitle, shouldHideNsfw } from "@core/util";
  import { sortLibrary }    from "../lib/librarySort";
  import { startLibraryUpdate } from "../lib/libraryUpdater";
  import { createPaginator } from "@core/algorithms/paginate";
  import { longPress }       from "@core/ui/touchscreen";
  import {
    store, setCategories, setLibraryUpdates, addToast,
    setTabSort, toggleTabSortDir, setTabStatus, toggleTabFilter, clearTabFilters,
  } from "../store/libraryState.svelte";
  import { saveScroll, getScroll } from "@store/state.svelte";
  import type { LibrarySortMode, LibrarySortDir, LibraryStatusFilter, LibraryContentFilter, LibraryUpdateEntry } from "@store/state.svelte";
  import type { Manga, Category, Chapter } from "@types";
  import { checkAndMarkCompleted as storeCheckAndMarkCompleted, updateSettings } from "@store/state.svelte";

  import LibraryToolbar       from "./LibraryToolbar.svelte";
  import LibraryGrid          from "./LibraryGrid.svelte";
  import LibraryFilters       from "./LibraryFilters.svelte";
  import BulkAutomationPanel  from "../panels/BulkAutomationPanel.svelte";
  import ContextMenu, { type MenuEntry } from "@shared/ui/ContextMenu.svelte";

  import { Books, DownloadSimple, Folder, FolderSimple, FolderSimplePlus, Trash, Star, CheckSquare, ArrowSquareOut, ArrowsClockwise } from "phosphor-svelte";

  const CARD_MIN_W     = 130;
  const CARD_GAP       = 16;
  const COMPLETED_NAME = "Completed";
  const CTX_FOLDER_CAP = 4;

  const paginator = createPaginator<Manga>(store.settings.renderLimit ?? 48);

  let allManga:       Manga[]     = $state([]);
  let loading:        boolean     = $state(true);
  let error:          string|null = $state(null);
  let retryCount:     number      = $state(0);
  let search:         string      = $state("");
  let renderVisible:  number      = $state(store.settings.renderLimit ?? 48);
  let scrollEl:       HTMLDivElement;
  let tabsEl         = $state<HTMLDivElement>(null!);
  let containerWidth: number      = $state(800);
  let ctx:      { x: number; y: number; manga: Manga } | null = $state(null);
  let emptyCtx: { x: number; y: number } | null              = $state(null);

  let tabIndicator: { left: number; width: number } = $state({ left: 0, width: 0 });

  let selectedIds:      Set<number> = $state(new Set());
  let selectMode:       boolean     = $state(false);
  let bulkWorking:      boolean     = $state(false);
  let bulkAutomateOpen: boolean     = $state(false);

  let sortPanelOpen:   boolean = $state(false);
  let filterPanelOpen: boolean = $state(false);

  let refreshing:       boolean = $state(false);
  let refreshProgress           = $state({ finished: 0, total: 0 });
  let cancelUpdate:     (() => void) | null = null;
  let refreshDone:      boolean = $state(false);
  let refreshDoneTimer: ReturnType<typeof setTimeout> | null = null;

  let refreshingMangaId: number | null = $state(null);
  let refreshingCatId:   number | null = $state(null);

  let activeDragKind:   "tab" | null = $state(null);
  let dragInsertIdx:    number       = $state(-1);
  let dragTabId:        number | null = $state(null);
  let dragOverTabId:    number | null = $state(null);

  const DT_TAB = "application/x-moku-tab";
  const anims  = $derived(store.settings.qolAnimations ?? true);

  const tab         = $derived(store.libraryFilter);
  const tabSortMode = $derived(store.settings.libraryTabSort[tab]?.mode ?? "az" as LibrarySortMode);
  const tabSortDir  = $derived(store.settings.libraryTabSort[tab]?.dir  ?? "asc" as LibrarySortDir);
  const tabStatus   = $derived(store.settings.libraryTabStatus[tab]     ?? "ALL" as LibraryStatusFilter);
  const tabFilters  = $derived(store.settings.libraryTabFilters?.[tab]  ?? {} as Partial<Record<LibraryContentFilter, boolean>>);
  const hasActiveFilters = $derived(tabStatus !== "ALL" || Object.values(tabFilters).some(Boolean));
  const cols = $derived(Math.max(1, Math.floor((containerWidth + CARD_GAP) / (CARD_MIN_W + CARD_GAP))));

  const BUILTIN_TABS = ["library", "downloaded"] as const;

  const completedCatId = $derived(
    store.categories.find(c => c.name === COMPLETED_NAME && c.id !== 0)?.id ?? null
  );

  const allTabIds = $derived((() => {
    const catIds  = store.categories.filter(c => c.id !== 0).map(c => String(c.id));
    const pinned  = store.settings.libraryPinnedTabOrder ?? [];
    const known   = new Set([...BUILTIN_TABS, ...catIds]);
    const ordered = [...pinned.filter(id => known.has(id))];
    const inOrder = new Set(ordered);
    for (const id of [...BUILTIN_TABS, ...catIds]) {
      if (!inOrder.has(id)) ordered.push(id);
    }
    return ordered;
  })());

  const hiddenTabs = $derived(new Set(store.settings.hiddenLibraryTabs ?? []));

  const visibleTabIds = $derived(allTabIds.filter(id => !hiddenTabs.has(id)));

  const virtualTabIds = $derived(visibleTabIds.filter(id =>
    id === "library" || id === "downloaded" || (completedCatId !== null && id === String(completedCatId))
  ));

  const folderTabIds = $derived(visibleTabIds.filter(id =>
    id !== "library" && id !== "downloaded" && (completedCatId === null || id !== String(completedCatId))
  ));

  const visibleCategories = $derived((() => {
    const defaultId = store.settings.defaultLibraryCategoryId ?? null;
    const pinned    = store.settings.libraryPinnedTabOrder ?? [];
    const cats      = store.categories.filter(c => c.id !== 0 && !hiddenTabs.has(String(c.id)));
    const pinOrder  = (id: number) => { const i = pinned.indexOf(String(id)); return i === -1 ? Infinity : i; };
    return cats.sort((a, b) => {
      if (a.id === defaultId) return -1;
      if (b.id === defaultId) return  1;
      const pd = pinOrder(a.id) - pinOrder(b.id);
      return pd !== 0 ? pd : a.order - b.order;
    });
  })());

  const categoryMangaMap = $derived((() => {
    const map = new Map<number, Manga[]>();
    for (const cat of store.categories) {
      map.set(cat.id, cat.mangas?.nodes ?? []);
    }
    return map;
  })());

  const filtered = $derived((() => {
    let items: Manga[];

    if (tab === "library") {
      items = (store.settings.libraryShowAllInSaved ?? true)
        ? allManga.filter(m => m.inLibrary)
        : (categoryMangaMap.get(0) ?? []);

      if ((store.settings.libraryShowAllInSaved ?? true) && (store.settings.libraryHideCompletedInSaved ?? false)) {
        const completedCat = store.categories.find(c => c.name === COMPLETED_NAME);
        if (completedCat) {
          const completedIds = new Set((categoryMangaMap.get(completedCat.id) ?? []).map(m => m.id));
          items = items.filter(m => !completedIds.has(m.id));
        }
      }
    } else if (tab === "downloaded") {
      items = allManga.filter(m => (m.downloadCount ?? 0) > 0);
    } else {
      items = categoryMangaMap.get(Number(tab)) ?? [];
    }

    items = items.filter(m => !shouldHideNsfw(m, store.settings));

    const q = search.trim().toLowerCase();
    if (q) items = items.filter(m => m.title.toLowerCase().includes(q));

    if (tabStatus !== "ALL") {
      items = items.filter(m => {
        const s = m.status?.toUpperCase().replace(/\s+/g, "_") ?? "UNKNOWN";
        return s === tabStatus;
      });
    }

    const f = store.settings.libraryTabFilters?.[tab] ?? {};
    if (f.unread)     items = items.filter(m => (m.unreadCount ?? 0) > 0);
    if (f.started)    items = items.filter(m => (m.unreadCount ?? 0) > 0 && (m.chapters?.totalCount ?? 0) > (m.unreadCount ?? 0));
    if (f.downloaded) items = items.filter(m => (m.downloadCount ?? 0) > 0);
    if (f.bookmarked) items = items.filter(m => (m.bookmarkCount ?? 0) > 0);

    const recentlyReadMap = new Map<number, number>();
    if (tabSortMode === "recentlyRead") {
      for (const h of store.history) {
        if (!recentlyReadMap.has(h.mangaId)) recentlyReadMap.set(h.mangaId, h.readAt);
      }
    }

    return sortLibrary(items, tabSortMode, tabSortDir, recentlyReadMap.size ? recentlyReadMap : undefined);
  })());

  const { items: visibleManga, hasMore, remaining: remainingCount } = $derived(
    paginator.slice(filtered, renderVisible)
  );

  const counts = $derived((() => {
    const m: Record<string, number> = {
      library:    (store.settings.libraryShowAllInSaved ?? true)
        ? allManga.filter(x => x.inLibrary).length
        : (categoryMangaMap.get(0) ?? []).length,
      downloaded: allManga.filter(m => (m.downloadCount ?? 0) > 0).length,
    };
    for (const cat of visibleCategories) {
      m[String(cat.id)] = (categoryMangaMap.get(cat.id) ?? []).length;
    }
    return m;
  })());

  $effect(() => { filtered; untrack(() => { renderVisible = paginator.reset(); }); });
  $effect(() => { retryCount; loading = true; error = null; if (retryCount > 0) cache.clear(CACHE_KEYS.LIBRARY); untrack(() => loadData()); });
  let prevTab = $state(tab);
  $effect(() => {
    const nextTab = tab;
    if (scrollEl && nextTab !== prevTab) {
      saveScroll(`library:${prevTab}`, scrollEl.scrollTop);
      const saved = getScroll(`library:${nextTab}`);
      untrack(() => { scrollEl.scrollTo({ top: saved }); });
      prevTab = nextTab;
    } else if (scrollEl && nextTab === prevTab) {
      scrollEl.scrollTo({ top: 0 });
    }
  });
  $effect(() => {
    const f = tab;
    if (f === "library" || f === "downloaded") return;
    const id = Number(f);
    if (!store.categories.some(c => c.id === id)) untrack(() => { store.libraryFilter = "library"; });
  });
  $effect(() => { tab; untrack(() => exitSelectMode()); });
  $effect(() => { tab; counts; });

  let prevChapterId: number | null = null;
  $effect(() => {
    const wasOpen = prevChapterId !== null;
    prevChapterId = store.activeChapter?.id ?? null;
    if (wasOpen && !store.activeChapter) { cache.clear(CACHE_KEYS.LIBRARY); untrack(() => loadData()); }
  });

  function enterSelectMode(id?: number) { selectMode = true; if (id !== undefined) selectedIds = new Set([id]); }
  function exitSelectMode()              { selectMode = false; selectedIds = new Set(); }
  function toggleSelect(id: number)     { const next = new Set(selectedIds); if (next.has(id)) next.delete(id); else next.add(id); selectedIds = next; if (next.size === 0) exitSelectMode(); }
  function selectAll()                  { selectedIds = new Set(visibleManga.map(m => m.id)); }
  function loadMore()                   { renderVisible = paginator.nextVisible(renderVisible); }

  let cardLongPressFired = false;

  function rootLongPressAction(node: HTMLElement) {
    return longPress(node, {
      onLongPress(e) {
        if ((e.target as HTMLElement).closest("button, .card")) return;
        emptyCtx = { x: e.clientX - SIDEBAR_W, y: e.clientY - TITLEBAR_H };
      },
    });
  }

  function cardLongPress(node: HTMLElement, m: Manga) {
    return longPress(node, {
      onLongPress(e) {
        cardLongPressFired = true;
        ctx = { x: e.clientX - SIDEBAR_W, y: e.clientY - TITLEBAR_H, manga: m };
      },
    });
  }

  function onCardClick(e: MouseEvent, m: Manga) {
    if (cardLongPressFired) { cardLongPressFired = false; return; }
    if (selectMode) { toggleSelect(m.id); return; }
    if (e.metaKey || e.ctrlKey || e.shiftKey) { e.preventDefault(); enterSelectMode(m.id); return; }
    store.activeManga = m;
  }

  async function ensureCompletedCategory(cats: Category[]): Promise<Category[]> {
    if (cats.some(c => c.name === COMPLETED_NAME)) return cats;
    try {
      const res = await gql<{ createCategory: { category: Category } }>(CREATE_CATEGORY, { name: COMPLETED_NAME });
      return [...cats, res.createCategory.category];
    } catch { return cats; }
  }

  async function reloadCategories() {
    try {
      const d    = await gql<{ categories: { nodes: Category[] } }>(GET_CATEGORIES);
      const cats = await ensureCompletedCategory(d.categories.nodes);
      setCategories(cats);
    } catch (e) { console.error(e); }
  }

  async function loadData() {
    try {
      const [nodes] = await Promise.all([
        cache.get(CACHE_KEYS.LIBRARY, () => gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY).then(d => d.mangas.nodes), DEFAULT_TTL_MS, CACHE_GROUPS.LIBRARY),
        reloadCategories(),
      ]);
      const mapped = nodes.map((m: any) => ({ ...m }));
      allManga = dedupeMangaByTitle(dedupeMangaById(mapped), store.settings.mangaLinks);
      error    = null;
      await migrateCategorizedToLibrary();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function migrateCategorizedToLibrary() {
    const allCatManga = store.categories.flatMap(c => c.mangas?.nodes ?? []);
    const orphanIds   = [...new Set(allCatManga.filter(m => !m.inLibrary).map(m => m.id))];
    if (!orphanIds.length) return;
    await gql(UPDATE_MANGAS, { ids: orphanIds, inLibrary: true }).catch(console.error);
    allManga = allManga.map(m => orphanIds.includes(m.id) ? { ...m, inLibrary: true } : m);
    cache.clearGroup(CACHE_GROUPS.LIBRARY);
  }

  async function removeFromLibrary(manga: Manga) {
    await gql(UPDATE_MANGA, { id: manga.id, inLibrary: false }).catch(console.error);
    allManga = allManga.filter(m => m.id !== manga.id);
    cache.clearGroup(CACHE_GROUPS.LIBRARY);
    await reloadCategories();
  }

  async function deleteAllDownloads(manga: Manga) {
    try {
      const data = await gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId: manga.id });
      const ids  = data.chapters.nodes.filter(c => c.isDownloaded).map(c => c.id);
      if (!ids.length) return;
      await gql(DELETE_DOWNLOADED_CHAPTERS, { ids });
      await Promise.allSettled(ids.map(id => gql(DEQUEUE_DOWNLOAD, { chapterId: id })));
      allManga = allManga.map(m => m.id === manga.id ? { ...m, downloadCount: 0 } : m);
    } catch (e) { console.error(e); }
  }

  async function refreshManga(manga: Manga) {
    if (refreshingMangaId !== null) return;
    refreshingMangaId = manga.id;
    try {
      await gql(UPDATE_LIBRARY_MANGA, { id: manga.id });
      cache.clearGroup(CACHE_GROUPS.LIBRARY);
      await loadData();
      addToast({ kind: "success", title: "Manga refreshed", body: manga.title, duration: 2500 });
    } catch (e) { console.error(e); }
    finally { refreshingMangaId = null; }
  }

  async function refreshCategory(catId: number) {
    if (refreshingCatId !== null || refreshing) return;
    refreshingCatId = catId;
    try {
      await gql(UPDATE_CATEGORY_MANGA, { categoryId: catId });
      cache.clearGroup(CACHE_GROUPS.LIBRARY);
      await loadData();
      const cat = store.categories.find(c => c.id === catId);
      addToast({ kind: "success", title: "Folder refreshed", body: cat?.name ?? "", duration: 2500 });
    } catch (e) { console.error(e); }
    finally { refreshingCatId = null; }
  }

  function bumpCategoryFrecency(catId: number) {
    const prev = (store.settings as any).categoryFrecency ?? {};
    updateSettings({ categoryFrecency: { ...prev, [catId]: (prev[catId] ?? 0) + 1 } } as any);
  }

  async function toggleMangaCategory(manga: Manga, cat: Category) {
    const inCat = (categoryMangaMap.get(cat.id) ?? []).some(m => m.id === manga.id);
    setCategories(store.categories.map(c => {
      if (c.id !== cat.id || !c.mangas) return c;
      const nodes = inCat ? c.mangas.nodes.filter(m => m.id !== manga.id) : [...c.mangas.nodes, manga];
      return { ...c, mangas: { nodes } };
    }));
    if (!inCat) bumpCategoryFrecency(cat.id);
    try {
      await gql(UPDATE_MANGA_CATEGORIES, { mangaId: manga.id, addTo: inCat ? [] : [cat.id], removeFrom: inCat ? [cat.id] : [] });
      if (!inCat && !manga.inLibrary) {
        await gql(UPDATE_MANGA, { id: manga.id, inLibrary: true });
        allManga = allManga.map(m => m.id === manga.id ? { ...m, inLibrary: true } : m);
        cache.clearGroup(CACHE_GROUPS.LIBRARY);
      }
      await reloadCategories();
    } catch (e) { console.error(e); await reloadCategories(); }
  }

  async function createAndAssign(manga: Manga) {
    const name = prompt("Folder name:");
    if (!name?.trim()) return;
    try {
      const res = await gql<{ createCategory: { category: Category } }>(CREATE_CATEGORY, { name: name.trim() });
      const cat = res.createCategory.category;
      await gql(UPDATE_MANGA_CATEGORIES, { mangaId: manga.id, addTo: [cat.id], removeFrom: [] });
      bumpCategoryFrecency(cat.id);
      if (!manga.inLibrary) {
        await gql(UPDATE_MANGA, { id: manga.id, inLibrary: true });
        allManga = allManga.map(m => m.id === manga.id ? { ...m, inLibrary: true } : m);
        cache.clearGroup(CACHE_GROUPS.LIBRARY);
      }
      await reloadCategories();
    } catch (e) { console.error(e); }
  }

  async function bulkMoveToCategory(cat: Category) {
    bulkWorking = true;
    try { await Promise.all([...selectedIds].map(id => { const m = allManga.find(x => x.id === id); return m ? toggleMangaCategory(m, cat) : Promise.resolve(); })); }
    finally { bulkWorking = false; exitSelectMode(); }
  }

  async function bulkRemoveFromLibrary() {
    bulkWorking = true;
    try { await Promise.all([...selectedIds].map(id => { const m = allManga.find(x => x.id === id); return m ? removeFromLibrary(m) : Promise.resolve(); })); }
    finally { bulkWorking = false; exitSelectMode(); }
  }

  function bulkAutomate() {
    if (selectedIds.size === 0) return;
    bulkAutomateOpen = true;
  }

  function sanitize(s: string) { return s.replace(/[\/\\?%*:|"<>]/g, "_"); }

  async function openMangaFolder(m: Manga) {
    let base = store.settings.serverDownloadsPath?.trim();
    if (!base) { try { base = await invoke<string>("get_default_downloads_path"); } catch {} }
    if (!base) { addToast({ kind: "error", title: "No downloads path set", body: "Configure it in Settings → Storage" }); return; }
    const source = m.source?.displayName ?? m.source?.name ?? "";
    const path   = source ? `${base}/mangas/${sanitize(source)}/${sanitize(m.title)}` : `${base}/mangas/${sanitize(m.title)}`;
    try { await invoke("open_path", { path }); }
    catch (e: any) { addToast({ kind: "error", title: "Could not open folder", body: e?.toString?.() ?? path }); }
  }

  async function openDownloadsFolder() {
    let path = store.settings.serverDownloadsPath?.trim();
    if (!path) { try { path = await invoke<string>("get_default_downloads_path"); } catch {} }
    if (!path) { addToast({ kind: "error", title: "No downloads path set", body: "Configure it in Settings → Storage" }); return; }
    try { await invoke("open_path", { path }); }
    catch (e: any) { addToast({ kind: "error", title: "Could not open folder", body: e?.toString?.() ?? path }); }
  }

  const SIDEBAR_W  = 52;
  const TITLEBAR_H = 36;

  function openCtx(e: MouseEvent, m: Manga) {
    if (selectMode) { toggleSelect(m.id); return; }
    e.preventDefault();
    ctx = { x: e.clientX - SIDEBAR_W, y: e.clientY - TITLEBAR_H, manga: m };
  }

  function buildCtxItems(m: Manga): MenuEntry[] {
    const frecency: Record<number, number> = (store.settings as any).categoryFrecency ?? {};
    const sorted = [...visibleCategories].sort((a, b) => (frecency[b.id] ?? 0) - (frecency[a.id] ?? 0));
    const pinned   = sorted.slice(0, CTX_FOLDER_CAP);
    const overflow = sorted.slice(CTX_FOLDER_CAP);

    const makeCatEntry = (cat: Category): MenuEntry => {
      const inCat = (categoryMangaMap.get(cat.id) ?? []).some(x => x.id === m.id);
      return { label: inCat ? `Remove from ${cat.name}` : cat.name, icon: Folder, onClick: () => toggleMangaCategory(m, cat) };
    };

    const pinnedEntries    = pinned.map(makeCatEntry);
    const overflowChildren = overflow.map(makeCatEntry);

    return [
      { label: m.inLibrary ? "Remove from library" : "Add to library", icon: Books, onClick: () => m.inLibrary ? removeFromLibrary(m) : gql(UPDATE_MANGA, { id: m.id, inLibrary: true }).then(() => { allManga = allManga.map(x => x.id === m.id ? { ...x, inLibrary: true } : x); cache.clear(CACHE_KEYS.LIBRARY); }).catch(console.error) },
      { label: refreshingMangaId === m.id ? "Refreshing…" : "Refresh manga", icon: ArrowsClockwise, disabled: refreshingMangaId !== null, onClick: () => refreshManga(m) },
      { label: "Open in file manager", icon: ArrowSquareOut, disabled: !(m.downloadCount && m.downloadCount > 0), onClick: () => openMangaFolder(m) },
      { label: "Delete all downloads",  icon: Trash, danger: true, disabled: !(m.downloadCount && m.downloadCount > 0), onClick: () => deleteAllDownloads(m) },
      { separator: true },
      { label: "Select", icon: CheckSquare, onClick: () => enterSelectMode(m.id) },
      ...(pinnedEntries.length ? [{ separator: true } as MenuEntry, ...pinnedEntries] : []),
      ...(overflowChildren.length ? [{ label: `More folders (${overflowChildren.length})`, icon: FolderSimple, onClick: () => {}, children: overflowChildren } as MenuEntry] : []),
      { separator: true },
      { label: "New folder", icon: FolderSimplePlus, onClick: () => createAndAssign(m) },
    ];
  }

  function buildEmptyCtx(): MenuEntry[] {
    return [{ label: "New folder", icon: FolderSimplePlus, onClick: async () => {
      const name = prompt("Folder name:");
      if (!name?.trim()) return;
      try { await gql(CREATE_CATEGORY, { name: name.trim() }); await reloadCategories(); }
      catch (e) { console.error(e); }
    }}];
  }

  export async function checkAndMarkCompleted(mangaId: number, chaps: Chapter[]) {
    await storeCheckAndMarkCompleted(mangaId, chaps, store.categories, gql, UPDATE_MANGA_CATEGORIES, UPDATE_MANGA);
    await reloadCategories();
  }

  function showToast(newChapters: number, totalUpdated: number) {
    if (newChapters > 0) {
      addToast({ kind: "success", title: "Library updated", body: `${newChapters} new chapter${newChapters !== 1 ? "s" : ""} across ${totalUpdated} series` });
    } else {
      addToast({ kind: "info", title: "Already up to date", body: "No new chapters found" });
    }
  }

  async function cancelLibraryRefresh() {
    if (!refreshing) return;
    try { await gql(UPDATE_STOP); } catch (e) { console.error(e); }
    cancelUpdate?.();
    cancelUpdate  = null;
    refreshing    = false;
    refreshProgress = { finished: 0, total: 0 };
  }

  async function startLibraryRefresh() {
    if (refreshing) return;
    refreshing = true;
    refreshProgress = { finished: 0, total: 0 };

    cancelUpdate = startLibraryUpdate({
      onProgress(p) { refreshProgress = p; },
      async onDone({ entries, totalUpdated, newChapters }) {
        refreshing = false; cancelUpdate = null;
        setLibraryUpdates(entries);
        cache.clearGroup(CACHE_GROUPS.LIBRARY);
        await loadData();
        refreshDone = true;
        if (refreshDoneTimer) clearTimeout(refreshDoneTimer);
        refreshDoneTimer = setTimeout(() => { refreshDone = false; }, 2500);
        showToast(newChapters, totalUpdated);
      },
      onError() { refreshing = false; cancelUpdate = null; },
    });
  }

  function onTabDragStart(e: DragEvent, cat: Category) {
    activeDragKind = "tab"; dragTabId = cat.id;
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData(DT_TAB, String(cat.id));
    e.dataTransfer!.setData("text/plain", `tab:${cat.id}`);
  }

  function onTabDragOver(e: DragEvent, cat: Category, idx: number) {
    if (activeDragKind !== "tab" || dragTabId === null || dragTabId === cat.id) return;
    e.preventDefault(); e.dataTransfer!.dropEffect = "move";
    dragOverTabId = cat.id;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragInsertIdx = e.clientX < rect.left + rect.width / 2 ? idx : idx + 1;
  }

  function onTabDragLeave() { dragOverTabId = null; }

  async function onTabDrop(e: DragEvent, dropCat: Category) {
    e.preventDefault(); dragOverTabId = null;
    const insertAt = dragInsertIdx;
    dragInsertIdx = -1;
    if (activeDragKind !== "tab" || dragTabId === null || dragTabId === dropCat.id) { dragTabId = null; return; }
    const dragId = dragTabId; dragTabId = null; activeDragKind = null;
    const dragStrId = String(dragId);
    const tabs    = [...visibleTabIds];
    const fromIdx = tabs.indexOf(dragStrId);
    if (fromIdx < 0) return;
    tabs.splice(fromIdx, 1);
    const dest = Math.max(0, Math.min(insertAt > fromIdx ? insertAt - 1 : insertAt, tabs.length));
    tabs.splice(dest, 0, dragStrId);
    updateSettings({ libraryPinnedTabOrder: tabs });
    const catIds    = tabs.filter(id => id !== "library" && id !== "downloaded");
    const zeroCat   = store.categories.filter(c => c.id === 0);
    const reordered = catIds.map((id, i) => { const c = store.categories.find(x => String(x.id) === id)!; return { ...c, order: i + 1 }; });
    setCategories([...zeroCat, ...reordered]);
    const serverPos = catIds.indexOf(dragStrId) + 1;
    try {
      await gql<{ updateCategoryOrder: { categories: Category[] } }>(UPDATE_CATEGORY_ORDER, { id: dragId, position: serverPos });
    } catch (err) { console.error("Tab reorder failed:", err); await reloadCategories(); }
  }

  function onTabDragEnd() { activeDragKind = null; dragTabId = null; dragOverTabId = null; dragInsertIdx = -1; }

  onMount(() => {
    const ro    = new ResizeObserver(([e]) => containerWidth = e.contentRect.width);
    ro.observe(scrollEl);
    const unsub = cache.subscribe(CACHE_KEYS.LIBRARY, () => loadData());

    const defaultId = store.settings.defaultLibraryCategoryId;
    if (defaultId && store.libraryFilter === "library") store.libraryFilter = String(defaultId);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && (sortPanelOpen || filterPanelOpen)) { sortPanelOpen = false; filterPanelOpen = false; return; }
      if (e.key === "Escape" && selectMode) exitSelectMode();
      if ((e.key === "a" && (e.metaKey || e.ctrlKey)) && selectMode) { e.preventDefault(); selectAll(); }
    }

    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (sortPanelOpen   && !t.closest(".sort-panel-wrap, .sort-panel"))   sortPanelOpen   = false;
      if (filterPanelOpen && !t.closest(".filter-panel-wrap, .filter-panel")) filterPanelOpen = false;
    }

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onDocMouseDown, true);

    return () => {
      ro.disconnect(); unsub();
      cancelUpdate?.();
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onDocMouseDown, true);
    };
  });
</script>

<div
  class="root"
  role="presentation"
  bind:this={scrollEl}
  use:rootLongPressAction
  oncontextmenu={(e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    emptyCtx = { x: e.clientX - SIDEBAR_W, y: e.clientY - TITLEBAR_H };
  }}
>
  {#if store.settings.libraryBranches ?? true}
    <svg class="branches" viewBox="0 0 400 600" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <g stroke="var(--accent)" stroke-width="0.6" fill="none" opacity="0.13">
        <path d="M380 600 C380 500 340 460 310 400 C280 340 300 280 270 220"/>
        <path d="M270 220 C255 190 230 175 210 150"/>
        <path d="M270 220 C290 195 310 185 330 165"/>
        <path d="M310 400 C290 375 265 368 245 350"/>
        <path d="M310 400 C330 370 355 362 370 340"/>
        <path d="M210 150 C195 128 185 108 175 80"/>
        <path d="M210 150 C225 130 240 122 258 105"/>
        <path d="M245 350 C228 330 215 315 205 290"/>
        <path d="M175 80  C168 60  162 42  158 20"/>
        <path d="M175 80  C185 62  195 50  208 35"/>
        <path d="M205 290 C196 268 190 250 186 225"/>
        <path d="M258 105 C268 88  278 72  292 52"/>
        <path class="anim-branch" d="M186 225 C180 205 176 185 174 160"/>
        <path class="anim-branch" d="M292 52  C300 36  308 20  318 0"/>
      </g>
    </svg>
  {/if}

  {#if error}
    <div class="center">
      <p class="error-msg">Could not reach Suwayomi</p>
      <p class="error-detail">Make sure the server is running, then retry.</p>
      <button class="retry-btn" onclick={() => retryCount++}>Retry</button>
    </div>
  {:else}
    <LibraryToolbar
      onclick={(e: MouseEvent) => { if (selectMode && !(e.target as HTMLElement).closest("button, input")) exitSelectMode(); }}
      {tab}
      {tabSortMode}
      {tabSortDir}
      {tabStatus}
      {tabFilters}
      {hasActiveFilters}
      {anims}
      {visibleCategories}
      {visibleTabIds}
      {virtualTabIds}
      {folderTabIds}
      {completedCatId}
      {counts}
      {search}
      {refreshing}
      {refreshProgress}
      {refreshDone}
      {refreshingCatId}
      {activeDragKind}
      {dragInsertIdx}
      {dragTabId}
      {dragOverTabId}
      {sortPanelOpen}
      {filterPanelOpen}
      bind:tabsEl
      onSearchChange={(v) => search = v}
      onTabChange={(f) => store.libraryFilter = f}
      onSortChange={(mode) => { setTabSort(tab, mode); sortPanelOpen = false; }}
      onSortDirToggle={() => toggleTabSortDir(tab)}
      onStatusChange={(s) => setTabStatus(tab, s)}
      onFilterToggle={(f) => toggleTabFilter(tab, f)}
      onFiltersClear={() => clearTabFilters(tab)}
      onSortPanelToggle={() => { sortPanelOpen = !sortPanelOpen; filterPanelOpen = false; }}
      onFilterPanelToggle={() => { filterPanelOpen = !filterPanelOpen; sortPanelOpen = false; }}
      onRefresh={startLibraryRefresh}
      onCancelRefresh={cancelLibraryRefresh}
      onRefreshCategory={refreshCategory}
      onOpenDownloadsFolder={openDownloadsFolder}
      onTabDragStart={onTabDragStart}
      onTabDragOver={onTabDragOver}
      onTabDragLeave={onTabDragLeave}
      onTabDrop={onTabDrop}
      onTabDragEnd={onTabDragEnd}
    />

    {#if refreshing && refreshProgress.total > 0}
      {@const pct = Math.round((refreshProgress.finished / refreshProgress.total) * 100)}
      <div class="refresh-bar-wrap" aria-hidden="true">
        <div class="refresh-bar-fill" style="width:{pct}%"></div>
      </div>
    {/if}

    <LibraryGrid
      {visibleManga}
      {filtered}
      {loading}
      {cols}
      {anims}
      {selectMode}
      {selectedIds}
      {hasMore}
      {remainingCount}
      renderLimit={store.settings.renderLimit ?? 48}
      cropCovers={store.settings.libraryCropCovers}
      statsAlways={store.settings.libraryStatsAlways ?? false}
      libraryFilter={tab}
      onCardClick={onCardClick}
      onCardContextMenu={openCtx}
      onCardLongPress={cardLongPress}
      onLoadMore={loadMore}
      onRetry={() => retryCount++}
      onExitSelectMode={exitSelectMode}
      onSelectAll={selectAll}
      onBulkMove={bulkMoveToCategory}
      onBulkRemove={bulkRemoveFromLibrary}
      onBulkAutomate={bulkAutomate}
      {bulkWorking}
      {visibleCategories}
    />
  {/if}
</div>

{#if ctx}
  <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.manga)} onClose={() => ctx = null} />
{/if}
{#if emptyCtx}
  <ContextMenu x={emptyCtx.x} y={emptyCtx.y} items={buildEmptyCtx()} onClose={() => emptyCtx = null} />
{/if}
{#if bulkAutomateOpen}
  <BulkAutomationPanel
    ids={selectedIds}
    onClose={() => { bulkAutomateOpen = false; exitSelectMode(); }}
  />
{/if}

<style>
  .root { position: relative; display: flex; flex-direction: column; height: 100%; overflow: visible; animation: fadeIn 0.14s ease both; }
  .branches { position: absolute; top: 0; right: 0; width: 400px; height: 600px; pointer-events: none; z-index: 0; }
  .branches :global(.anim-branch) { stroke-dasharray: 60; stroke-dashoffset: 60; animation: branchGrow 2.4s ease forwards; }
  .center { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60%; color: var(--text-muted); font-size: var(--text-sm); gap: var(--sp-2); text-align: center; line-height: var(--leading-base); }
  .error-msg { color: var(--color-error); font-size: var(--text-base); }
  .error-detail { color: var(--text-faint); font-size: var(--text-sm); }
  .retry-btn { margin-top: var(--sp-3); padding: 6px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-muted); cursor: pointer; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); }
  .refresh-bar-wrap { height: 2px; background: var(--border-dim); flex-shrink: 0; overflow: hidden; }
  .refresh-bar-fill { height: 100%; background: var(--accent); border-radius: 0 2px 2px 0; transition: width 0.6s ease; }
  @keyframes fadeIn    { from { opacity: 0 } to { opacity: 1 } }
  @keyframes branchGrow { to { stroke-dashoffset: 0; } }
</style>