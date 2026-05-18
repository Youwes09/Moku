export interface Category {
  id: number;
  name: string;
  order: number;
  default: boolean;
  includeInUpdate: string;
  includeInDownload: string;
  mangas?: { nodes: Manga[] };
}

export interface ChapterRef {
  id: number;
  chapterNumber: number;
  uploadDate?: string;
  lastPageRead?: number;
}

export interface Manga {
  id: number;
  title: string;
  thumbnailUrl: string;
  inLibrary: boolean;
  initialized?: boolean;
  downloadCount?: number;
  unreadCount?: number;
  bookmarkCount?: number;
  hasDuplicateChapters?: boolean;
  chapters?: { totalCount: number };
  description?: string | null;
  status?: string | null;
  author?: string | null;
  artist?: string | null;
  genre?: string[];
  realUrl?: string | null;
  url?: string;
  sourceId?: string;
  inLibraryAt?: string | null;
  lastFetchedAt?: string | null;
  chaptersLastFetchedAt?: string | null;
  thumbnailUrlLastFetched?: string | null;
  age?: string | null;
  chaptersAge?: string | null;
  updateStrategy?: "ALWAYS_UPDATE" | "ONLY_FETCH_ONCE";
  latestFetchedChapter?: ChapterRef | null;
  latestUploadedChapter?: ChapterRef | null;
  latestReadChapter?: ChapterRef | null;
  lastReadChapter?: ChapterRef | null;
  firstUnreadChapter?: ChapterRef | null;
  highestNumberedChapter?: ChapterRef | null;
  source?: { id: string; name: string; displayName: string } | null;
}

export interface MangaDetail extends Manga {
  description: string | null;
  author: string | null;
  artist: string | null;
  status: string | null;
  genre: string[];
}