import type { Manga, Chapter }                      from '$lib/types'
import type { BookmarkEntry } from '$lib/types/history'
import type { MangaPrefs } from '$lib/types/settings'
import { DEFAULT_MANGA_PREFS }                            from '$lib/types/settings'
import { settingsState, updateSettings }              from '$lib/state/settings.svelte'
import { tsunagu }                                    from '$lib/server-adapters/tsunagu'
import type { LibraryEntry, Chapter as TsunaguChapter, MangaInfo } from '$lib/server-adapters/types'
import { buildChapterList }                           from '$lib/components/series/lib/chapterList'
import { clearPageCache }                             from '$lib/core/cache/pageCache'
import { sourceErrorInfo }                            from '$lib/core/sourceErrors'
import { goto }                                       from '$app/navigation'

export type { BookmarkEntry } from '$lib/types/history'
export type { MangaPrefs }                              from '$lib/types/settings'
export { DEFAULT_MANGA_PREFS }                           from '$lib/types/settings'


const CHAPTER_TTL_MS = 2 * 60 * 1000

export function seriesHref(m: {
  extensionId?: string; sourceEntryId?: string; mediaId?: string; libraryEntryId?: string | null; id?: string
}): string {
  const mid = m.mediaId ?? m.libraryEntryId ?? (m.id && /^\d+$/.test(m.id) ? m.id : '')
  const ext = m.extensionId ?? ''
  const src = m.sourceEntryId ?? ''
  if (!ext || !src) {
    return mid ? `/series/_/_?mid=${encodeURIComponent(mid)}` : '/library'
  }
  const base = `/series/${encodeURIComponent(ext)}/${encodeURIComponent(src)}`
  return mid ? `${base}?mid=${encodeURIComponent(mid)}` : base
}

export async function resolveMediaId(raw: string): Promise<string> {
  if (/^\d+$/.test(raw)) return raw
  const sep = raw.indexOf(':')
  if (sep < 0) return raw
  const m = await tsunagu.mangaInfo(raw.slice(0, sep), raw.slice(sep + 1), false)
  return m.id ?? raw
}

function mapManga(entry: LibraryEntry): Manga {
	return {
		id: entry.id,
		title: entry.title,
		thumbnailUrl: entry.thumbnailUrl ?? '',
		inLibrary: true,
		description: entry.description,
		status: entry.status,
		extensionId:    entry.source?.id,
		sourceName:     entry.sourceName ?? entry.extensionName ?? null,
		source:         entry.source
			? { id: entry.source.id, name: entry.source.name, displayName: entry.source.displayName, isNsfw: entry.source.isNsfw, iconUrl: entry.source.iconUrl }
			: null,
		sourceEntryId:  entry.externalId,
		libraryEntryId: entry.id,
	}
}

export function mapMangaInfo(info: MangaInfo, key: string): Manga {
	return {
		id: key,
		title: info.title,
		thumbnailUrl: info.thumbnailUrl ?? '',
		inLibrary: info.inLibrary,
		description: info.description,
		status: info.status,
		author: info.author,
		artist: info.artist,
		genre: info.genres,
		tags: info.tags,
		unreadCount: info.unreadCount,
		downloadCount: info.downloadCount,
		extensionId: info.extensionId ?? undefined,
		sourceEntryId: info.externalId,
		mediaId: info.id ?? undefined,
		libraryEntryId: info.inLibrary ? info.id : null,
	}
}

