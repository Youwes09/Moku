export const GET_RECENTLY_UPDATED = `
  query GetRecentlyUpdated {
    chapters(orderBy: FETCHED_AT, orderByType: DESC, first: 300) {
      nodes {
        mangaId
        fetchedAt
        manga { id title thumbnailUrl inLibrary }
      }
    }
  }
`;

export const GET_CHAPTERS = `
  query GetChapters($mangaId: Int!) {
    chapters(condition: { mangaId: $mangaId }) {
      nodes {
        id name chapterNumber sourceOrder isRead isDownloaded isBookmarked
        pageCount mangaId uploadDate realUrl lastPageRead lastReadAt scanlator
      }
    }
  }
`;