import { gql, baseUrl } from './gql'
import type { ReadingProgress } from '$lib/server-adapters/types'

export const progress = {
	async readingProgress(libraryEntryId: string): Promise<ReadingProgress[]> {
		const data = await gql<{ readingProgress: ReadingProgress[] }>(
			`query ReadingProgress($mediaId: ID!) {
				readingProgress(mediaId: $mediaId) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			{ mediaId: libraryEntryId },
			baseUrl()
		)
		return data.readingProgress
	},

	async updateReadingProgress(input: {
		libraryEntryId: string
		chapterId: string
		progress: number
		completed?: boolean
		positionSeconds?: number
		durationSeconds?: number
	}): Promise<ReadingProgress> {
		const { libraryEntryId, ...rest } = input
		const data = await gql<{ updateReadingProgress: ReadingProgress }>(
			`mutation UpdateReadingProgress($mediaId: ID!, $chapterId: ID!, $progress: Float!, $completed: Boolean, $positionSeconds: Float, $durationSeconds: Float) {
				updateReadingProgress(mediaId: $mediaId, chapterId: $chapterId, progress: $progress, completed: $completed, positionSeconds: $positionSeconds, durationSeconds: $durationSeconds) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			{ mediaId: libraryEntryId, ...rest },
			baseUrl()
		)
		return data.updateReadingProgress
	},

	async markChapterRead(libraryEntryId: string, chapterId: string): Promise<ReadingProgress> {
		const data = await gql<{ markChapterRead: ReadingProgress }>(
			`mutation MarkChapterRead($mediaId: ID!, $chapterId: ID!) {
				markChapterRead(mediaId: $mediaId, chapterId: $chapterId) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			{ mediaId: libraryEntryId, chapterId },
			baseUrl()
		)
		return data.markChapterRead
	},

	async markChaptersRead(
		libraryEntryId: string,
		chapterIds: string[],
		read: boolean
	): Promise<ReadingProgress[]> {
		const data = await gql<{ markChaptersRead: ReadingProgress[] }>(
			`mutation MarkChaptersRead($mediaId: ID!, $chapterIds: [ID!]!, $read: Boolean!) {
				markChaptersRead(mediaId: $mediaId, chapterIds: $chapterIds, read: $read) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			{ mediaId: libraryEntryId, chapterIds, read },
			baseUrl()
		)
		return data.markChaptersRead
	},
}