export function deriveChapterNumber(backendNumber: number | null | undefined, title: string): number {
	if (typeof backendNumber === 'number' && Number.isFinite(backendNumber) && backendNumber > 0) {
		return backendNumber
	}
	if (!title) return -1
	const tagged = title.match(/(?:chapter|chap|episode|\bch|\bep|#)[\s._-]*([0-9]+(?:\.[0-9]+)?)/i)
	if (tagged) return parseFloat(tagged[1])
	const bare = title.match(/(?:^|[\s([])([0-9]+(?:\.[0-9]+)?)(?:$|[\s):.\-–—])/)
	if (bare) return parseFloat(bare[1])
	return -1
}

function mapChapter(
	c: TsunaguChapter,
	mangaId: string,
	fallbackOrder: number,
): Chapter {
	return {
		id: c.id,
		name: c.title ?? '',
		chapterNumber: deriveChapterNumber(c.number, c.title ?? ''),
		sourceOrder: c.sourceOrder ?? fallbackOrder,
		read: c.completed ?? false,
		downloaded: c.downloaded ?? (c.download?.status === 'DONE'),
		bookmarked: false,
		pageCount: c.pageCount ?? 0,
		pages: [],
		mangaId,
		uploadDate: c.uploadedAt,
		scanlator: c.scanlator ?? null,
	}
}

class SeriesStore {
  activeManga         = $state<Manga | null>(null)
  previewManga        = $state<Manga | null>(null)
  activeChapter       = $state<Chapter | null>(null)
  bookmarks           = $state<BookmarkEntry[]>([])
  acknowledgedUpdates = $state<Set<string>>(new Set())

  #rawChapters = $state<Map<string, Chapter[]>>(new Map())
  #fetchedAt   = new Map<string, number>()
  #abortCtrls  = new Map<string, AbortController>()
  #loading     = $state<Set<string>>(new Set())
  #errors      = $state<Map<string, string>>(new Map())

  readonly activeChapterList = $derived.by(() => {
    const id = this.activeManga?.id
    if (id == null) return []
    const raw     = this.#rawChapters.get(id) ?? []
    const prefs   = settingsState.settings.mangaPrefs?.[this.activeManga?.prefsKey ?? id] ?? {}
    const globals = settingsState.settings
    return buildChapterList(raw, {
      sortMode:           globals.chapterSortMode,
      sortDir:            globals.chapterSortDir,
      preferredScanlator: (prefs.preferredScanlator  ?? DEFAULT_MANGA_PREFS.preferredScanlator),
      scanlatorFilter:    (prefs.scanlatorFilter     ?? DEFAULT_MANGA_PREFS.scanlatorFilter),
      scanlatorBlacklist: (prefs.scanlatorBlacklist  ?? DEFAULT_MANGA_PREFS.scanlatorBlacklist),
      scanlatorForce:     (prefs.scanlatorForce      ?? DEFAULT_MANGA_PREFS.scanlatorForce),
    })
  })

  readonly readerChapterList = $derived.by(() => {
    const id = this.activeManga?.id
    if (id == null) return []
    const raw   = this.#rawChapters.get(id) ?? []
    const prefs = settingsState.settings.mangaPrefs?.[this.activeManga?.prefsKey ?? id] ?? {}
    return buildChapterList(raw, {
      sortMode:           'source',
      sortDir:            'asc',
      preferredScanlator: (prefs.preferredScanlator  ?? DEFAULT_MANGA_PREFS.preferredScanlator),
      scanlatorFilter:    (prefs.scanlatorFilter     ?? DEFAULT_MANGA_PREFS.scanlatorFilter),
      scanlatorBlacklist: (prefs.scanlatorBlacklist  ?? DEFAULT_MANGA_PREFS.scanlatorBlacklist),
      scanlatorForce:     (prefs.scanlatorForce      ?? DEFAULT_MANGA_PREFS.scanlatorForce),
    })
  })

  chaptersFor(mangaId: string): Chapter[] { return this.#rawChapters.get(mangaId) ?? [] }
  isLoadingChapters(mangaId: string)      { return this.#loading.has(mangaId) }
  chapterError(mangaId: string)           { return this.#errors.get(mangaId) ?? null }

  async loadChapters(
    key: string,
    opts: { force?: boolean; mediaId?: string | null } = {}
  ): Promise<void> {
    const { force = false, mediaId } = opts
    const now    = Date.now()
    const stalest = this.#fetchedAt.get(key) ?? 0
    const fresh  = !force && this.#rawChapters.has(key) && now - stalest < CHAPTER_TTL_MS

    if (fresh) return
    if (!mediaId) { this.#errors = new Map(this.#errors).set(key, `loadChapters: no mediaId for ${key}`); return }

    this.#abortCtrls.get(key)?.abort()
    const ctrl = new AbortController()
    this.#abortCtrls.set(key, ctrl)

    this.#loading = new Set([...this.#loading, key])
    this.#errors  = new Map(this.#errors)
    this.#errors.delete(key)

    try {
      const entry = await tsunagu.libraryEntry(mediaId)
      if (ctrl.signal.aborted) return
      if (!entry) throw new Error(`Media ${mediaId} not found`)

      const nodes = entry.chapters.map((c, i) => mapChapter(c, key, i))
      this.#rawChapters = new Map(this.#rawChapters).set(key, nodes)
      this.#fetchedAt.set(key, Date.now())
    } catch (e: unknown) {
      if ((e as { name?: string }).name === 'AbortError') return
      const info = sourceErrorInfo(e)
      const msg = info
        ? (info.cloudflare ? 'This source is behind Cloudflare protection.' : `${info.label} — ${info.message}`)
        : (e instanceof Error ? e.message : String(e))
      this.#errors = new Map(this.#errors).set(key, msg)
    } finally {
      if (!ctrl.signal.aborted) {
        const next = new Set(this.#loading)
        next.delete(key)
        this.#loading = next
      }
    }
  }

  invalidateChapters(mangaId: string) {
    this.#fetchedAt.delete(mangaId)
  }

  ingestEntry(mangaId: string, entry: LibraryEntry) {
    if (this.#rawChapters.has(mangaId) && (Date.now() - (this.#fetchedAt.get(mangaId) ?? 0)) < CHAPTER_TTL_MS) return
    const nodes = entry.chapters.map((c, i) => mapChapter(c, mangaId, i))
    this.#rawChapters = new Map(this.#rawChapters).set(mangaId, nodes)
    this.#fetchedAt.set(mangaId, Date.now())
  }

  ingestMangaInfo(key: string, info: MangaInfo) {
    if (this.#rawChapters.has(key) && (Date.now() - (this.#fetchedAt.get(key) ?? 0)) < CHAPTER_TTL_MS) return
    if (!info.chapters) return
    const nodes = info.chapters.map((c, i) => mapChapter(c, key, i))
    this.#rawChapters = new Map(this.#rawChapters).set(key, nodes)
    this.#fetchedAt.set(key, Date.now())
  }

  patchChapters(mangaId: string, updater: (chapters: Chapter[]) => Chapter[]) {
    const current = this.#rawChapters.get(mangaId)
    if (!current) return
    this.#rawChapters = new Map(this.#rawChapters).set(mangaId, updater(current))
  }

  reconcileDownloadsCompleted(doneIds: Set<string>) {
    if (doneIds.size === 0) return
    let next: Map<string, Chapter[]> | null = null
    for (const [mangaId, list] of this.#rawChapters) {
      if (!list.some(c => doneIds.has(c.id) && !c.downloaded)) continue
      const patched = list.map(c => {
        if (!doneIds.has(c.id) || c.downloaded) return c
        clearPageCache(c.id)
        return { ...c, downloaded: true }
      })
      next ??= new Map(this.#rawChapters)
      next.set(mangaId, patched)
      this.#fetchedAt.delete(mangaId)
    }
    if (next) this.#rawChapters = next
  }

  markChaptersDeleted(mangaId: string, chapterIds: string[]) {
    if (!chapterIds.length) return
    const ids = new Set(chapterIds)
    ids.forEach(clearPageCache)
    this.patchChapters(mangaId, list =>
      list.map(c => ids.has(c.id) ? { ...c, downloaded: false, pageCount: 0, pages: [] } : c))
    this.#fetchedAt.delete(mangaId)
  }

  setActiveManga(manga: Manga | null)  { this.activeManga  = manga }
  setPreviewManga(manga: Manga | null) { this.previewManga = manga }

  openReaderForChapter(chapter: Chapter, manga?: Manga | null) {
    if (manga !== undefined) this.activeManga = manga
    const cacheKey = this.activeManga?.id
    if (!cacheKey) return

    const realMediaId = this.activeManga?.mediaId ?? this.activeManga?.libraryEntryId ?? cacheKey

    const list  = this.readerChapterList
    const prefs = settingsState.settings.mangaPrefs?.[cacheKey] ?? {}
    const ahead = (prefs.downloadAhead ?? DEFAULT_MANGA_PREFS.downloadAhead) as number

    if (ahead > 0) {
      const idx = list.findIndex(c => c.id === chapter.id)
      if (idx >= 0) {
        const toQueue = list
          .slice(idx + 1, idx + 1 + ahead)
          .filter(c => !c.downloaded && !c.read)
          .map(c => c.id)
        if (toQueue.length) {
          tsunagu.enqueueDownloads(realMediaId, toQueue).catch(console.error)
        }
      }
    }

    this.activeChapter = chapter
    goto(`/media/${encodeURIComponent(realMediaId)}/${encodeURIComponent(chapter.id)}`)
  }

  closeReader() {
    this.activeChapter = null
  }

  acknowledgeUpdate(mangaId: string) {
    if (this.acknowledgedUpdates.has(mangaId)) return
    this.acknowledgedUpdates = new Set([...this.acknowledgedUpdates, mangaId])
  }

  getPref<K extends keyof MangaPrefs>(mangaId: string, key: K): MangaPrefs[K] {
    const prefs = settingsState.settings.mangaPrefs?.[mangaId] ?? {}
    return (prefs[key] ?? DEFAULT_MANGA_PREFS[key]) as MangaPrefs[K]
  }

  setPref<K extends keyof MangaPrefs>(mangaId: string, key: K, value: MangaPrefs[K]) {
    updateSettings({
      mangaPrefs: {
        ...settingsState.settings.mangaPrefs,
        [mangaId]: { ...(settingsState.settings.mangaPrefs?.[mangaId] ?? {}), [key]: value },
      },
    })
  }

  setBookmark(entry: Omit<BookmarkEntry, 'savedAt'>) {
    this.bookmarks = [
      { ...entry, savedAt: Date.now() },
      ...this.bookmarks.filter(b => b.mangaId !== entry.mangaId),
    ].slice(0, 200)
  }

  removeBookmark(mangaId: string) { this.bookmarks = this.bookmarks.filter(b => b.mangaId !== mangaId) }
  clearBookmarks()                { this.bookmarks = [] }

  get settings() { return settingsState.settings }
}

export const seriesState = new SeriesStore()

export function setActiveManga(next: Manga | null)                                                  { seriesState.setActiveManga(next) }
export function setPreviewManga(next: Manga | null)                                                 { seriesState.setPreviewManga(next) }
export function openReaderForChapter(ch: Chapter, manga?: Manga | null)                             { seriesState.openReaderForChapter(ch, manga) }
export function closeReader()                                                                        { seriesState.closeReader() }
export function acknowledgeUpdate(mangaId: string)                                                  { seriesState.acknowledgeUpdate(mangaId) }
export function setBookmark(entry: Omit<BookmarkEntry, 'savedAt'>)                                  { seriesState.setBookmark(entry) }
export function removeBookmark(mangaId: string)                                                     { seriesState.removeBookmark(mangaId) }
export function clearBookmarks()                                                                     { seriesState.clearBookmarks() }
export function getPref<K extends keyof MangaPrefs>(mangaId: string, key: K): MangaPrefs[K]         { return seriesState.getPref(mangaId, key) }
export function setPref<K extends keyof MangaPrefs>(mangaId: string, key: K, v: MangaPrefs[K])      { seriesState.setPref(mangaId, key, v) }
