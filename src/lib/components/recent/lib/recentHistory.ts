import { dayLabel }     from '$lib/core/util'
import type { ReadSession, MediaKind } from '$lib/types/history'

export type { ReadSession }

export interface ChapterHistoryEntry {
  chapterId:   string
  chapterName: string
  endPage:     number
  durationMs:  number
  endedAt:     number
  readCount:   number
}

export interface MangaHistoryEntry {
  mangaId:           string
  mangaTitle:        string
  thumbnailUrl:      string
  contentType:       MediaKind
  latestChapterId:   string
  latestChapterName: string
  chaptersSpanned:   number
  durationMs:        number
  endedAt:           number
  chapters:          ChapterHistoryEntry[]
}

export interface HistoryGroup {
  label: string
  items: MangaHistoryEntry[]
}

export function collapseAndGroupByDay(sessions: ReadSession[]): HistoryGroup[] {
  const mangaMap = new Map<string, ReadSession[]>()
  for (const s of sessions) {
    if (!mangaMap.has(s.mangaId)) mangaMap.set(s.mangaId, [])
    mangaMap.get(s.mangaId)!.push(s)
  }

  const entries: MangaHistoryEntry[] = []
  for (const [mangaId, mSessions] of mangaMap.entries()) {
    const latest = mSessions[0]
    let totalDurationMs = 0
    const uniqueChapters = new Set<string>()
    const chapterMap = new Map<string, ReadSession[]>()

    for (const s of mSessions) {
      totalDurationMs += s.durationMs
      uniqueChapters.add(s.endChapterId)
      if (s.chaptersSpanned > 1) uniqueChapters.add(s.startChapterId)

      if (!chapterMap.has(s.endChapterId)) chapterMap.set(s.endChapterId, [])
      chapterMap.get(s.endChapterId)!.push(s)
    }

    const chapters: ChapterHistoryEntry[] = []
    for (const [chapterId, cSessions] of chapterMap.entries()) {
      const latestCS = cSessions[0]
      let cDur = 0
      let maxPage = 0
      for (const cs of cSessions) {
        cDur += cs.durationMs
        maxPage = Math.max(maxPage, cs.endPage)
      }
      chapters.push({
        chapterId,
        chapterName: latestCS.endChapterName,
        endPage:     maxPage,
        durationMs:  cDur,
        endedAt:     latestCS.endedAt,
        readCount:   cSessions.length,
      })
    }
    chapters.sort((a, b) => b.endedAt - a.endedAt)

    entries.push({
      mangaId,
      mangaTitle:        latest.mangaTitle,
      thumbnailUrl:      latest.thumbnailUrl,
      contentType:       latest.contentType ?? 'MANGA',
      latestChapterId:   latest.endChapterId,
      latestChapterName: latest.endChapterName,
      chaptersSpanned:   uniqueChapters.size,
      durationMs:        totalDurationMs,
      endedAt:           latest.endedAt,
      chapters,
    })
  }

  entries.sort((a, b) => b.endedAt - a.endedAt)

  const groupMap = new Map<string, MangaHistoryEntry[]>()
  for (const entry of entries) {
    const label = dayLabel(entry.endedAt)
    if (!groupMap.has(label)) groupMap.set(label, [])
    groupMap.get(label)!.push(entry)
  }

  return Array.from(groupMap.entries()).map(([label, items]) => ({ label, items }))
}