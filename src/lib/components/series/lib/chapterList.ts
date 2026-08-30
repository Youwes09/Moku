import type { Chapter } from '$lib/types'

export type ChapterSortMode = 'source' | 'chapterNumber' | 'uploadDate'
export type ChapterSortDir  = 'asc' | 'desc'

export interface ChapterDisplayPrefs {
  sortMode?:           ChapterSortMode
  sortDir?:            ChapterSortDir
  preferredScanlator?: string
  scanlatorFilter?:    string[]
  scanlatorBlacklist?: string[]
  scanlatorForce?:     boolean
}

function uploadMs(v: string | null | undefined): number {
  if (!v) return 0
  if (/^\d+$/.test(v)) { const n = Number(v); return n > 1e10 ? n : n * 1000 }
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

function sortByMode(a: Chapter, b: Chapter, mode: ChapterSortMode): number {
  const bySource = a.sourceOrder - b.sourceOrder
  const byNumber = a.chapterNumber - b.chapterNumber
  const byDate   = uploadMs(a.uploadDate) - uploadMs(b.uploadDate)
  if (mode === 'chapterNumber') return byNumber || bySource || byDate
  if (mode === 'uploadDate')    return byDate   || byNumber || bySource
  return bySource || byNumber || byDate
}

export function buildChapterList(chapters: Chapter[], prefs: ChapterDisplayPrefs = {}): Chapter[] {
  const {
    sortMode           = 'source',
    sortDir            = 'asc',
    preferredScanlator = '',
    scanlatorFilter    = [],
    scanlatorBlacklist = [],
    scanlatorForce     = false,
  } = prefs

  let base = [...chapters]

  if (scanlatorBlacklist.length > 0) {
    base = base.filter(c => !scanlatorBlacklist.includes(c.scanlator ?? ''))
  }

  base.sort((a, b) => sortByMode(a, b, sortMode))

  if (preferredScanlator) {
    const pref: Chapter[] = [], rest: Chapter[] = []
    for (const c of base) (c.scanlator === preferredScanlator ? pref : rest).push(c)
    base = [...pref, ...rest]
  }

  if (scanlatorFilter.length > 0) {
    const seen = new Map<number, Chapter>()
    const unnumbered: Chapter[] = []
    for (const ch of base) {
      if (ch.chapterNumber < 0) {
        if (!scanlatorForce || scanlatorFilter.includes(ch.scanlator ?? '')) unnumbered.push(ch)
        continue
      }
      const existing = seen.get(ch.chapterNumber)
      if (!existing) {
        if (!scanlatorForce || scanlatorFilter.includes(ch.scanlator ?? '')) {
          seen.set(ch.chapterNumber, ch)
        }
      } else {
        const np = scanlatorFilter.indexOf(ch.scanlator ?? '')
        const op = scanlatorFilter.indexOf(existing.scanlator ?? '')
        if (np !== -1 && (op === -1 || np < op)) seen.set(ch.chapterNumber, ch)
      }
    }
    base = [...seen.values(), ...unnumbered].sort((a, b) => sortByMode(a, b, sortMode))
  }

  return sortDir === 'desc' ? base.reverse() : base
}

export function chaptersAscending(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.sourceOrder - b.sourceOrder)
}
