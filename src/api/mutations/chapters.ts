export const FETCH_CHAPTERS = `
  mutation FetchChapters($mangaId: Int!) {
    fetchChapters(input: { mangaId: $mangaId }) {
      chapters {
        id name chapterNumber sourceOrder isRead isDownloaded isBookmarked
        pageCount mangaId uploadDate realUrl lastPageRead lastReadAt scanlator
      }
    }
  }
`;

export const FETCH_CHAPTER_PAGES = `
  mutation FetchChapterPages($chapterId: Int!) {
    fetchChapterPages(input: { chapterId: $chapterId }) { pages }
  }
`;

export const MARK_CHAPTER_READ = `
  mutation MarkChapterRead($id: Int!, $isRead: Boolean!) {
    updateChapter(input: { id: $id, patch: { isRead: $isRead } }) {
      chapter { id isRead }
    }
  }
`;

export const MARK_CHAPTERS_READ = `
  mutation MarkChaptersRead($ids: [Int!]!, $isRead: Boolean!) {
    updateChapters(input: { ids: $ids, patch: { isRead: $isRead } }) {
      chapters { id isRead }
    }
  }
`;

export const UPDATE_CHAPTERS_PROGRESS = `
  mutation UpdateChaptersProgress($ids: [Int!]!, $isRead: Boolean, $isBookmarked: Boolean, $lastPageRead: Int) {
    updateChapters(input: { ids: $ids, patch: { isRead: $isRead, isBookmarked: $isBookmarked, lastPageRead: $lastPageRead } }) {
      chapters { id isRead isBookmarked lastPageRead }
    }
  }
`;

export const DELETE_DOWNLOADED_CHAPTERS = `
  mutation DeleteDownloadedChapters($ids: [Int!]!) {
    deleteDownloadedChapters(input: { ids: $ids }) {
      chapters { id isDownloaded }
    }
  }
`;

export const SET_CHAPTER_META = `
  mutation SetChapterMeta($chapterId: Int!, $key: String!, $value: String!) {
    setChapterMeta(input: { meta: { chapterId: $chapterId, key: $key, value: $value } }) {
      meta { key value }
    }
  }
`;

export const DELETE_CHAPTER_META = `
  mutation DeleteChapterMeta($chapterId: Int!, $key: String!) {
    deleteChapterMeta(input: { chapterId: $chapterId, key: $key }) {
      meta { key value }
    }
  }
`;