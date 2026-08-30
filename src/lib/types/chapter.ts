export interface Chapter {
  id:            string
  name:          string
  chapterNumber: number
  sourceOrder:   number
  read:          boolean
  downloaded:    boolean
  bookmarked:    boolean
  pageCount:     number
  pages?:        string[]
  mangaId:       string
  fetchedAt?:    string
  uploadDate?:   string | null
  realUrl?:      string | null
  lastPageRead?: number
  lastReadAt?:   string
  scanlator?:    string | null
  manga?: {
    id:           string
    title:        string
    thumbnailUrl: string
    inLibrary:    boolean
  } | null
}