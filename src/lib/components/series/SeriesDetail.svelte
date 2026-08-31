<script lang="ts">
  import { untrack }      from 'svelte'
  import { goto }         from '$app/navigation'
  import SeriesHeader     from '$lib/components/series/SeriesHeader.svelte'
  import SeriesActions    from '$lib/components/series/SeriesActions.svelte'
  import ChapterList      from '$lib/components/series/ChapterList.svelte'
  import {
    CheckCircle, Circle, ArrowFatLinesUp, ArrowFatLinesDown,
    ArrowFatLineUp, ArrowFatLineDown, Download, Trash, DownloadSimple, CheckSquare,
  } from 'phosphor-svelte'

  type MenuSeparator = { separator: true }
  type MenuItem     = { label: string; icon?: any; onClick: () => void; danger?: boolean; disabled?: boolean; separator?: never; children?: MenuEntry[] }
  type MenuEntry    = MenuItem | MenuSeparator
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { downloadStore }             from '$lib/state/downloads.svelte'
  import { saveScroll, getScroll }     from '$lib/state/app.svelte'
  import { seriesState, openReaderForChapter, acknowledgeUpdate, addBookmark, seriesHref } from '$lib/state/series.svelte'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { libraryState, loadLibrary } from '$lib/state/library.svelte'
  import { DEFAULT_MANGA_PREFS }       from '$lib/state/series.svelte'
  import type { MangaPrefs }           from '$lib/types/settings'
  import { addToast }                  from '$lib/state/notifications.svelte'
  import { trackingState }             from '$lib/state/tracking.svelte'
  import { getPref, setPref }          from '$lib/state/series.svelte'
  import { openMangaFolder }           from '$lib/core/filesystem'
  import type { Manga, Chapter } from '$lib/types'
  import type { Folder, TrackLink } from '$lib/server-adapters/types'
  import AutomationPanel  from '$lib/components/series/panels/AutomationPanel.svelte'
  import CoverPickerPanel from '$lib/components/series/panels/CoverPickerPanel.svelte'
  import TrackerPanel     from '$lib/components/series/panels/TrackerPanel.svelte'
  import MigrateModal     from '$lib/components/shared/manga/MigrateModal.svelte'
  import SeriesLinkPanel  from '$lib/components/shared/manga/SeriesLinkPanel.svelte'

  interface Props { extensionId: string; sourceEntryId: string; mid?: string }
  let { extensionId, sourceEntryId, mid }: Props = $props()

  const mangaId = $derived(`${extensionId}:${sourceEntryId}`)

  let manga = $state<Manga | null>(null)

  const realMediaId = $derived(manga?.mediaId ?? manga?.libraryEntryId ?? '')
  const isLocal = $derived(manga != null && !manga.extensionId)

  const MANGA_TTL_MS  = 5 * 60 * 1000
  const mangaCache: Map<string, { data: Manga; fetchedAt: number }> = new Map()

  let loadingManga:    boolean      = $state(false)
  let enqueueing:      Set<string>  = $state(new Set())
  let togglingLibrary: boolean      = $state(false)
  const viewMode = $derived(settingsState.settings.chapterViewMode ?? 'list')
  let deletingAll:     boolean      = $state(false)
  let refreshing:      boolean      = $state(false)
  let selectedIds:     Set<string>  = $state(new Set())
  let migrateOpen:     boolean      = $state(false)
  let autoOpen:        boolean      = $state(false)
  let linkPickerOpen:  boolean      = $state(false)
  let coverPickerOpen: boolean      = $state(false)
  let allMangaForLink: Manga[]      = $state([])
  let loadingLinkList: boolean      = $state(false)
  let mangaFolders:    Folder[]     = $state([])
  let allFolders:      Folder[]     = $state([])
  let catsLoading:     boolean      = $state(false)
  let trackLinks:      TrackLink[]  = $state([])
  let trackerOpen:     boolean      = $state(false)
  let chapterListEl:   HTMLDivElement | null = $state(null)
  let chapterListRef:  ChapterList | undefined = $state(undefined)

  let mangaAbort:  AbortController | null = null
  let prevMangaId: string | null = null

  const get = <K extends keyof MangaPrefs>(key: K) => getPref(mangaId, key)
  const set = <K extends keyof MangaPrefs>(key: K, value: MangaPrefs[K]) => setPref(mangaId, key, value)

  const chapters        = $derived(seriesState.chaptersFor(mangaId))
  const loadingChapters = $derived(seriesState.isLoadingChapters(mangaId))
  const sortedChapters  = $derived(seriesState.activeChapterList)
  const hasSelection    = $derived(selectedIds.size > 0)

  const availableScanlators = $derived(
    [...new Set(chapters.map(c => c.scanlator).filter((s): s is string => !!s?.trim()))]
      .sort((a, b) => a.localeCompare(b))
  )

  const scanlatorFilter    = $derived(get('scanlatorFilter')    as string[])
  const scanlatorBlacklist = $derived(get('scanlatorBlacklist') as string[])
  const scanlatorForce     = $derived(get('scanlatorForce')     as boolean)

  const readCount       = $derived(sortedChapters.filter(c => c.read).length)
  const totalCount      = $derived(sortedChapters.length)
  const progressPct     = $derived(totalCount > 0 ? (readCount / totalCount) * 100 : 0)
  const downloadedCount = $derived(chapters.filter(c => c.downloaded).length)

  const continueChapter = $derived((() => {
    const asc = seriesState.readerChapterList
    if (!asc.length) return null
    const anyRead  = asc.some(c => c.read)
    const bookmark = seriesState.bookmarks.find(b => b.mangaId === mangaId)
    const bookmarkedCh = bookmark ? asc.find(c => c.id === bookmark.chapterId) : null
    if (bookmarkedCh && !bookmarkedCh.read)
      return { chapter: bookmarkedCh, type: (anyRead ? 'continue' : 'start') as 'continue' | 'start', resumePage: bookmark!.pageNumber }
    const inProgress  = asc.find(c => !c.read && (c.lastPageRead ?? 0) > 0)
    const firstUnread = asc.find(c => !c.read)
    const target      = inProgress ?? firstUnread
    if (target) return { chapter: target, type: (anyRead ? 'continue' : 'start') as 'continue' | 'start', resumePage: null }
    return { chapter: asc[0], type: 'reread' as const, resumePage: null }
  })())

  const hasAnyAutomation = $derived(
    get('autoDownload')                       ||
    (get('downloadAhead') as number) > 0      ||
    (get('maxKeepChapters') as number) > 0    ||
    get('deleteOnRead')                       ||
    get('pauseUpdates')                       ||
    get('refreshInterval') !== 'global'       ||
    !!(get('preferredScanlator') as string)
  )

  const linkedIds = $derived(seriesState.settings.mangaLinks?.[mangaId] ?? [])

  function clearSelection() { selectedIds = new Set() }

  function toggleSelect(id: string, e: MouseEvent | KeyboardEvent) {
    e.stopPropagation()
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    selectedIds = next
  }

  async function loadFolders(id: string) {
    catsLoading = true
    try {
      const [all, entry] = await Promise.all([tsunagu.folders(), tsunagu.libraryEntry(id)])
      allFolders   = all
      mangaFolders = entry?.folders ?? []
      trackLinks   = entry?.trackLinks ?? []
    } catch (e) {
      console.error(e)
    } finally {
      catsLoading = false
    }
    maybePullTracker(id)
  }

  let pulledMediaId: string | null = null
  async function maybePullTracker(id: string) {
    if (!id || pulledMediaId === id || trackLinks.length === 0) return
    pulledMediaId = id
    try {
      trackLinks = await tsunagu.pullTracker(id)
      await seriesState.loadChapters(mangaId, { force: true, mediaId: id })
    } catch (e) {
      console.error('pullTracker', e)
    }
  }

  async function checkAndMarkCompleted(_id: string, _chaps: Chapter[]) {}

  function mapEntryToManga(entry: Awaited<ReturnType<typeof tsunagu.libraryEntry>>, key: string): Manga | null {
    if (!entry) return null
    return {
      id: key,
      title: entry.title,
      thumbnailUrl: entry.thumbnailUrl ?? '',
      inLibrary: entry.inLibrary ?? false,
      contentType: entry.contentType,
      description: entry.description,
      status: entry.status,
      author: entry.author,
      artist: entry.artist,
      genre: entry.genres,
      tags: entry.tags,
      unreadCount: entry.unreadCount,
      downloadCount: entry.downloadCount,
      extensionId:    entry.source?.id,
      sourceName:     entry.sourceName ?? entry.extensionName ?? null,
      source:         entry.source
        ? { id: entry.source.id, name: entry.source.name, displayName: entry.source.displayName, isNsfw: entry.source.isNsfw, iconUrl: entry.source.iconUrl }
        : null,
      sourceEntryId:  entry.externalId,
      mediaId:        entry.id,
      libraryEntryId: entry.inLibrary ? entry.id : null,
    }
  }

  function knownMediaId(): string | null {
    if (mid && /^\d+$/.test(mid)) return mid
    const lib = libraryState.items.find(m =>
      m.sourceEntryId === sourceEntryId &&
      String(m.extensionId ?? '') === String(extensionId))
    return lib?.mediaId ?? lib?.libraryEntryId ?? null
  }

  async function resolveViaSource(signal: AbortSignal): Promise<string | null> {
    const info = await tsunagu.mangaInfo(extensionId, sourceEntryId, false)
    return signal.aborted ? null : (info?.id ?? null)
  }

  async function resolveOpenId(signal: AbortSignal): Promise<string | null> {
    return knownMediaId() ?? await resolveViaSource(signal)
  }

  function loadMangaData(id: string): Promise<Manga | null> {
    mangaAbort?.abort()
    const ctrl = new AbortController()
    mangaAbort = ctrl

    const cached = mangaCache.get(id)
    if (cached) {
      manga = cached.data
      loadingManga = false
      seriesState.setActiveManga(cached.data)
      if (Date.now() - cached.fetchedAt < MANGA_TTL_MS) return Promise.resolve(cached.data)
    } else {
      manga = null
      seriesState.setActiveManga(null)
      loadingManga = true
    }

    return (async () => {
      try {
        let realId = cached?.data.mediaId ?? cached?.data.libraryEntryId ?? await resolveOpenId(ctrl.signal)
        if (ctrl.signal.aborted) return cached?.data ?? null
        if (!realId) throw new Error('Could not resolve a media id for this entry')

        let entry = await tsunagu.libraryEntry(realId)
        if (ctrl.signal.aborted) return cached?.data ?? null
        if (!entry) {
          // stale/removed id (e.g. after a migration) — re-resolve against the source
          realId = await resolveViaSource(ctrl.signal)
          if (ctrl.signal.aborted) return cached?.data ?? null
          entry = realId ? await tsunagu.libraryEntry(realId) : null
        }
        if (!entry) throw new Error(`Media ${realId} not found`)

        const m = mapEntryToManga(entry, id)
        if (!m) return cached?.data ?? null
        mangaCache.set(id, { data: m, fetchedAt: Date.now() })
        manga = m
        seriesState.setActiveManga(m)
        seriesState.ingestEntry(id, entry)
        return m
      } catch (e: any) {
        if (e?.name === 'AbortError') return cached?.data ?? null
        console.error(`loadMangaData: failed to load ${id}`, e)
        if (!cached) addToast({ kind: 'error', title: 'Could not load series', body: e?.message ?? 'Unknown error' })
        return cached?.data ?? null
      } finally {
        if (!ctrl.signal.aborted) loadingManga = false
      }
    })()
  }

  $effect(() => {
    const id             = mangaId
    const extId          = extensionId
    const srcId          = sourceEntryId
    const shouldAutoLink = seriesState.settings.autoLinkOnOpen
    untrack(() => {
      acknowledgeUpdate(id)
      loadMangaData(id).then(m => {
        seriesState.loadChapters(id, {
          mediaId: m?.mediaId ?? m?.libraryEntryId ?? null,
        }).then(() => {
          checkAndMarkCompleted(id, seriesState.chaptersFor(id))
        })
        if (m?.libraryEntryId) loadFolders(m.libraryEntryId)
      })
      if (shouldAutoLink) {
        console.warn('autoLinkOnOpen: not wired to tsunagu yet, skipping')
      }
    })
  })

  let hadChapterOpen = false
  $effect(() => {
    const isOpen = seriesState.activeChapter !== null
    if (hadChapterOpen && !isOpen) {
      untrack(() => seriesState.loadChapters(mangaId, { force: true, mediaId: realMediaId }))
    }
    hadChapterOpen = isOpen
  })

  $effect(() => {
    const id = mangaId
    if (id === prevMangaId) return
    if (chapterListEl && prevMangaId !== null) saveScroll(`series:${prevMangaId}`, chapterListEl.scrollTop)
    prevMangaId = id
    if (chapterListEl) chapterListEl.scrollTo({ top: getScroll(`series:${id}`) })
  })

  $effect(() => () => { mangaAbort?.abort() })

  async function toggleLibrary() {
    if (!manga || !realMediaId || togglingLibrary) return
    const next = !manga.inLibrary
    togglingLibrary = true
    try {
      await tsunagu.setInLibrary(realMediaId, next)
      manga.inLibrary = next
      if (next) {
        manga.libraryEntryId = realMediaId
        loadFolders(realMediaId)
      } else {
        manga.libraryEntryId = null
        mangaFolders = []
      }
      mangaCache.delete(mangaId)
      await loadLibrary(true)
    } catch (e) {
      addToast({ kind: 'error', title: next ? "Couldn't add to library" : "Couldn't remove", body: String(e) })
    } finally {
      togglingLibrary = false
    }
  }

  async function enqueue(ch: Chapter, e: MouseEvent) {
    e.stopPropagation()
    enqueueing = new Set(enqueueing).add(ch.id)
    const allowed = await downloadStore.enqueue(ch.id, realMediaId)
    if (allowed) addToast({ kind: 'download', title: 'Download queued', body: ch.name })
    enqueueing.delete(ch.id); enqueueing = new Set(enqueueing)
    seriesState.loadChapters(mangaId, { force: true, mediaId: realMediaId })
  }

  async function enqueueMultiple(chapterIds: string[]) {
    if (!chapterIds.length) return
    for (const id of chapterIds) {
      const allowed = await downloadStore.enqueue(id, realMediaId)
      if (!allowed) return
    }
    addToast({ kind: 'download', title: 'Download queued', body: `${chapterIds.length} chapter${chapterIds.length !== 1 ? 's' : ''} added` })
    seriesState.loadChapters(mangaId, { force: true, mediaId: realMediaId })
  }

  async function pushTrackerProgress() {
    if (trackLinks.length === 0) return
    const chaps   = seriesState.chaptersFor(mangaId)
    const highest = chaps.reduce((m, c) => (c.read && c.chapterNumber > m ? c.chapterNumber : m), 0)
    if (highest <= 0) return

    const updated = await Promise.all(
      trackLinks.map(async (l) => {
        if (highest <= l.lastChapterRead) return l
        try { return await tsunagu.updateTrack(l.id, { lastChapterRead: highest }) }
        catch { return l }
      }),
    )
    trackLinks = updated
    trackingState.loadAll(true).catch(() => {})
  }

  async function markRead(chapterId: string, isRead: boolean) {
    if (!realMediaId) { console.warn('markRead: no media id'); return }
    await tsunagu.markChaptersRead(realMediaId, [chapterId], isRead).catch(console.error)
    seriesState.patchChapters(mangaId, chaps => chaps.map(c => c.id === chapterId ? { ...c, read: isRead } : c))
    checkAndMarkCompleted(mangaId, seriesState.chaptersFor(mangaId))
    const ch = seriesState.chaptersFor(mangaId).find(c => c.id === chapterId)
    if (isRead) {
      pushTrackerProgress().catch(console.error)
      if (get('deleteOnRead') && ch?.downloaded) {
        const delayMs = (get('deleteDelayHours') as number) * 3_600_000
        const doDelete = () => deleteDownloaded(chapterId)
        if (delayMs === 0) doDelete(); else setTimeout(doDelete, delayMs)
      }
      const ahead = get('downloadAhead') as number
      if (ahead > 0) {
        const idx = sortedChapters.findIndex(c => c.id === chapterId)
        if (idx >= 0) {
          const toQueue = sortedChapters.slice(idx + 1, idx + 1 + ahead).filter(c => !c.downloaded).map(c => c.id)
          if (toQueue.length) enqueueMultiple(toQueue)
        }
      }
    }
  }

  async function markBulk(ids: string[], isRead: boolean) {
    if (!ids.length) return
    if (!realMediaId) { console.warn('markBulk: no media id'); return }
    await tsunagu.markChaptersRead(realMediaId, ids, isRead).catch(console.error)
    const idSet = new Set(ids)
    seriesState.patchChapters(mangaId, chaps => chaps.map(c => idSet.has(c.id) ? { ...c, read: isRead } : c))
    checkAndMarkCompleted(mangaId, seriesState.chaptersFor(mangaId))
    if (isRead) pushTrackerProgress().catch(console.error)
    if (isRead && get('deleteOnRead')) {
      const toDelete = ids.filter(id => seriesState.chaptersFor(mangaId).find(c => c.id === id)?.downloaded)
      if (toDelete.length) {
        const delayMs = (get('deleteDelayHours') as number) * 3_600_000
        const doDelete = async () => {
          await Promise.all((toDelete).map(id => tsunagu.deleteDownload(realMediaId, id))).catch(console.error)
          seriesState.patchChapters(mangaId, chaps => chaps.map(c => toDelete.includes(c.id) ? { ...c, downloaded: false } : c))
        }
        if (delayMs === 0) doDelete(); else setTimeout(doDelete, delayMs)
      }
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds].filter(id => seriesState.chaptersFor(mangaId).find(c => c.id === id)?.downloaded)
    if (ids.length) {
      await Promise.all((ids).map(id => tsunagu.deleteDownload(realMediaId, id))).catch(console.error)
      seriesState.patchChapters(mangaId, chaps => chaps.map(c => ids.includes(c.id) ? { ...c, downloaded: false } : c))
    }
    clearSelection()
  }

  async function downloadSelected() {
    await enqueueMultiple([...selectedIds].filter(id => !seriesState.chaptersFor(mangaId).find(c => c.id === id)?.downloaded))
    clearSelection()
  }

  async function markSelectedRead(isRead: boolean) {
    await markBulk([...selectedIds], isRead)
    clearSelection()
  }

  const markAboveRead   = (i: number) => markBulk(sortedChapters.slice(0, i + 1).filter(c => !c.read).map(c => c.id), true)
  const markBelowRead   = (i: number) => markBulk(sortedChapters.slice(i).filter(c => !c.read).map(c => c.id), true)
  const markAboveUnread = (i: number) => markBulk(sortedChapters.slice(0, i + 1).filter(c => c.read).map(c => c.id), false)
  const markBelowUnread = (i: number) => markBulk(sortedChapters.slice(i).filter(c => c.read).map(c => c.id), false)

  async function deleteDownloaded(chapterId: string) {
    await Promise.all(([chapterId]).map(id => tsunagu.deleteDownload(realMediaId, id))).catch(console.error)
    seriesState.patchChapters(mangaId, chaps => chaps.map(c => c.id === chapterId ? { ...c, downloaded: false } : c))
  }

  async function deleteAllDownloads() {
    const ids = seriesState.chaptersFor(mangaId).filter(c => c.downloaded).map(c => c.id)
    if (!ids.length) return
    deletingAll = true
    await Promise.all((ids).map(id => tsunagu.deleteDownload(realMediaId, id))).catch(console.error)
    seriesState.patchChapters(mangaId, chaps => chaps.map(c => ({ ...c, downloaded: false })))
    deletingAll = false
  }

  async function refreshChapters() {
    if (refreshing || isLocal) return
    if (!manga?.libraryEntryId) { addToast({ kind: 'error', title: 'Add to library first', body: 'Chapters refresh automatically for series not yet in your library.' }); return }
    refreshing = true
    seriesState.invalidateChapters(mangaId)
    tsunagu.syncChapters(manga.libraryEntryId)
      .then(() => seriesState.loadChapters(mangaId, { force: true, mediaId: realMediaId }))
      .then(() => {
        const count = seriesState.chaptersFor(mangaId).length
        addToast({ kind: 'success', title: 'Chapters refreshed', body: `${count} chapter${count !== 1 ? 's' : ''} available` })
      })
      .catch(e => addToast({ kind: 'error', title: 'Refresh failed', body: e?.message }))
      .finally(() => { refreshing = false })
  }

  function buildCtxItems(ch: Chapter, idx: number): MenuEntry[] {
    const above = sortedChapters.slice(0, idx + 1)
    const below = sortedChapters.slice(idx)
    const last  = sortedChapters.length - 1
    const items: MenuEntry[] = [
      { label: ch.read ? 'Mark as unread' : 'Mark as read', icon: ch.read ? Circle : CheckCircle, onClick: () => markRead(ch.id, !ch.read) },
      { label: 'Select', icon: CheckSquare, onClick: () => { const next = new Set(selectedIds); next.add(ch.id); selectedIds = next } },
      { separator: true },
      { label: 'Mark above as read',   icon: ArrowFatLinesUp,   onClick: () => markAboveRead(idx),   disabled: above.filter(c => !c.read).length === 0 },
      { label: 'Mark above as unread', icon: ArrowFatLineUp,    onClick: () => markAboveUnread(idx), disabled: above.filter(c => c.read).length === 0 },
      { separator: true },
      { label: 'Mark below as read',   icon: ArrowFatLinesDown, onClick: () => markBelowRead(idx),   disabled: idx === last || below.filter(c => !c.read).length === 0 },
      { label: 'Mark below as unread', icon: ArrowFatLineDown,  onClick: () => markBelowUnread(idx), disabled: idx === last || below.filter(c => c.read).length === 0 },
    ]
    if (!isLocal) {
      items.push(
        { separator: true },
        { label: ch.downloaded ? 'Delete download' : 'Download', icon: ch.downloaded ? Trash : Download, danger: ch.downloaded, onClick: () => ch.downloaded ? deleteDownloaded(ch.id) : downloadStore.enqueue(ch.id, realMediaId) },
        { separator: true },
        { label: 'Download next 5 from here', icon: DownloadSimple, onClick: () => enqueueMultiple(sortedChapters.slice(idx, idx + 5).filter(c => !c.downloaded).map(c => c.id)) },
        { label: 'Download all from here',    icon: DownloadSimple, onClick: () => enqueueMultiple(sortedChapters.slice(idx).filter(c => !c.downloaded).map(c => c.id)) },
      )
    }
    return items
  }

  function enqueueNext(n: number) {
    if (!continueChapter) return
    const idx = sortedChapters.indexOf(continueChapter.chapter)
    if (idx < 0) return
    enqueueMultiple(sortedChapters.slice(idx, idx + n).filter(c => !c.downloaded).map(c => c.id))
  }

  function openReaderWithAhead(ch: Chapter, inProgress: boolean) {
    if (inProgress && ch.lastPageRead && ch.lastPageRead > 1) {
      const existing = seriesState.bookmarks.find(b => b.chapterId === ch.id)
      if (!existing || existing.pageNumber < ch.lastPageRead) {
        addBookmark({
          mangaId,
          mangaTitle:   manga!.title,
          thumbnailUrl: manga!.thumbnailUrl,
          chapterId:    ch.id,
          chapterName:  ch.name,
          pageNumber:   ch.lastPageRead,
        })
      }
    }
    openReaderForChapter(ch, manga)
  }

  interface ContinueChapter { chapter: Chapter; type: 'start' | 'continue' | 'reread'; resumePage: number | null }
  function handleContinue(cc: ContinueChapter) {
    openReaderForChapter(cc.chapter, manga)
  }

  async function ensureMangaList() {
    if (allMangaForLink.length) return
    loadingLinkList = true
    try {
      if (!libraryState.items.length) await loadLibrary()
      allMangaForLink = libraryState.items
    } finally {
      loadingLinkList = false
    }
  }

  async function openLinkPicker() {
    linkPickerOpen = true
    ensureMangaList()
  }

  async function openCoverPicker() {
    coverPickerOpen = true
    ensureMangaList()
  }

  async function toggleFolder(folder: Folder) {
    if (!manga?.libraryEntryId) { addToast({ kind: 'error', title: 'Add to library first', body: 'Folders only apply to series in your library.' }); return }
    const inFolder = mangaFolders.some(f => f.id === folder.id)
    try {
      if (inFolder) await tsunagu.removeEntryFromFolder(manga.libraryEntryId, folder.id)
      else          await tsunagu.addEntryToFolder(manga.libraryEntryId, folder.id)
      mangaFolders = inFolder ? mangaFolders.filter(f => f.id !== folder.id) : [...mangaFolders, folder]
    } catch (e) { console.error(e) }
  }

  async function createNewFolder(name: string) {
    if (!name) return
    if (!manga?.libraryEntryId) { addToast({ kind: 'error', title: 'Add to library first', body: 'Folders only apply to series in your library.' }); return }
    try {
      const folder = await tsunagu.createFolder(name)
      await tsunagu.addEntryToFolder(manga.libraryEntryId, folder.id)
      allFolders   = [...allFolders, folder]
      mangaFolders = [...mangaFolders, folder]
    } catch (e) { console.error(e) }
  }
