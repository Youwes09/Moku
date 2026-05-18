export interface DownloadQueueItem {
  progress: number;
  state: "QUEUED" | "DOWNLOADING" | "FINISHED" | "ERROR";
  tries: number;
  chapter: {
    id: number;
    name: string;
    mangaId: number;
    pageCount: number;
    manga: { id: number; title: string; thumbnailUrl: string } | null;
  };
}

export interface DownloadStatus {
  state: "STARTED" | "STOPPED";
  queue: DownloadQueueItem[];
}

export interface Connection<T> {
  nodes: T[];
}

export interface PageInfo {
  hasNextPage: boolean;
}

export interface PaginatedConnection<T> extends Connection<T> {
  pageInfo: PageInfo;
  totalCount?: number;
}

export interface MetaEntry {
  key: string;
  value: string;
}

export interface UpdaterJobsInfo {
  isRunning: boolean;
  finishedJobs: number;
  totalJobs: number;
  skippedMangasCount: number;
  skippedCategoriesCount: number;
}

export interface UpdateStatus {
  jobsInfo: UpdaterJobsInfo;
}

export interface AboutServer {
  name: string;
  version: string;
  buildType: string;
  buildTime: string;
  github: string;
  discord: string;
}

export interface ServerUpdateEntry {
  channel: string;
  tag: string;
  url: string;
}