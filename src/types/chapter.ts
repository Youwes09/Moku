export interface Chapter {
  id: number;
  name: string;
  chapterNumber: number;
  sourceOrder: number;
  isRead: boolean;
  isDownloaded: boolean;
  isBookmarked: boolean;
  pageCount: number;
  mangaId: number;
  fetchedAt?: string;
  uploadDate?: string | null;
  realUrl?: string | null;
  url?: string;
  lastPageRead?: number;
  lastReadAt?: string;
  scanlator?: string | null;
  manga?: { id: number; title: string; thumbnailUrl: string; inLibrary: boolean } | null;
}