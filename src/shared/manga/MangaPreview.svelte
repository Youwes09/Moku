<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    X, BookmarkSimple, ArrowSquareOut, Play, CircleNotch,
    Books, CaretDown, FolderSimplePlus, Folder, LinkSimpleHorizontalBreak, Image,
  } from "phosphor-svelte";
  import { gql }       from "@api/client";
  import Thumbnail     from "@shared/manga/Thumbnail.svelte";
  import { GET_MANGA, GET_CATEGORIES, GET_ALL_MANGA, GET_CHAPTERS } from "@api/queries";
  import { FETCH_MANGA, FETCH_CHAPTERS, UPDATE_MANGA, CREATE_CATEGORY, UPDATE_MANGA_CATEGORIES, ENQUEUE_CHAPTERS_DOWNLOAD } from "@api/mutations";
  import { cache, CACHE_KEYS }                                                    from "@core/cache";
  import {
    store, openReader, addToast,
    setPreviewManga, setActiveManga, setNavPage, setGenreFilter,
    checkAndMarkCompleted as storeCheckAndMarkCompleted, addBookmark,
  } from "@store/state.svelte";
  import { resolvedCover } from "@core/cover/coverResolver";
  import CoverPickerPanel  from "@features/series/panels/CoverPickerPanel.svelte";
  import SeriesLinkPanel   from "@features/series/panels/SeriesLinkPanel.svelte";
  import { autoLinkLibrary } from "@core/cover/autoLink";
  import type { Manga, Chapter, Category } from "@types/index";


  let manga: Manga | null         = $state(null);
  let chapters: Chapter[]         = $state([]);
  let loadingDetail               = $state(false);
  let loadingChapters             = $state(false);
  let togglingLib                 = $state(false);
  let descExpanded                = $state(false);
  let folderOpen                  = $state(false);
  let newFolderName               = $state("");
  let creatingFolder              = $state(false);
  let allCategories: Category[]   = $state([]);
  let mangaCategories: Category[] = $state([]);
  let catsLoading                 = $state(false);
  let queueingAll                 = $state(false);
  let fetchError: string | null   = $state(null);
  let folderRef: HTMLDivElement   = $state() as HTMLDivElement;

  let linkPickerOpen           = $state(false);
  let allMangaForLink: Manga[] = $state([]);
  let loadingLinkList          = $state(false);
  let coverPickerOpen          = $state(false);

  let originNavPage = store.navPage;

  const linkedIds = $derived(
    store.previewManga ? (store.settings.mangaLinks?.[store.previewManga.id] ?? []) : [],
  );

  const hasCoverOverride = $derived(
    !!store.settings.mangaPrefs?.[store.previewManga?.id ?? -1]?.coverUrl
  );

  const displayManga    = $derived(manga ?? store.previewManga);
  const totalCount      = $derived(chapters.length);
  const readCount       = $derived(chapters.filter((c) => c.isRead).length);
  const unreadCount     = $derived(totalCount - readCount);
  const downloadedCount = $derived(chapters.filter((c) => c.isDownloaded).length);
  const bookmarkCount   = $derived(chapters.filter((c) => c.isBookmarked).length);
  const inLibrary       = $derived(manga?.inLibrary ?? store.previewManga?.inLibrary ?? false);
  const scanlators      = $derived(
    [...new Set(chapters.map((c) => c.scanlator).filter((s): s is string => !!s?.trim()))],
  );
  const uploadDates = $derived(
    chapters
      .map((c) => (c.uploadDate ? new Date(c.uploadDate).getTime() : null))
      .filter((d): d is number => d !== null && !isNaN(d)),
  );
  const firstUpload  = $derived(uploadDates.length ? new Date(Math.min(...uploadDates)) : null);
  const lastUpload   = $derived(uploadDates.length ? new Date(Math.max(...uploadDates)) : null);
  const statusLabel  = $derived(
    displayManga?.status
      ? displayManga.status.charAt(0) + displayManga.status.slice(1).toLowerCase()
      : null,
  );
  const assignedFolders = $derived(mangaCategories.filter((c) => c.id !== 0));

  const continueChapter = $derived.by(() => {
    if (!chapters.length) return null;
    const asc      = [...chapters];
    const anyRead  = asc.some((c) => c.isRead);
    const bookmark = displayManga
      ? store.bookmarks.find((b) => b.mangaId === displayManga!.id)
      : null;

    if (bookmark) {
      const ch = asc.find((c) => c.id === bookmark.chapterId);
      if (ch) {
        const isLastChapter = asc[asc.length - 1]?.id === ch.id;
        const allRead       = asc.every((c) => c.isRead);
        if (!(isLastChapter && allRead))
          return { ch, type: "continue" as const, resumePage: bookmark.pageNumber };
      }
    }

    const inProgress  = asc.find((c) => !c.isRead && (c.lastPageRead ?? 0) > 0);
    if (inProgress)   return { ch: inProgress, type: "continue" as const, resumePage: inProgress.lastPageRead! };
    const firstUnread = asc.find((c) => !c.isRead);
    if (firstUnread)  return { ch: firstUnread, type: (anyRead ? "continue" : "start") as const, resumePage: null };
    return { ch: asc[0], type: "reread" as const, resumePage: null };
  });

  const continueLabel = $derived.by(() => {
    if (!continueChapter) return "";
    const { ch, type, resumePage } = continueChapter;
    if (type === "reread") return "Read again";
    if (type === "start")  return `Start · Ch.${ch.chapterNumber}`;
    return `Continue · Ch.${ch.chapterNumber}${resumePage ? ` p.${resumePage}` : ""}`;
  });


  let detailAbort: AbortController | null  = null;
  let chapterAbort: AbortController | null = null;


  function close() {
    detailAbort?.abort();
    chapterAbort?.abort();
    setPreviewManga(null);
    manga = null; chapters = []; descExpanded = false;
    folderOpen = false; creatingFolder = false; newFolderName = ""; fetchError = null;
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  async function openLinkPicker() {
    linkPickerOpen = true;
    if (allMangaForLink.length) return;
    loadingLinkList = true;
    gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA)
      .then((d) => {
        allMangaForLink = d.mangas.nodes;
      })
      .catch(console.error)
      .finally(() => { loadingLinkList = false; });
  }

  function closeLinkPicker() { linkPickerOpen = false; }

  async function openCoverPicker() {
    coverPickerOpen = true;
    if (allMangaForLink.length) return;
    loadingLinkList = true;
    gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA)
      .then((d) => { allMangaForLink = d.mangas.nodes; })
      .catch(console.error)
      .finally(() => { loadingLinkList = false; });
  }

  $effect(() => {
    const shouldAutoLink = store.settings.autoLinkOnOpen;
    const focal = store.previewManga;
    if (focal) {
      originNavPage = store.navPage;
      load(focal.id);
      loadCategories(focal.id);
      if (shouldAutoLink) {
        if (allMangaForLink.length) {
          autoLinkLibrary(focal, allMangaForLink)
            .then(n => { if (n > 0) addToast({ kind: "success", title: "Series linked", body: `${n} new link${n === 1 ? "" : "s"} found` }); });
        } else {
          loadingLinkList = true;
          gql<{ mangas: { nodes: Manga[] } }>(GET_ALL_MANGA)
            .then((d) => {
              allMangaForLink = d.mangas.nodes;
              return autoLinkLibrary(focal, d.mangas.nodes);
            })
            .then(n => { if (n > 0) addToast({ kind: "success", title: "Series linked", body: `${n} new link${n === 1 ? "" : "s"} found` }); })
            .catch(console.error)
            .finally(() => { loadingLinkList = false; });
        }
      }
    }
  });

  async function load(id: number) {
    detailAbort?.abort(); chapterAbort?.abort();
    const dCtrl = new AbortController(), cCtrl = new AbortController();
    detailAbort = dCtrl; chapterAbort = cCtrl;
    manga = store.previewManga as Manga;
    chapters = []; descExpanded = false; fetchError = null;
    loadingDetail = true; loadingChapters = true;

    (async (): Promise<Manga> => {
      const key = CACHE_KEYS.MANGA(id);
      if (cache.has(key)) return cache.get(key, () => Promise.resolve(store.previewManga as Manga)) as Promise<Manga>;
      try {
        const d = await gql<{ fetchManga: { manga: Manga } }>(FETCH_MANGA, { id }, dCtrl.signal);
        return d.fetchManga.manga;
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        const local = await gql<{ manga: Manga }>(GET_MANGA, { id }, dCtrl.signal).then((d) => d.manga);
        if (local) return local;
        throw new Error("Could not load manga details");
      }
    })()
      .then((fullManga) => {
        if (dCtrl.signal.aborted) return;
        if (!cache.has(CACHE_KEYS.MANGA(id)))
          cache.get(CACHE_KEYS.MANGA(id), () => Promise.resolve(fullManga));
        manga = fullManga; loadingDetail = false;
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        manga = store.previewManga as Manga;
        fetchError = "Could not load full details — showing cached data";
        loadingDetail = false;
      });

    gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId: id }, cCtrl.signal)
      .then(async (d) => {
        if (cCtrl.signal.aborted) return;
        let nodes = [...d.chapters.nodes].sort((a, b) => a.sourceOrder - b.sourceOrder);
        if (nodes.length === 0) {
          try {
            const fetched = await gql<{ fetchChapters: { chapters: Chapter[] } }>(
              FETCH_CHAPTERS, { mangaId: id }, cCtrl.signal,
            );
            if (!cCtrl.signal.aborted)
              nodes = [...fetched.fetchChapters.chapters].sort((a, b) => a.sourceOrder - b.sourceOrder);
          } catch (e: any) {
            if (e?.name === "AbortError") return;
          }
        }
        if (!cCtrl.signal.aborted) {
          chapters = nodes;
          if (nodes.length > 0) checkAndMarkCompleted(id, nodes);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cCtrl.signal.aborted) loadingChapters = false; });
  }

  async function toggleLibrary() {
    if (!manga) return;
    togglingLib = true;
    const next = !manga.inLibrary;
    await gql(UPDATE_MANGA, { id: manga.id, inLibrary: next }).catch(console.error);
    manga = { ...manga, inLibrary: next };
    cache.clear(CACHE_KEYS.MANGA(manga.id));
    cache.get(CACHE_KEYS.MANGA(manga.id), () => Promise.resolve(manga!));
    cache.clear(CACHE_KEYS.LIBRARY);
    togglingLib = false;
    addToast({ kind: "success", title: next ? "Added to library" : "Removed from library" });
  }

  async function downloadAll() {
    const ids = chapters.filter((c) => !c.isDownloaded && !c.isRead).map((c) => c.id);
    if (!ids.length) return;
    queueingAll = true;
    await gql(ENQUEUE_CHAPTERS_DOWNLOAD, { chapterIds: ids }).catch(console.error);
    addToast({ kind: "download", title: "Downloading", body: `${ids.length} chapters queued` });
    queueingAll = false;
  }

  function openSeriesDetail() {
    if (!displayManga) return;
    setActiveManga(displayManga);
    setNavPage(originNavPage);
    close();
  }

  function loadCategories(mangaId: number) {
    catsLoading = true;
    gql<{ categories: { nodes: Category[] } }>(GET_CATEGORIES)
      .then((d) => {
        allCategories   = d.categories.nodes.filter((c) => c.id !== 0);
        mangaCategories = allCategories.filter((c) => c.mangas?.nodes.some((m) => m.id === mangaId));
      })
      .catch(console.error)
      .finally(() => { catsLoading = false; });
  }

  async function checkAndMarkCompleted(mangaId: number, chaps: Chapter[]) {
    const mangaStatus = (manga ?? displayManga)?.status;
    await storeCheckAndMarkCompleted(
      mangaId, chaps, allCategories, gql,
      UPDATE_MANGA_CATEGORIES, UPDATE_MANGA, mangaStatus,
    );
    const isOngoing = mangaStatus === "ONGOING";
    if (chaps.length && !isOngoing) {
      const allRead   = chaps.every((c) => c.isRead);
      const completed = allCategories.find((c) => c.name === "Completed");
      if (completed) {
        const inCompleted = mangaCategories.some((c) => c.id === completed.id);
        if (allRead && !inCompleted)      mangaCategories = [...mangaCategories, completed];
        else if (!allRead && inCompleted) mangaCategories = mangaCategories.filter((c) => c.id !== completed.id);
      }
    }
  }

  async function toggleCategory(cat: Category) {
    if (!store.previewManga) return;
    const mangaId = store.previewManga.id;
    const inCat   = mangaCategories.some((c) => c.id === cat.id);
    await gql(UPDATE_MANGA_CATEGORIES, {
      mangaId,
      addTo:      inCat ? [] : [cat.id],
      removeFrom: inCat ? [cat.id] : [],
    }).catch(console.error);
    if (!inCat && !inLibrary) {
      await gql(UPDATE_MANGA, { id: mangaId, inLibrary: true }).catch(console.error);
      if (manga) manga = { ...manga, inLibrary: true };
      cache.clear(CACHE_KEYS.LIBRARY);
    }
    mangaCategories = inCat
      ? mangaCategories.filter((c) => c.id !== cat.id)
      : [...mangaCategories, cat];
  }

  async function handleFolderCreate() {
    const name = newFolderName.trim();
    if (!name || !store.previewManga) return;
    try {
      const res = await gql<{ createCategory: { category: Category } }>(CREATE_CATEGORY, { name });
      const cat = res.createCategory.category;
      allCategories = [...allCategories, cat];
      await gql(UPDATE_MANGA_CATEGORIES, {
        mangaId:    store.previewManga.id,
        addTo:      [cat.id],
        removeFrom: [],
      });
      if (!inLibrary) {
        await gql(UPDATE_MANGA, { id: store.previewManga.id, inLibrary: true }).catch(console.error);
        if (manga) manga = { ...manga, inLibrary: true };
        cache.clear(CACHE_KEYS.LIBRARY);
      }
      mangaCategories = [...mangaCategories, cat];
    } catch (e) { console.error(e); }
    newFolderName = ""; creatingFolder = false;
  }

  function handleFolderOutside(e: MouseEvent) {
    if (folderRef && !folderRef.contains(e.target as Node)) {
      folderOpen = false; creatingFolder = false; newFolderName = "";
    }
  }

  $effect(() => {
    if (folderOpen) {
      setTimeout(() => document.addEventListener("mousedown", handleFolderOutside), 0);
      return () => document.removeEventListener("mousedown", handleFolderOutside);
    }
  });

  function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
  onMount(() => window.addEventListener("keydown", onKey));
  onDestroy(() => {
    window.removeEventListener("keydown", onKey);
    detailAbort?.abort();
    chapterAbort?.abort();
  });
