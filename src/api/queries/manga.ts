export const GET_LIBRARY = `
  query GetLibrary {
    mangas(condition: { inLibrary: true }) {
      nodes {
        id title thumbnailUrl inLibrary downloadCount unreadCount bookmarkCount
        description status author artist genre
        inLibraryAt lastFetchedAt chaptersLastFetchedAt thumbnailUrlLastFetched
        source { id name displayName }
        chapters { totalCount }
        latestFetchedChapter { id uploadDate }
        latestUploadedChapter { id uploadDate }
        lastReadChapter { id chapterNumber }
        firstUnreadChapter { id chapterNumber }
      }
    }
  }
`;

export const GET_ALL_MANGA = `
  query GetAllManga {
    mangas {
      nodes { id title thumbnailUrl inLibrary downloadCount }
    }
  }
`;

export const GET_MANGA = `
  query GetManga($id: Int!) {
    manga(id: $id) {
      id title description thumbnailUrl status author artist genre inLibrary realUrl
      inLibraryAt lastFetchedAt thumbnailUrlLastFetched updateStrategy
      source { id name displayName }
      lastReadChapter { id chapterNumber lastPageRead }
      firstUnreadChapter { id chapterNumber }
      highestNumberedChapter { id chapterNumber }
    }
  }
`;

export const GET_CATEGORIES = `
  query GetCategories {
    categories {
      nodes {
        id name order default includeInUpdate includeInDownload
        mangas {
          nodes { id title thumbnailUrl inLibrary downloadCount unreadCount }
        }
      }
    }
  }
`;

export const GET_DOWNLOADED_CHAPTERS_PAGES = `
  query GetDownloadedChaptersPages {
    chapters(condition: { isDownloaded: true }) {
      nodes { pageCount }
    }
  }
`;

export const GET_DOWNLOADS_PATH = `
  query GetDownloadsPath {
    settings { downloadsPath localSourcePath }
  }
`;

export const LIBRARY_UPDATE_STATUS = `
  query LibraryUpdateStatus {
    libraryUpdateStatus {
      jobsInfo {
        isRunning finishedJobs totalJobs skippedMangasCount skippedCategoriesCount
      }
      mangaUpdates {
        status
        manga { id title thumbnailUrl unreadCount }
      }
    }
  }
`;

export const GET_RESTORE_STATUS = `
  query GetRestoreStatus($id: String!) {
    restoreStatus(id: $id) { mangaProgress state totalManga }
  }
`;

export const VALIDATE_BACKUP = `
  query ValidateBackup($backup: Upload!) {
    validateBackup(input: { backup: $backup }) {
      missingSources { id name }
      missingTrackers { name }
    }
  }
`;

export const MANGAS_BY_GENRE = `
  query MangasByGenre($filter: MangaFilterInput, $first: Int, $offset: Int) {
    mangas(filter: $filter, first: $first, offset: $offset, orderBy: IN_LIBRARY_AT, orderByType: DESC) {
      nodes {
        id title thumbnailUrl inLibrary genre status
        source { id displayName }
      }
      pageInfo { hasNextPage }
      totalCount
    }
  }
`;