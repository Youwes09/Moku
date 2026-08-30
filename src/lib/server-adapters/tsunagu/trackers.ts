import { gql, baseUrl } from './gql'
import type { Tracker, TrackSearchResult, TrackLink, ContentType } from '$lib/server-adapters/types'

const TRACKER_FIELDS = `key name configured isLoggedIn authUrl iconUrl username scoreOptions statusOptions { value name animeName }`
const LINK_FIELDS = `
	id mediaId trackerKey remoteId title url
	status statusName lastChapterRead totalChapters score
	startedAt finishedAt private lastSyncedAt`

export interface TrackedMedia {
	id: string
	extensionId: string | null
	externalId: string
	title: string
	thumbnailUrl: string | null
	contentType: string
	sourceName?: string | null
	unreadCount: number
	trackLinks: TrackLink[]
}

export const trackers = {
	async trackedMedia(): Promise<TrackedMedia[]> {
		const data = await gql<{ library: { items: TrackedMedia[] } }>(
			`query TrackedMedia {
				library(limit: 1000) {
					items {
						id extensionId externalId title thumbnailUrl contentType sourceName
						unreadCount
						trackLinks {
							id trackerKey remoteId title url
							status statusName lastChapterRead totalChapters score lastSyncedAt
						}
					}
				}
			}`,
			undefined,
			baseUrl(),
		)
		return data.library.items.filter((m) => m.trackLinks && m.trackLinks.length > 0)
	},

	async pullTracker(mediaId: string): Promise<TrackLink[]> {
		const data = await gql<{ pullTracker: TrackLink[] }>(
			`mutation PullTracker($mediaId: ID!) { pullTracker(mediaId: $mediaId) { ${LINK_FIELDS} } }`,
			{ mediaId },
			baseUrl(),
		)
		return data.pullTracker
	},

	async trackers(): Promise<Tracker[]> {
		const data = await gql<{ trackers: Tracker[] }>(
			`query Trackers { trackers { ${TRACKER_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.trackers
	},

	async trackSearch(trackerKey: string, query: string, contentType?: ContentType): Promise<TrackSearchResult[]> {
		const data = await gql<{ trackSearch: TrackSearchResult[] }>(
			`query TrackSearch($trackerKey: String!, $query: String!, $contentType: ContentType) {
				trackSearch(trackerKey: $trackerKey, query: $query, contentType: $contentType) {
					remoteId title url coverUrl summary totalChapters publishingStatus mediaType
				}
			}`,
			{ trackerKey, query, contentType },
			baseUrl(),
		)
		return data.trackSearch
	},

	async trackerLogin(trackerKey: string, token: string): Promise<Tracker> {
		const data = await gql<{ trackerLogin: Tracker }>(
			`mutation TrackerLogin($trackerKey: String!, $token: String!) {
				trackerLogin(trackerKey: $trackerKey, token: $token) { ${TRACKER_FIELDS} }
			}`,
			{ trackerKey, token },
			baseUrl(),
		)
		return data.trackerLogin
	},

	async trackerLogout(trackerKey: string): Promise<boolean> {
		const data = await gql<{ trackerLogout: boolean }>(
			`mutation TrackerLogout($trackerKey: String!) { trackerLogout(trackerKey: $trackerKey) }`,
			{ trackerKey },
			baseUrl(),
		)
		return data.trackerLogout
	},

	async bindTrack(mediaId: string, trackerKey: string, remoteId: string): Promise<TrackLink> {
		const data = await gql<{ bindTrack: TrackLink }>(
			`mutation BindTrack($mediaId: ID!, $trackerKey: String!, $remoteId: String!) {
				bindTrack(mediaId: $mediaId, trackerKey: $trackerKey, remoteId: $remoteId) { ${LINK_FIELDS} }
			}`,
			{ mediaId, trackerKey, remoteId },
			baseUrl(),
		)
		return data.bindTrack
	},

	async updateTrack(
		linkId: string,
		patch: { status?: number; score?: number; lastChapterRead?: number },
	): Promise<TrackLink> {
		const data = await gql<{ updateTrack: TrackLink }>(
			`mutation UpdateTrack($linkId: ID!, $status: Int, $score: Float, $lastChapterRead: Float) {
				updateTrack(linkId: $linkId, status: $status, score: $score, lastChapterRead: $lastChapterRead) { ${LINK_FIELDS} }
			}`,
			{ linkId, ...patch },
			baseUrl(),
		)
		return data.updateTrack
	},

	async resyncTrack(linkId: string): Promise<TrackLink> {
		const data = await gql<{ resyncTrack: TrackLink }>(
			`mutation ResyncTrack($linkId: ID!) { resyncTrack(linkId: $linkId) { ${LINK_FIELDS} } }`,
			{ linkId },
			baseUrl(),
		)
		return data.resyncTrack
	},

	async unbindTrack(linkId: string): Promise<boolean> {
		const data = await gql<{ unbindTrack: boolean }>(
			`mutation UnbindTrack($linkId: ID!) { unbindTrack(linkId: $linkId) }`,
			{ linkId },
			baseUrl(),
		)
		return data.unbindTrack
	},
}