</script>

{#if store.previewManga}
<div
  class="backdrop"
  role="button"
  tabindex="-1"
  aria-label="Close preview"
  onclick={(e) => { if (e.target === e.currentTarget) close(); }}
  onkeydown={(e) => { if (e.key === "Escape") close(); }}
>
  <div class="modal" role="dialog" aria-label="Manga preview">


    <div class="cover-col">
      <div class="cover-wrap">
        <Thumbnail src={resolvedCover(store.previewManga.id, store.previewManga.thumbnailUrl)} alt={displayManga?.title} class="cover" />
        {#if loadingDetail}
          <div class="cover-spinner">
            <CircleNotch size={18} weight="light" class="anim-spin" />
          </div>
        {/if}
      </div>

      <div class="cover-actions">
        <button
          class="action-btn"
          class:active={inLibrary}
          onclick={toggleLibrary}
          disabled={togglingLib || loadingDetail}
        >
          <span class="action-icon">
            <BookmarkSimple size={13} weight={inLibrary ? "fill" : "light"} />
          </span>
          <span class="action-label">
            {togglingLib ? "…" : inLibrary ? "In Library" : "Add to Library"}
          </span>
        </button>

        <button class="action-btn" onclick={openSeriesDetail}>
          <span class="action-icon"><Books size={13} weight="light" /></span>
          <span class="action-label">Series Detail</span>
        </button>

        <div class="folder-wrap" bind:this={folderRef}>
          <button
            class="action-btn"
            class:active={assignedFolders.length > 0}
            onclick={() => folderOpen = !folderOpen}
          >
            <span class="action-icon">
              <FolderSimplePlus size={13} weight={assignedFolders.length > 0 ? "fill" : "light"} />
            </span>
            <span class="action-label">
              {assignedFolders.length > 0 ? assignedFolders.map((f) => f.name).join(", ") : "Add to folder"}
            </span>
          </button>

          {#if folderOpen}
            <div class="folder-menu">
              {#if catsLoading}
                <p class="folder-empty">Loading…</p>
              {:else if allCategories.length === 0 && !creatingFolder}
                <p class="folder-empty">No folders yet</p>
              {/if}
              {#each allCategories as cat}
                {@const isIn = mangaCategories.some((c) => c.id === cat.id)}
                <button class="folder-item" class:folder-item-on={isIn} onclick={() => toggleCategory(cat)}>
                  <Folder size={12} weight={isIn ? "fill" : "light"} />
                  {isIn ? "✓ " : ""}{cat.name}
                </button>
              {/each}
              <div class="folder-divider"></div>
              {#if creatingFolder}
                <div class="folder-create-row">
                  <input
                    class="folder-input"
                    placeholder="Folder name…"
                    bind:value={newFolderName}
                    onkeydown={(e) => {
                      if (e.key === "Enter")  handleFolderCreate();
                      if (e.key === "Escape") { creatingFolder = false; newFolderName = ""; }
                    }}
                    use:focusAction
                  />
                  <button class="folder-ok" onclick={handleFolderCreate} disabled={!newFolderName.trim()}>
                    Add
                  </button>
                </div>
              {:else}
                <button class="folder-new" onclick={() => creatingFolder = true}>+ New folder</button>
              {/if}
            </div>
          {/if}
        </div>

        <button
          class="action-btn"
          class:active={linkedIds.length > 0}
          onclick={openLinkPicker}
        >
          <span class="action-icon">
            <LinkSimpleHorizontalBreak size={13} weight={linkedIds.length > 0 ? "fill" : "light"} />
          </span>
          <span class="action-label">
            {linkedIds.length > 0 ? `Series Link (${linkedIds.length})` : "Series Link"}
          </span>
        </button>

        <button
          class="action-btn"
          class:active={hasCoverOverride}
          onclick={openCoverPicker}
        >
          <span class="action-icon">
            <Image size={13} weight={hasCoverOverride ? "fill" : "light"} />
          </span>
          <span class="action-label">Cover Image</span>
        </button>
      </div>
    </div>


    <div class="content">
      <div class="content-header">
        <div class="title-block">
          <h2 class="title">{displayManga?.title}</h2>
          {#if loadingDetail}
            <div class="sk-byline"></div>
          {:else if displayManga?.author || displayManga?.artist}
            <p class="byline">
              {[displayManga?.author, displayManga?.artist]
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(" · ")}
            </p>
          {/if}
        </div>
        <button class="close-btn" onclick={close}><X size={15} weight="light" /></button>
      </div>

      <div class="content-body">
        {#if fetchError}
          <div class="error-banner">{fetchError}</div>
        {/if}


        {#if loadingDetail}
          <div class="sk-row">
            <div class="sk-badge"></div>
            <div class="sk-badge" style="width:72px"></div>
          </div>
        {:else}
          <div class="badges">
            {#if statusLabel}
              <span class="badge" class:badge-green={displayManga?.status === "ONGOING"}>{statusLabel}</span>
            {/if}
            {#if displayManga?.source}
              <span class="badge">{displayManga.source.displayName}</span>
            {/if}
            {#if inLibrary}
              <span class="badge badge-accent">In Library</span>
            {/if}
            {#if !loadingChapters && unreadCount > 0}
              <span class="badge badge-unread">{unreadCount} unread</span>
            {/if}
            {#if !loadingChapters && bookmarkCount > 0}
              <span class="badge">{bookmarkCount} bookmarked</span>
            {/if}
          </div>
        {/if}


        <div class="chapter-box">
          {#if loadingChapters}
            <div class="chapter-loading">
              <CircleNotch size={13} weight="light" class="anim-spin" style="color:var(--text-faint)" />
              <span class="chapter-loading-label">Loading chapters…</span>
            </div>
          {:else if totalCount > 0}
            <div class="chapter-meta">
              <span class="chapter-label">
                {totalCount} {totalCount === 1 ? "chapter" : "chapters"}
                {readCount > 0 ? ` · ${readCount} read` : ""}
                {unreadCount > 0 && readCount > 0 ? ` · ${unreadCount} left` : ""}
                {downloadedCount > 0 ? ` · ${downloadedCount} dl` : ""}
              </span>
              {#if unreadCount > 0}
                <button class="dl-all-btn" onclick={downloadAll} disabled={queueingAll}>
                  {#if queueingAll}<CircleNotch size={11} weight="light" class="anim-spin" />{/if}
                  {queueingAll ? "Queuing…" : "Download unread"}
                </button>
              {/if}
            </div>
            {#if readCount > 0}
              <div class="progress-track">
                <div class="progress-fill" style="width:{(readCount / totalCount) * 100}%"></div>
              </div>
            {/if}
            {#if continueChapter}
              <button class="read-btn" onclick={() => {
                const { ch, type, resumePage } = continueChapter!;
                if (type === "continue" && resumePage && resumePage > 1) {
                  const existing = store.bookmarks.find((b) => b.chapterId === ch.id);
                  if (!existing || existing.pageNumber < resumePage) {
                    addBookmark({
                      mangaId:      displayManga!.id,
                      mangaTitle:   displayManga!.title,
                      thumbnailUrl: displayManga!.thumbnailUrl,
                      chapterId:    ch.id,
                      chapterName:  ch.name,
                      pageNumber:   resumePage,
                    });
                  }
                }
                openReader(ch, chapters, displayManga);
                close();
              }}>
                <Play size={12} weight="fill" />{continueLabel}
              </button>
            {/if}
          {:else if !loadingDetail}
            <span class="chapter-label" style="color:var(--text-faint)">No chapters in local library</span>
          {/if}
        </div>


        {#if loadingDetail}
          <div class="sk-desc">
            <div class="sk-line" style="width:100%"></div>
            <div class="sk-line" style="width:88%"></div>
            <div class="sk-line" style="width:70%"></div>
          </div>
        {:else if displayManga?.description}
          <div class="desc-block">
            <p class="desc" class:desc-open={descExpanded}>{displayManga.description}</p>
            {#if displayManga.description.length > 220}
              <button class="desc-toggle" onclick={() => descExpanded = !descExpanded}>
                {descExpanded ? "Show less" : "Show more"}
                <CaretDown
                  size={10}
                  weight="light"
                  style="transform:{descExpanded ? 'rotate(180deg)' : 'none'};transition:transform 0.15s ease"
                />
              </button>
            {/if}
          </div>
        {/if}


        {#if !loadingDetail && displayManga?.genre?.length}
          <div class="genres">
            {#each displayManga.genre as g}
              <button
                class="genre-tag"
                onclick={() => { setGenreFilter(g); setNavPage("search"); close(); }}
              >{g}</button>
            {/each}
          </div>
        {/if}


        {#if !loadingDetail}
          <div class="meta-table">
            <div class="meta-grid">
              <div class="meta-col">
                <div class="meta-row">
                  <span class="meta-key">Status</span>
                  <span class="meta-val">{statusLabel ?? "N/A"}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-key">Source</span>
                  <span class="meta-val">{displayManga?.source?.displayName ?? "N/A"}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-key">Link</span>
                  {#if displayManga?.realUrl}
                    <a href={displayManga.realUrl} target="_blank" rel="noreferrer" class="meta-link">
                      Open <ArrowSquareOut size={11} weight="light" />
                    </a>
                  {:else}
                    <span class="meta-val">N/A</span>
                  {/if}
                </div>
              </div>
              <div class="meta-col">
                <div class="meta-row">
                  <span class="meta-key">Author</span>
                  <span class="meta-val">{displayManga?.author ?? "N/A"}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-key">Artist</span>
                  <span class="meta-val">
                    {displayManga?.artist && displayManga.artist !== displayManga.author
                      ? displayManga.artist
                      : (displayManga?.author ?? "N/A")}
                  </span>
                </div>
                <div class="meta-row">
                  <span class="meta-key">Scanlator</span>
                  <span class="meta-val">
                    {!loadingChapters && scanlators.length > 0 ? scanlators[0] : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

  </div>
</div>
{/if}


{#if linkPickerOpen && store.previewManga}
  <SeriesLinkPanel
    manga={displayManga ?? store.previewManga}
    allManga={allMangaForLink}
    onClose={closeLinkPicker}
  />
{/if}

{#if coverPickerOpen && store.previewManga}
  <CoverPickerPanel
    manga={displayManga ?? store.previewManga}
    allManga={allMangaForLink}
    onClose={() => { coverPickerOpen = false; }}
  />
{/if}

<script module>
  function focusAction(node: HTMLElement) { node.focus(); }
</script>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: var(--z-settings);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.12s ease both;
  }
  .modal {
    width: min(800px, calc(100vw - 48px));
    height: min(560px, calc(100vh - 80px));
    display: flex;
    flex-direction: row;
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: 0 0 0 1px var(--border-dim), 0 24px 64px rgba(0,0,0,0.6);
    animation: scaleIn 0.16s ease both;
  }

  .cover-col {
    width: 190px; flex-shrink: 0;
    background: var(--bg-raised);
    border-right: 1px solid var(--border-dim);
    display: flex; flex-direction: column;
    padding: var(--sp-5) var(--sp-4) var(--sp-4);
    gap: var(--sp-3);
    overflow: hidden;
  }
  .cover-wrap { position: relative; width: 100%; }
  :global(.cover) {
    width: 100%; aspect-ratio: 2/3;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-dim);
    display: block;
  }
  .cover-spinner {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.35);
    border-radius: var(--radius-md);
    color: var(--text-faint);
  }
  .cover-actions { display: flex; flex-direction: column; gap: var(--sp-2); }

  .action-btn {
    display: flex; align-items: center; gap: var(--sp-2);
    width: 100%; padding: 7px var(--sp-3);
    border-radius: var(--radius-md);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    border: 1px solid var(--border-strong); background: none; color: var(--text-muted);
    cursor: pointer; text-align: left;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .action-btn:hover:not(:disabled) { color: var(--accent-fg); border-color: var(--accent); background: var(--accent-muted); }
  .action-btn:disabled             { opacity: 0.4; cursor: default; }
  .action-btn.active               { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
  .action-icon  { display: flex; align-items: center; justify-content: center; width: 16px; flex-shrink: 0; }
  .action-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

  .folder-wrap { position: relative; width: 100%; }
  .folder-menu {
    position: absolute; bottom: calc(100% + 4px); left: 0; right: 0;
    background: var(--bg-raised);
    border: 1px solid var(--border-base); border-radius: var(--radius-md);
    padding: var(--sp-1);
    display: flex; flex-direction: column; gap: 1px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 10;
    animation: scaleIn 0.1s ease both;
    transform-origin: bottom center;
  }
  .folder-empty { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); padding: var(--sp-2) var(--sp-3); }
  .folder-item {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: 6px var(--sp-3); border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-muted); background: none; border: none;
    cursor: pointer; text-align: left;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .folder-item:hover          { background: var(--bg-overlay); color: var(--text-primary); }
  .folder-item.folder-item-on { color: var(--accent-fg); }
  .folder-divider     { height: 1px; background: var(--border-dim); margin: var(--sp-1) 0; }
  .folder-create-row  { display: flex; gap: var(--sp-1); padding: var(--sp-1); }
  .folder-input {
    flex: 1; min-width: 0;
    background: var(--bg-overlay);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    padding: 4px 8px; color: var(--text-secondary);
    font-family: var(--font-ui); font-size: var(--text-xs);
    outline: none;
  }
  .folder-input:focus { border-color: var(--border-focus); }
  .folder-ok {
    font-family: var(--font-ui); font-size: var(--text-xs);
    padding: 4px 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: none; color: var(--text-muted);
    cursor: pointer; flex-shrink: 0;
    transition: color var(--t-base);
  }
  .folder-ok:disabled             { opacity: 0.4; cursor: default; }
  .folder-ok:not(:disabled):hover { color: var(--accent-fg); border-color: var(--accent); }
  .folder-new {
    padding: 6px var(--sp-3); border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint);
    background: none; border: none; cursor: pointer; text-align: left; width: 100%;
    transition: color var(--t-fast);
  }
  .folder-new:hover { color: var(--accent-fg); }

  .content {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .content-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: var(--sp-4); padding: var(--sp-5) var(--sp-6) var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .title-block { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
  .title   { font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); line-height: var(--leading-tight); }
  .byline  { font-size: var(--text-sm); color: var(--text-muted); line-height: var(--leading-snug); }
  .sk-byline { height: 14px; width: 55%; background: var(--bg-overlay); border-radius: var(--radius-sm); animation: pulse 1.4s ease infinite; }
  .close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; flex-shrink: 0;
    border-radius: var(--radius-sm); color: var(--text-faint);
    background: none; border: none; cursor: pointer;
    transition: color var(--t-base), background var(--t-base);
  }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .content-body {
    flex: 1; min-height: 0;
    overflow-y: auto;
    padding: var(--sp-5) var(--sp-6);
    display: flex; flex-direction: column; gap: var(--sp-4);
    scrollbar-width: none;
  }
  .content-body::-webkit-scrollbar { display: none; }

  .error-banner {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: #f59e0b; background: rgba(245,158,11,0.1);
    border: 1px solid rgba(245,158,11,0.25); border-radius: var(--radius-sm);
    padding: 6px var(--sp-3);
  }
  .sk-row   { display: flex; gap: var(--sp-2); align-items: center; }
  .sk-badge { height: 20px; width: 54px; background: var(--bg-overlay); border-radius: var(--radius-sm); animation: pulse 1.4s ease infinite; }
  .sk-desc  { display: flex; flex-direction: column; gap: 8px; padding: var(--sp-2) 0; }
  .sk-line  { height: 13px; background: var(--bg-overlay); border-radius: var(--radius-sm); animation: pulse 1.4s ease infinite; }

  .badges { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .badge  {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide); text-transform: uppercase;
    padding: 3px 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint);
  }
  .badge-green  { background: rgba(34,197,94,0.12);  border-color: rgba(34,197,94,0.3);  color: #22c55e; }
  .badge-accent { background: var(--accent-muted);   border-color: var(--accent-dim);    color: var(--accent-fg); }
  .badge-unread { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.3); color: #f59e0b; }

  .chapter-box           { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); }
  .chapter-loading       { display: flex; align-items: center; gap: var(--sp-2); }
  .chapter-loading-label { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .chapter-meta          { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
  .chapter-label         { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); }
  .dl-all-btn {
    display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0;
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 3px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: none; color: var(--text-faint);
    cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base);
  }
  .dl-all-btn:hover:not(:disabled) { color: var(--text-muted); border-color: var(--border-strong); }
  .dl-all-btn:disabled             { opacity: 0.5; cursor: default; }
  .progress-track { height: 3px; background: var(--bg-overlay); border-radius: var(--radius-full); overflow: hidden; }
  .progress-fill  { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.3s ease; }
  .read-btn {
    display: flex; align-items: center; gap: var(--sp-2); align-self: flex-start;
    padding: 8px var(--sp-4); border-radius: var(--radius-md);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    background: var(--accent-muted); border: 1px solid var(--accent-dim); color: var(--accent-fg);
    cursor: pointer;
    transition: filter var(--t-base);
  }
  .read-btn:hover { filter: brightness(1.1); }

  .desc-block { display: flex; flex-direction: column; gap: var(--sp-2); border-top: 1px solid var(--border-dim); padding-top: var(--sp-3); }
  .desc       { font-size: var(--text-sm); color: var(--text-muted); line-height: var(--leading-base); display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .desc.desc-open { display: block; -webkit-line-clamp: unset; overflow: visible; }
  .desc-toggle {
    display: flex; align-items: center; gap: var(--sp-1); align-self: flex-start;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint);
    background: none; border: none; cursor: pointer; padding: 0;
    transition: color var(--t-base);
  }
  .desc-toggle:hover { color: var(--accent-fg); }

  .genres    { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
  .genre-tag {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 3px 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint);
    cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .genre-tag:hover { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .meta-table { display: flex; flex-direction: column; gap: 1px; border-top: 1px solid var(--border-dim); padding-top: var(--sp-3); }
  .meta-grid  { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--sp-4); }
  .meta-col   { display: flex; flex-direction: column; }
  .meta-row   { display: flex; align-items: baseline; gap: var(--sp-3); padding: 5px 0; }
  .meta-key   { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); text-transform: uppercase; min-width: 56px; flex-shrink: 0; }
  .meta-val   { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta-link  { display: inline-flex; align-items: center; gap: 4px; font-size: var(--text-sm); color: var(--accent-fg); text-decoration: none; transition: opacity var(--t-base); }
  .meta-link:hover { opacity: 0.75; }

  :global(.anim-spin) { animation: anim-spin 0.8s linear infinite; }
  @keyframes anim-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes pulse     { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.8 } }
  @keyframes fadeIn    { from { opacity: 0 }                         to { opacity: 1 }              }
  @keyframes scaleIn   { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>