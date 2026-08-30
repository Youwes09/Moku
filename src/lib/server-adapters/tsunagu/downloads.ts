import { gql, baseUrl } from './gql'
import type { Download, StorageInfo, DownloaderStatus, DownloadStatus } from '$lib/server-adapters/types'

const DOWNLOAD_FIELDS = `
	id mediaId chapterId status progress downloadedBytes bytesPerSec finalSizeBytes error createdAt completedAt
	chapter {
		id mediaId externalId title number scanlator sourceOrder uploadedAt pageCount
	}
`

export const downloads = {
	async enqueueDownload(mediaId: string, chapterId: string): Promise<Download> {
		const data = await gql<{ enqueueDownload: Download[] }>(
			`mutation EnqueueDownload($mediaId: ID!, $chapterIds: [ID!]!) {
				enqueueDownload(mediaId: $mediaId, chapterIds: $chapterIds) { ${DOWNLOAD_FIELDS} }
			}`,
			{ mediaId, chapterIds: [chapterId] },
			baseUrl()
		)
		return data.enqueueDownload[0]
	},

	async enqueueDownloads(mediaId: string, chapterIds: string[]): Promise<Download[]> {
		const data = await gql<{ enqueueDownload: Download[] }>(
			`mutation EnqueueDownload($mediaId: ID!, $chapterIds: [ID!]!) {
				enqueueDownload(mediaId: $mediaId, chapterIds: $chapterIds) { ${DOWNLOAD_FIELDS} }
			}`,
			{ mediaId, chapterIds },
			baseUrl()
		)
		return data.enqueueDownload
	},

	async dequeueDownload(mediaId: string, chapterId: string): Promise<boolean> {
		const data = await gql<{ dequeueDownload: boolean }>(
			`mutation DequeueDownload($mediaId: ID!, $chapterId: ID!) { dequeueDownload(mediaId: $mediaId, chapterId: $chapterId) }`,
			{ mediaId, chapterId },
			baseUrl()
		)
		return data.dequeueDownload
	},

	async retryDownload(mediaId: string, chapterId: string): Promise<Download> {
		const data = await gql<{ retryDownload: Download }>(
			`mutation RetryDownload($mediaId: ID!, $chapterId: ID!) {
				retryDownload(mediaId: $mediaId, chapterId: $chapterId) { ${DOWNLOAD_FIELDS} }
			}`,
			{ mediaId, chapterId },
			baseUrl()
		)
		return data.retryDownload
	},

	async deleteDownload(mediaId: string, chapterId: string): Promise<boolean> {
		const data = await gql<{ deleteDownload: boolean }>(
			`mutation DeleteDownload($mediaId: ID!, $chapterIds: [ID!]!) { deleteDownload(mediaId: $mediaId, chapterIds: $chapterIds) }`,
			{ mediaId, chapterIds: [chapterId] },
			baseUrl()
		)
		return data.deleteDownload
	},

	async deleteDownloads(mediaId: string, chapterIds: string[]): Promise<boolean> {
		const data = await gql<{ deleteDownload: boolean }>(
			`mutation DeleteDownload($mediaId: ID!, $chapterIds: [ID!]!) { deleteDownload(mediaId: $mediaId, chapterIds: $chapterIds) }`,
			{ mediaId, chapterIds },
			baseUrl()
		)
		return data.deleteDownload
	},

	async reorderDownload(mediaId: string, chapterId: string, position: number): Promise<boolean> {
		const data = await gql<{ reorderDownload: boolean }>(
			`mutation ReorderDownload($mediaId: ID!, $chapterId: ID!, $position: Int!) { reorderDownload(mediaId: $mediaId, chapterId: $chapterId, position: $position) }`,
			{ mediaId, chapterId, position },
			baseUrl()
		)
		return data.reorderDownload
	},

	async clearDownloads(status?: DownloadStatus[]): Promise<boolean> {
		const data = await gql<{ clearDownloads: boolean }>(
			`mutation ClearDownloads($status: [DownloadStatus!]) { clearDownloads(status: $status) }`,
			{ status },
			baseUrl()
		)
		return data.clearDownloads
	},

	async startDownloader(): Promise<boolean> {
		const data = await gql<{ startDownloader: boolean }>(
			`mutation StartDownloader { startDownloader }`,
			undefined,
			baseUrl()
		)
		return data.startDownloader
	},

	async stopDownloader(): Promise<boolean> {
		const data = await gql<{ stopDownloader: boolean }>(
			`mutation StopDownloader { stopDownloader }`,
			undefined,
			baseUrl()
		)
		return data.stopDownloader
	},

	async downloadQueue(): Promise<Download[]> {
		const data = await gql<{ downloadQueue: Download[] }>(
			`query DownloadQueue { downloadQueue { ${DOWNLOAD_FIELDS} } }`,
			undefined,
			baseUrl()
		)
		return data.downloadQueue
	},

	async clearImageCache(): Promise<boolean> {
		const data = await gql<{ clearImageCache: boolean }>(
			`mutation ClearImageCache { clearImageCache }`,
			undefined,
			baseUrl()
		)
		return data.clearImageCache
	},

	async storageInfo(): Promise<StorageInfo> {
		const data = await gql<{ storageInfo: StorageInfo }>(
			`query StorageInfo { storageInfo { usedBytes totalBytes freeBytes } }`,
			undefined,
			baseUrl()
		)
		return data.storageInfo
	},

	async downloadStatus(mediaId: string, chapterId: string): Promise<Download | null> {
		const data = await gql<{ downloadStatus: Download | null }>(
			`query DownloadStatus($mediaId: ID!, $chapterId: ID!) {
				downloadStatus(mediaId: $mediaId, chapterId: $chapterId) { ${DOWNLOAD_FIELDS} }
			}`,
			{ mediaId, chapterId },
			baseUrl()
		)
		return data.downloadStatus
	},

	async downloaderStatus(): Promise<DownloaderStatus> {
		const data = await gql<{ downloaderStatus: DownloaderStatus }>(
			`query DownloaderStatus { downloaderStatus { isRunning queuedCount downloadingCount failedCount } }`,
			undefined,
			baseUrl()
		)
		return data.downloaderStatus
	},
}
