export const GET_DOWNLOAD_STATUS = `
  query GetDownloadStatus {
    downloadStatus {
      state
      queue {
        progress state tries
        chapter {
          id name pageCount mangaId
          manga { id title thumbnailUrl }
        }
      }
    }
  }
`;