import { gql, baseUrl } from './gql'
import type { SearchResponse, SourceDetails, PreviewChapter, RecentChapter, FilterNode, FilterInput, SourcePreference, MangaInfo, LibraryUpdateStatus } from '$lib/server-adapters/types'

const FILTER_NODE_FRAGMENT = `
	fragment FilterNodeFields on FilterNode {
		__typename
		... on HeaderFilter    { name }
		... on SeparatorFilter { name }
		... on SelectFilter    { name values state }
		... on TextFilter      { name state }
		... on CheckBoxFilter  { name state }
		... on TriStateFilter  { name state }
		... on SortFilter      { name values hasState index ascending }
		... on GroupFilter {
			name
			children { ...FilterNodeFields }
		}
	}
`

export const discovery = {
	async mangaInfo(extensionId: string, sourceEntryId: string, includeChapters: boolean): Promise<MangaInfo> {
		const data = await gql<{ resolveMedia: MangaInfo }>(
			includeChapters
				? `query ResolveMedia($extensionId: ID!, $externalId: String!) {
					resolveMedia(extensionId: $extensionId, externalId: $externalId, syncChapters: true) {
						id extensionId externalId contentType title description thumbnailUrl
						status author artist genres tags inLibrary sourceName
						source { id displayName iconUrl }
						chapterCount unreadCount downloadCount: downloadedCount
						chapters { id mediaId externalId title number scanlator sourceOrder uploadedAt completed downloaded pageCount }
					}
				}`
				: `query ResolveMedia($extensionId: ID!, $externalId: String!) {
					resolveMedia(extensionId: $extensionId, externalId: $externalId, syncChapters: false) {
						id extensionId externalId contentType title description thumbnailUrl
						status author artist genres tags inLibrary sourceName
						source { id displayName iconUrl }
						chapterCount unreadCount downloadCount: downloadedCount
					}
				}`,
			{ extensionId, externalId: sourceEntryId },
			baseUrl()
		)
		return data.resolveMedia
	},

	async search(extensionId: string, query: string, page?: number, filters?: FilterInput[], signal?: AbortSignal): Promise<SearchResponse> {
		const data = await gql<{ search: SearchResponse }>(
			`query Search($extensionId: ID!, $query: String!, $page: Int, $filters: [FilterInput!]) {
				search(extensionId: $extensionId, query: $query, page: $page, filters: $filters) {
					results { id externalId title thumbnailUrl inLibrary status genres metadata { coverUrl } }
					hasNextPage
				}
			}`,
			{ extensionId, query, page, filters },
			baseUrl(),
			signal
		)
		return data.search
	},

	async popularManga(extensionId: string, page?: number, signal?: AbortSignal): Promise<SearchResponse> {
		const data = await gql<{ popularManga: SearchResponse }>(
			`query PopularManga($extensionId: ID!, $page: Int) {
				popularManga(extensionId: $extensionId, page: $page) {
					results { id externalId title thumbnailUrl inLibrary status genres metadata { coverUrl } }
					hasNextPage
				}
			}`,
			{ extensionId, page },
			baseUrl(),
			signal
		)
		return data.popularManga
	},

	async localSourceSearch(query?: string, page?: number, signal?: AbortSignal): Promise<SearchResponse> {
		const data = await gql<{ localSourceSearch: SearchResponse }>(
			`query LocalSourceSearch($query: String, $page: Int) {
				localSourceSearch(query: $query, page: $page) {
					results { id externalId title thumbnailUrl inLibrary status genres metadata { coverUrl } }
					hasNextPage
				}
			}`,
			{ query, page },
			baseUrl(),
			signal
		)
		return data.localSourceSearch
	},

	async latestUpdates(extensionId: string, page?: number, signal?: AbortSignal): Promise<SearchResponse> {
		const data = await gql<{ latestUpdates: SearchResponse }>(
			`query LatestUpdates($extensionId: ID!, $page: Int) {
				latestUpdates(extensionId: $extensionId, page: $page) {
					results { id externalId title thumbnailUrl inLibrary status genres metadata { coverUrl } }
					hasNextPage
				}
			}`,
			{ extensionId, page },
			baseUrl(),
			signal
		)
		return data.latestUpdates
	},

	async sourcePreferences(extensionId: string): Promise<SourcePreference[]> {
		const data = await gql<{ sourcePreferences: SourcePreference[] }>(
			`query SourcePreferences($extensionId: ID!) {
				sourcePreferences(extensionId: $extensionId) {
					key title summary type entries entryValues currentValue defaultValue
				}
			}`,
			{ extensionId },
			baseUrl()
		)
		return data.sourcePreferences ?? []
	},

	async setSourcePreference(extensionId: string, key: string, value: string): Promise<SourcePreference[]> {
		const data = await gql<{ setSourcePreference: SourcePreference[] }>(
			`mutation SetSourcePreference($extensionId: ID!, $key: String!, $value: String!) {
				setSourcePreference(extensionId: $extensionId, key: $key, value: $value) {
					key title summary type entries entryValues currentValue defaultValue
				}
			}`,
			{ extensionId, key, value },
			baseUrl()
		)
		return data.setSourcePreference ?? []
	},

	async filterOptions(extensionId: string): Promise<FilterNode[]> {
		const data = await gql<{ filterOptions: FilterNode[] }>(
			`${FILTER_NODE_FRAGMENT}
			query FilterOptions($extensionId: ID!) {
				filterOptions(extensionId: $extensionId) {
					...FilterNodeFields
				}
			}`,
			{ extensionId },
			baseUrl()
		)
		return data.filterOptions
	},

	async sourceDetails(extensionId: string, sourceEntryId: string): Promise<SourceDetails> {
		const m = await this.mangaInfo(extensionId, sourceEntryId, false)
		return {
			sourceEntryId: m.externalId,
			title:         m.title,
			description:   m.description,
			coverUrl:      m.thumbnailUrl,
			status:        m.status,
			authors:       m.author ? m.author.split(',').map(s => s.trim()).filter(Boolean) : [],
			artists:       m.artist ? m.artist.split(',').map(s => s.trim()).filter(Boolean) : [],
			genres:        m.genres,
			mediaId:       m.id,
		}
	},

	async previewChapters(extensionId: string, sourceEntryId: string): Promise<PreviewChapter[]> {
		const m = await this.mangaInfo(extensionId, sourceEntryId, true)
		return (m.chapters ?? []).map(c => ({
			externalId:  c.externalId,
			title:       c.title,
			number:      c.number,
			sourceOrder: c.sourceOrder,
			uploadedAt:  c.uploadedAt,
		}))
	},

	async recentChapters(since?: string, limit?: number): Promise<RecentChapter[]> {
		const data = await gql<{ recentChapters: Array<{ chapter: RecentChapter['chapter']; media: { id: string; title: string; thumbnailUrl: string | null; contentType: RecentChapter['contentType'] } }> }>(
			`query RecentChapters($since: Time, $limit: Int) {
				recentChapters(since: $since, limit: $limit) {
					chapter {
						id mediaId externalId title number scanlator sourceOrder uploadedAt completed downloaded
						readingProgress { progress completed }
					}
					media { id title thumbnailUrl contentType }
				}
			}`,
			{ since, limit },
			baseUrl()
		)
		return data.recentChapters.map(rc => ({
			chapter:               rc.chapter,
			mediaId:               rc.media.id,
			libraryEntryTitle:     rc.media.title,
			libraryEntryCoverPath: rc.media.thumbnailUrl,
			contentType:           rc.media.contentType,
		}))
	},

	async chapterUpdates(since?: string, limit?: number): Promise<RecentChapter[]> {
		const data = await gql<{ chapterUpdates: Array<{ chapter: RecentChapter['chapter']; media: { id: string; title: string; thumbnailUrl: string | null; contentType: RecentChapter['contentType'] } }> }>(
			`query ChapterUpdates($since: Time, $limit: Int) {
				chapterUpdates(since: $since, limit: $limit) {
					chapter {
						id mediaId externalId title number scanlator sourceOrder uploadedAt completed downloaded
						readingProgress { progress completed }
					}
					media { id title thumbnailUrl contentType }
				}
			}`,
			{ since, limit },
			baseUrl()
		)
		return data.chapterUpdates.map(rc => ({
			chapter:               rc.chapter,
			mediaId:               rc.media.id,
			libraryEntryTitle:     rc.media.title,
			libraryEntryCoverPath: rc.media.thumbnailUrl,
			contentType:           rc.media.contentType,
		}))
	},

	async startLibraryUpdate(folderId?: string): Promise<boolean> {
		const data = await gql<{ startLibraryUpdate: boolean }>(
			`mutation StartLibraryUpdate($folderId: ID) { startLibraryUpdate(folderId: $folderId) }`,
			{ folderId },
			baseUrl()
		)
		return data.startLibraryUpdate
	},

	async libraryUpdateStatus(): Promise<LibraryUpdateStatus> {
		const data = await gql<{ libraryUpdateStatus: LibraryUpdateStatus }>(
			`query LibraryUpdateStatus {
				libraryUpdateStatus {
					running total done currentTitle newChapterCount failedTitles startedAt finishedAt
				}
			}`,
			undefined,
			baseUrl()
		)
		return data.libraryUpdateStatus
	},
}
