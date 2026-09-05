export interface BookmarkEntry {
  mangaId:      string
  mangaTitle:   string
  thumbnailUrl: string
  chapterId:    string
  chapterName:  string
  pageNumber:   number
  savedAt:      number
}

export type MediaKind = 'MANGA' | 'NOVEL' | 'ANIME'

export interface ReadSession {
  id:               string
  mangaId:          string
  mangaTitle:       string
  thumbnailUrl:     string
  startChapterId:   string
  startChapterName: string
  endChapterId:     string
  endChapterName:   string
  startPage:        number
  endPage:          number
  startedAt:        number
  endedAt:          number
  durationMs:       number
  chaptersSpanned:  number
  contentType?:     MediaKind
}

export interface ReadingStats {
  totalChaptersRead:  number
  totalMangaRead:     number
  totalMinutesRead:   number
  firstReadAt:        number
  lastReadAt:         number
  currentStreakDays:  number
  longestStreakDays:  number
  lastStreakDate:     string
}

export const DEFAULT_READING_STATS: ReadingStats = {
  totalChaptersRead:  0,
  totalMangaRead:     0,
  totalMinutesRead:   0,
  firstReadAt:        0,
  lastReadAt:         0,
  currentStreakDays:  0,
  longestStreakDays:  0,
  lastStreakDate:     '',
}

export interface LibraryUpdateEntry {
  mangaId:      string
  mangaTitle:   string
  thumbnailUrl: string
  newChapters:  number
  checkedAt:    number
}
