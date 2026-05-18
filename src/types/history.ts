export interface HistoryEntry {
  mangaId: number; mangaTitle: string; thumbnailUrl: string;
  chapterId: number; chapterName: string; readAt: number;
}

export interface BookmarkEntry {
  mangaId: number; mangaTitle: string; thumbnailUrl: string;
  chapterId: number; chapterName: string; pageNumber: number;
  savedAt: number; label?: string;
}

export type MarkerColor = "yellow" | "red" | "blue" | "green" | "purple";

export interface MarkerEntry {
  id: string; mangaId: number; mangaTitle: string; thumbnailUrl: string;
  chapterId: number; chapterName: string; pageNumber: number;
  note: string; color: MarkerColor; createdAt: number; updatedAt?: number;
}

export interface ReadLogEntry { mangaId: number; chapterId: number; readAt: number; minutes: number; }

export interface ReadingStats {
  totalChaptersRead: number; totalMangaRead: number; totalMinutesRead: number;
  firstReadAt: number; lastReadAt: number;
  currentStreakDays: number; longestStreakDays: number; lastStreakDate: string;
}

export const DEFAULT_READING_STATS: ReadingStats = {
  totalChaptersRead: 0, totalMangaRead: 0, totalMinutesRead: 0,
  firstReadAt: 0, lastReadAt: 0, currentStreakDays: 0, longestStreakDays: 0, lastStreakDate: "",
};

export interface LibraryUpdateEntry {
  mangaId: number; mangaTitle: string; thumbnailUrl: string; newChapters: number; checkedAt: number;
}