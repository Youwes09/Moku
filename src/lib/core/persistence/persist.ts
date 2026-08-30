import { platformService } from '$lib/platform-service'
import type { ReadSession }                   from '$lib/types/history'
import type { BookmarkEntry }                 from '$lib/types/history'

const STORE_VERSION = 2

export interface PersistedSettings {
  storeVersion: number
  settings:     unknown
}

export interface PersistedLibrary {
  sessions:        ReadSession[]
  bookmarks:       BookmarkEntry[]
  dailyReadCounts: Record<string, number>
}

export interface PersistedUpdates {
  libraryUpdates:        unknown[]
  lastLibraryRefresh:    number
  acknowledgedUpdateIds: number[]
}

function migrateLibrary(raw: unknown, fromVersion: number): PersistedLibrary {
  const data = (raw ?? {}) as Record<string, unknown>

  if (fromVersion < 2) {
    const oldHistory = (data.history ?? []) as Array<{
      mangaId: number; mangaTitle: string; thumbnailUrl: string
      chapterId: number; chapterName: string; chapterNumber?: number
      pageNumber?: number; readAt: number
    }>

    return {
      sessions: oldHistory.map(e => ({
        id:               crypto.randomUUID(),
        mangaId:          String(e.mangaId),
        mangaTitle:       e.mangaTitle,
        thumbnailUrl:     e.thumbnailUrl,
        startChapterId:   String(e.chapterId),
        startChapterName: e.chapterName,
        endChapterId:     String(e.chapterId),
        endChapterName:   e.chapterName,
        startPage:        1,
        endPage:          e.pageNumber ?? 1,
        startedAt:        e.readAt,
        endedAt:          e.readAt,
        durationMs:       0,
        chaptersSpanned:  1,
      })),
      bookmarks:       (data.bookmarks       ?? []) as BookmarkEntry[],
      dailyReadCounts: (data.dailyReadCounts ?? {}) as Record<string, number>,
    }
  }

  return {
    sessions:        (data.sessions        ?? []) as ReadSession[],
    bookmarks:       (data.bookmarks       ?? []) as BookmarkEntry[],
    dailyReadCounts: (data.dailyReadCounts ?? {}) as Record<string, number>,
  }
}

function evacuateLocalStorage(key: string): unknown | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    localStorage.removeItem(key)
    return parsed
  } catch {
    return null
  }
}

export async function loadSettings(): Promise<PersistedSettings> {
  const raw  = await platformService.loadStore('settings')
  const data = (raw ?? {}) as Record<string, unknown>

  if (!data.settings) {
    const legacy = evacuateLocalStorage('moku_settings')
    if (legacy) {
      const result: PersistedSettings = { storeVersion: STORE_VERSION, settings: legacy }
      await saveSettings(result)
      return result
    }
  }

  return {
    storeVersion: (data.storeVersion as number) ?? STORE_VERSION,
    settings:     data.settings ?? null,
  }
}

export async function saveSettings(data: PersistedSettings): Promise<void> {
  await platformService.saveStore('settings', data)
}

export async function loadLibrary(): Promise<PersistedLibrary> {
  const raw     = await platformService.loadStore('library')
  const data    = (raw ?? {}) as Record<string, unknown>
  const version = (data.storeVersion as number) ?? 1

  if (!data.sessions && !data.history) {
    const legacy = evacuateLocalStorage('moku-store')
    if (legacy) {
      const migrated = migrateLibrary(legacy, 1)
      await saveLibrary(migrated)
      return migrated
    }
  }

  return migrateLibrary(raw, version)
}

export async function saveLibrary(data: PersistedLibrary): Promise<void> {
  await platformService.saveStore('library', { ...data, storeVersion: STORE_VERSION })
}

export async function loadUpdates(): Promise<PersistedUpdates> {
  const raw  = await platformService.loadStore('updates')
  const data = (raw ?? {}) as Record<string, unknown>
  return {
    libraryUpdates:        (data.libraryUpdates        ?? []) as unknown[],
    lastLibraryRefresh:    (data.lastLibraryRefresh     ?? 0)  as number,
    acknowledgedUpdateIds: (data.acknowledgedUpdateIds  ?? []) as number[],
  }
}

export async function saveUpdates(data: PersistedUpdates): Promise<void> {
  await platformService.saveStore('updates', data)
}

export async function loadBackups(): Promise<{ url: string; name: string }[]> {
  const raw  = await platformService.loadStore('backups')
  const data = (raw ?? {}) as Record<string, unknown>

  if (!data.backupList) {
    const legacy = evacuateLocalStorage('moku_backups')
    if (legacy) {
      const list = legacy as { url: string; name: string }[]
      await saveBackups(list)
      return list
    }
    return []
  }

  return data.backupList as { url: string; name: string }[]
}

export async function saveBackups(list: { url: string; name: string }[]): Promise<void> {
  await platformService.saveStore('backups', { backupList: list })
}
