export interface TrackerStatus {
  value: number;
  name: string;
}

export interface Tracker {
  id: number;
  name: string;
  icon: string;
  isLoggedIn: boolean;
  isTokenExpired: boolean;
  authUrl: string | null;
  supportsPrivateTracking: boolean;
  supportsReadingDates: boolean;
  supportsTrackDeletion: boolean;
  scores: string[];
  statuses: TrackerStatus[];
}

export interface TrackRecord {
  id: number;
  trackerId: number;
  mangaId: number;
  remoteId: string;
  libraryId: string | null;
  title: string;
  status: number;
  score: number;
  displayScore: string;
  lastChapterRead: number;
  totalChapters: number;
  remoteUrl: string;
  startDate: string;
  finishDate: string;
  private: boolean;
  manga?: { id: number; title: string; thumbnailUrl: string; inLibrary?: boolean } | null;
  tracker?: Pick<Tracker, "id" | "name" | "icon" | "isLoggedIn" | "statuses"> | null;
}

export interface TrackSearch {
  id: number;
  trackerId: number;
  remoteId: string;
  title: string;
  coverUrl: string | null;
  summary: string | null;
  publishingStatus: string | null;
  publishingType: string | null;
  startDate: string | null;
  totalChapters: number;
  trackingUrl: string | null;
}