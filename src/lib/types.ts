export interface Manga {
  id: number;
  title: string;
  thumbnailUrl: string;
  inLibrary: boolean;
  downloadCount?: number;
  unreadCount?: number;
  description?: string | null;
  status?: string | null;
  author?: string | null;
  artist?: string | null;
  genre?: string[];
  realUrl?: string | null;
  source?: {
    id: string;
    name: string;
    displayName: string;
  } | null;
}

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
  uploadDate?: string | null;
  realUrl?: string | null;
  lastPageRead?: number;
  scanlator?: string | null;
}

export interface MangaDetail extends Manga {
  description: string | null;
  author: string | null;
  artist: string | null;
  status: string | null;
  genre: string[];
}

export interface Source {
  id: string;
  name: string;
  lang: string;
  displayName: string;
  iconUrl: string;
  isNsfw: boolean;
}

export interface Extension {
  apkName: string;
  pkgName: string;
  name: string;
  lang: string;
  versionName: string;
  isInstalled: boolean;
  isObsolete: boolean;
  hasUpdate: boolean;
  iconUrl: string;
}

export interface DownloadQueueItem {
  progress: number;
  state: "QUEUED" | "DOWNLOADING" | "FINISHED" | "ERROR";
  chapter: {
    id: number;
    name: string;
    mangaId: number;
    pageCount: number;
    manga: {
      id: number;
      title: string;
      thumbnailUrl: string;
    } | null;
  };
}

export interface DownloadStatus {
  state: "STARTED" | "STOPPED";
  queue: DownloadQueueItem[];
}

export interface Connection<T> {
  nodes: T[];
}