export interface ChapterRef {
  id: string
  chapterNumber: number
  uploadDate?: string
  lastPageRead?: number
}

export interface Category {
  id:                string
  name:              string
  order:             number
  default:           boolean
  includeInUpdate:   boolean
  includeInDownload: boolean
  mangas?:           Manga[]
}

export interface Manga {
  id:           string
  title:        string
  thumbnailUrl: string
  inLibrary:    boolean

  downloadCount?: number
  unreadCount?:   number
  bookmarkCount?: number

  contentType?: 'NOVEL' | 'MANGA' | 'ANIME'
  description?: string | null
  status?:      string | null
  author?:      string | null
  artist?:      string | null
  genre?:       string[]
  tags?:        string[]
  realUrl?:     string | null
  sourceId?:    string
  sourceEntryId?:  string
  extensionId?:    string
  libraryEntryId?: string | null
  prefsKey?:       string
  mediaId?: string

  inLibraryAt?:             string | null
  lastFetchedAt?:           string | null
  chaptersLastFetchedAt?:   string | null
  thumbnailUrlLastFetched?: string | null
  addedAt?:                 number
  lastReadAt?:              number

  updateStrategy?: 'ALWAYS_UPDATE' | 'ONLY_FETCH_ONCE'

  latestFetchedChapter?:  ChapterRef | null
  latestUploadedChapter?: ChapterRef | null
  lastReadChapter?:       ChapterRef | null
  firstUnreadChapter?:    ChapterRef | null
  highestNumberedChapter?: ChapterRef | null

  source?: { id: string; name: string; displayName: string; isNsfw?: boolean; iconUrl?: string | null } | null
  sourceName?: string | null
  chapters?: { totalCount: number }
  metadata?: Partial<import('$lib/server-adapters/types').MediaMetadata> | null
}