</script>

<div class="root" role="presentation" oncontextmenu={(e) => e.preventDefault()}>

  <SeriesHeader
    {isLocal}
    {manga}
    {loadingManga}
    {totalCount}
    {readCount}
    {progressPct}
    {downloadedCount}
    {deletingAll}
    {continueChapter}
    {hasAnyAutomation}
    {linkedIds}
    {allMangaForLink}
    {loadingLinkList}
    {mangaFolders}
    {togglingLibrary}
    trackLinkCount={trackLinks.length}
    onRead={(ch) => handleContinue(ch)}
    onToggleLibrary={toggleLibrary}
    onDeleteAll={deleteAllDownloads}
    onMigrateOpen={() => migrateOpen = true}
    onAutoOpen={() => autoOpen = true}
    onTrackerOpen={() => trackerOpen = true}
    onLinkPickerOpen={openLinkPicker}
    onCoverPickerOpen={openCoverPicker}
    onGenreClick={(genre) => goto(`/browse?genre=${encodeURIComponent(genre)}`)}
  />

  <div class="list-wrap" bind:this={chapterListEl}>
    <SeriesActions
      {isLocal}
      {chapters}
      {sortedChapters}
      sortMode={seriesState.settings.chapterSortMode}
      sortDir={seriesState.settings.chapterSortDir}
      {viewMode}
      {downloadedCount}
      {totalCount}
      {deletingAll}
      {hasSelection}
      selectedCount={selectedIds.size}
      {continueChapter}
      {availableScanlators}
      {scanlatorFilter}
      {scanlatorBlacklist}
      {scanlatorForce}
      {allFolders}
      {mangaFolders}
      {catsLoading}
      {refreshing}
      onViewModeToggle={() => updateSettings({ chapterViewMode: viewMode === 'list' ? 'grid' : 'list' })}
      onDownloadSelected={downloadSelected}
      onDeleteSelected={deleteSelected}
      onMarkSelectedRead={markSelectedRead}
      onClearSelection={clearSelection}
      onEnqueueNext={enqueueNext}
      onEnqueueMultiple={enqueueMultiple}
      onDeleteAll={deleteAllDownloads}
      onRefresh={refreshChapters}
      onToggleFolder={toggleFolder}
      onCreateFolder={createNewFolder}
      onSetScanlatorFilter={(v) => set('scanlatorFilter', v)}
      onSetScanlatorBlacklist={(v) => set('scanlatorBlacklist', v)}
      onSetScanlatorForce={(v) => set('scanlatorForce', v)}
      onSortModeChange={(v) => updateSettings({ chapterSortMode: v })}
      onSortDirChange={(v) => updateSettings({ chapterSortDir: v })}
      onOpenFolder={() => manga && openMangaFolder(manga)}
      onJumpToChapter={(id) => chapterListRef?.scrollToChapter(id)}
    />

    <ChapterList
      bind:this={chapterListRef}
      {sortedChapters}
      {viewMode}
      {loadingChapters}
      {selectedIds}
      {enqueueing}
      {isLocal}
      onOpen={openReaderWithAhead}
      onToggleSelect={toggleSelect}
      onEnqueue={enqueue}
      onDeleteDownload={deleteDownloaded}
      {buildCtxItems}
    />
  </div>
