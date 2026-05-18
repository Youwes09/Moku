export const GET_TRACKERS = `
  query GetTrackers {
    trackers {
      nodes {
        id name icon isLoggedIn isTokenExpired authUrl
        supportsPrivateTracking supportsReadingDates supportsTrackDeletion
        scores
        statuses { value name }
      }
    }
  }
`;

export const GET_MANGA_TRACK_RECORDS = `
  query GetMangaTrackRecords($mangaId: Int!) {
    manga(id: $mangaId) {
      trackRecords {
        nodes {
          id trackerId remoteId title status score displayScore
          lastChapterRead totalChapters remoteUrl startDate finishDate private libraryId
        }
      }
    }
  }
`;

export const SEARCH_TRACKER = `
  query SearchTracker($trackerId: Int!, $query: String!) {
    searchTracker(input: { trackerId: $trackerId, query: $query }) {
      trackSearches {
        id trackerId remoteId title coverUrl summary
        publishingStatus publishingType startDate totalChapters trackingUrl
      }
    }
  }
`;

export const GET_ALL_TRACKER_RECORDS = `
  query GetAllTrackerRecords {
    trackers {
      nodes {
        id name icon isLoggedIn isTokenExpired scores
        statuses { value name }
        trackRecords {
          nodes {
            id trackerId title status displayScore lastChapterRead
            totalChapters remoteUrl private libraryId
            manga { id title thumbnailUrl inLibrary }
          }
        }
      }
    }
  }
`;

export const GET_TRACKER_RECORDS = `
  query GetTrackerRecords($trackerId: Int!) {
    trackers(condition: { id: $trackerId }) {
      nodes {
        id name
        statuses { value name }
        trackRecords {
          nodes {
            id title status displayScore lastChapterRead totalChapters remoteUrl
            manga { id title thumbnailUrl }
          }
        }
      }
    }
  }
`;