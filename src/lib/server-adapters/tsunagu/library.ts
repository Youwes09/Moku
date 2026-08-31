import { gql, baseUrl } from './gql'
import type { ContentType, LibraryEntry, Chapter, MediaMetadata, MetadataCandidate } from '$lib/server-adapters/types'

const METADATA_FIELDS = `mediaId provider providerId url coverUrl malId malUrl confidence locked matchedAt`

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
					metadata { ${METADATA_FIELDS} }
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

	async migrateMedia(fromMediaId: string, toExtensionId: string, toExternalId: string): Promise<LibraryEntry> {
		const data = await gql<{ migrateMedia: LibraryEntry }>(
			`mutation MigrateMedia($fromMediaId: ID!, $toExtensionId: ID!, $toExternalId: String!) {
				migrateMedia(fromMediaId: $fromMediaId, toExtensionId: $toExtensionId, toExternalId: $toExternalId) {
					id extensionId extensionName externalId contentType title thumbnailUrl description status addedAt
					unreadCount downloadCount: downloadedCount
					chapters { id number }
					source { id repositoryId packageName name displayName version contentType lang iconUrl isNsfw supportsLatest apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate }
				}
			}`,
			{ fromMediaId, toExtensionId, toExternalId },
			baseUrl()
		)
		return data.migrateMedia
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

	async searchMetadata(query: string, contentType?: ContentType | null): Promise<MetadataCandidate[]> {
		const data = await gql<{ searchMetadata: MetadataCandidate[] }>(
			`query SearchMetadata($query: String!, $contentType: ContentType!) {
				searchMetadata(query: $query, contentType: $contentType) {
					provider providerId title url coverUrl description status genres startYear
				}
			}`,
			{ query, contentType: contentType ?? 'MANGA' },
			baseUrl()
		)
		return data.searchMetadata
	},

	async applyMetadataMatch(mediaId: string, providerId: string, provider: string): Promise<MediaMetadata | null> {
		const data = await gql<{ applyMetadataMatch: { metadata: MediaMetadata | null } }>(
			`mutation ApplyMetadataMatch($mediaId: ID!, $providerId: String!, $provider: String) {
				applyMetadataMatch(mediaId: $mediaId, providerId: $providerId, provider: $provider) {
					id metadata { ${METADATA_FIELDS} }
				}
			}`,
			{ mediaId, providerId, provider },
			baseUrl()
		)
		return data.applyMetadataMatch.metadata
	},

	async refreshMetadataMatch(mediaId: string): Promise<MediaMetadata | null> {
		const data = await gql<{ refreshMetadataMatch: { metadata: MediaMetadata | null } }>(
			`mutation RefreshMetadataMatch($mediaId: ID!) {
				refreshMetadataMatch(mediaId: $mediaId) {
					id metadata { ${METADATA_FIELDS} }
				}
			}`,
			{ mediaId },
			baseUrl()
		)
		return data.refreshMetadataMatch.metadata
	},

	async unlinkMetadata(mediaId: string): Promise<boolean> {
		const data = await gql<{ unlinkMetadata: boolean }>(
			`mutation UnlinkMetadata($mediaId: ID!) {
				unlinkMetadata(mediaId: $mediaId)
			}`,
			{ mediaId },
			baseUrl()
		)
		return !!data.unlinkMetadata
	},
}