</div>

{#if autoOpen && manga}
  <AutomationPanel mangaId={manga.id} {manga} onClose={() => autoOpen = false} />
{/if}

{#if trackerOpen && manga && realMediaId}
  <TrackerPanel
    mediaId={realMediaId}
    {manga}
    links={trackLinks}
    onChanged={() => { if (realMediaId) loadFolders(realMediaId) }}
    onClose={() => trackerOpen = false}
  />
{/if}


{#if linkPickerOpen && manga}
  <div class="modal-overlay" role="presentation" onclick={() => linkPickerOpen = false}>
    <div class="modal-dialog" role="presentation" onclick={(e) => e.stopPropagation()}>
      <SeriesLinkPanel {manga} allManga={allMangaForLink} onClose={() => linkPickerOpen = false} />
    </div>
  </div>
{/if}

{#if coverPickerOpen && manga}
  <div class="modal-overlay" role="presentation" onclick={() => coverPickerOpen = false}>
    <div class="modal-dialog" role="presentation" onclick={(e) => e.stopPropagation()}>
      <CoverPickerPanel
        {manga}
        mediaId={realMediaId}
        allManga={allMangaForLink}
        onApplied={(url) => { if (manga) manga.thumbnailUrl = url ?? manga.thumbnailUrl; mangaCache.delete(mangaId); loadLibrary(true) }}
        onClose={() => coverPickerOpen = false}
      />
    </div>
  </div>
{/if}

{#if migrateOpen && manga}
  <MigrateModal
    {manga}
    currentChapters={seriesState.chaptersFor(manga.id)}
    onClose={() => migrateOpen = false}
    onMigrated={(newManga) => { goto(seriesHref(newManga)); migrateOpen = false }}
  />
{/if}

<style>
  .root { display: flex; height: 100%; overflow: hidden; animation: fadeIn 0.14s ease both; }
  .list-wrap { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  @keyframes fadeIn   { from { opacity: 0 }                               to { opacity: 1 } }
  @keyframes drawerIn { from { opacity: 0; transform: translateX(-12px) } to { opacity: 1; transform: translateX(0) } }
  .modal-overlay { position: fixed; inset: 0; z-index: var(--z-settings); display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); animation: fadeIn 0.12s ease both; }
  .modal-dialog { width: 480px; max-width: 90vw; max-height: 80vh; background: var(--bg-surface); border: 1px solid var(--border-base); border-radius: var(--radius-lg); box-shadow: 0 8px 48px rgba(0,0,0,0.5); display: flex; flex-direction: column; animation: modalIn 0.18s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes modalIn { from { opacity: 0; transform: scale(0.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
</style>
