import { gql, baseUrl } from './gql'
import type { ContentType, LibraryEntry, Chapter } from '$lib/server-adapters/types'

export const library = {
	async library(contentType?: ContentType): Promise<LibraryEntry[]> {
		const data = await gql<{ library: { items: LibraryEntry[] } }>(
			`query Library($filter: LibraryFilter) {
				library(filter: $filter, limit: 1000) {
					items {
						id extensionId extensionName externalId contentType title
						thumbnailUrl description status extensionRemovedAt addedAt sourceName
						unreadCount downloadCount: downloadedCount chapterCount
						latestChapter { number uploadedAt }
						genres tags
						folders { id }
						source { id }
					}
				}
			}`,
			{ filter: contentType ? { contentType } : undefined },
			baseUrl()
		)
		return data.library.items
	},

	async rescanLocalMedia(): Promise<Array<{ id: string; title: string; contentType: ContentType; chapterCount: number }>> {
		const data = await gql<{ rescanLocalMedia: Array<{ id: string; title: string; contentType: ContentType; chapterCount: number }> }>(
			`mutation RescanLocalMedia {
				rescanLocalMedia { id title contentType inLibrary chapterCount thumbnailUrl }
			}`,
			undefined,
			baseUrl()
		)
		return data.rescanLocalMedia
	},

	async libraryEntry(id: string): Promise<LibraryEntry | null> {
		const data = await gql<{ media: LibraryEntry | null }>(
			`query Media($id: ID!) {
				media(id: $id) {
					id extensionId extensionName externalId contentType title inLibrary
					thumbnailUrl description status author artist genres tags extensionRemovedAt addedAt sourceName
					unreadCount downloadCount: downloadedCount
					source { id repositoryId packageName name displayName version contentType lang iconUrl isNsfw supportsLatest apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate }
					chapters {
						id mediaId externalId title number scanlator sourceOrder uploadedAt completed downloaded pageCount
					}
					readingProgress {
						id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
					}
					folders { id name kind systemKey parentFolderId sortOrder includeInUpdate includeInDownload }
					trackLinks {
						id mediaId trackerKey remoteId title url
						status statusName lastChapterRead totalChapters score
						startedAt finishedAt private lastSyncedAt
					}
				}
			}`,
			{ id },
			baseUrl()
		)
		return data.media
	},

	async setInLibrary(mediaId: string, inLibrary: boolean): Promise<LibraryEntry> {
		const data = await gql<{ setInLibrary: LibraryEntry }>(
			`mutation SetInLibrary($mediaId: ID!, $inLibrary: Boolean!) {
				setInLibrary(mediaId: $mediaId, inLibrary: $inLibrary) {
					id extensionId extensionName externalId contentType title thumbnailUrl description status addedAt
					unreadCount downloadCount: downloadedCount
					source { id repositoryId packageName name displayName version contentType lang iconUrl isNsfw supportsLatest apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate }
				}
			}`,
			{ mediaId, inLibrary },
			baseUrl()
		)
		return data.setInLibrary
	},

	addToLibrary(mediaId: string): Promise<LibraryEntry> {
		return this.setInLibrary(mediaId, true)
	},

	async syncChapters(libraryEntryId: string): Promise<Chapter[]> {
		const data = await gql<{ syncChapters: Chapter[] }>(
			`mutation SyncChapters($mediaId: ID!) {
				syncChapters(mediaId: $mediaId) {
					id mediaId externalId title number scanlator sourceOrder uploadedAt completed downloaded pageCount
				}
			}`,
			{ mediaId: libraryEntryId },
			baseUrl()
		)
		return data.syncChapters
	},

	async removeFromLibrary(mediaId: string): Promise<boolean> {
		await this.setInLibrary(mediaId, false)
		return true
	},

	async refreshMetadata(libraryEntryId: string, syncChapters: boolean = false): Promise<LibraryEntry> {
		const data = await gql<{ refreshMetadata: LibraryEntry }>(
			`mutation RefreshMetadata($mediaId: ID!, $syncChapters: Boolean) {
				refreshMetadata(mediaId: $mediaId, syncChapters: $syncChapters) {
					id extensionId extensionName externalId contentType title
					thumbnailUrl description status author artist extensionRemovedAt addedAt
					unreadCount downloadCount: downloadedCount
					source { id repositoryId packageName name displayName version contentType lang iconUrl isNsfw supportsLatest apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate }
				}
			}`,
			{ mediaId: libraryEntryId, syncChapters },
			baseUrl()
		)
		return data.refreshMetadata
	},

	async setMediaCover(mediaId: string, url: string | null): Promise<{ id: string; thumbnailUrl: string | null }> {
		const data = await gql<{ setMediaCover: { id: string; thumbnailUrl: string | null } }>(
			`mutation SetMediaCover($mediaId: ID!, $url: String) {
				setMediaCover(mediaId: $mediaId, url: $url) { id thumbnailUrl }
			}`,
			{ mediaId, url },
			baseUrl()
		)
		return data.setMediaCover
	},
}
