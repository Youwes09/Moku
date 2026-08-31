
export type ContentType = 'NOVEL' | 'MANGA' | 'ANIME'

export interface Repository {
	id: string
	indexUrl: string
	name: string | null
	contentType: ContentType
	addedAt: string
	lastSyncedAt: string | null
}

export interface Extension {
	id: string
	repositoryId: string
	packageName: string
	name: string
	displayName: string
	version: string
	contentType: ContentType
	lang: string
	iconUrl: string | null
	isNsfw: boolean
	supportsLatest: boolean
	apkUrl: string | null
	jarUrl: string | null
	jarPath: string | null
	installed: boolean
	enabled: boolean
	discoveredAt: string
	installedAt: string | null
	installedVersion: string | null
	needsUpdate: boolean | null
}

export interface LibraryEntry {
	id: string
	extensionId: string | null
	extensionName: string
	externalId: string
	contentType: ContentType
	title: string
	thumbnailUrl: string | null
	inLibrary: boolean
	description: string | null
	status: string | null
	author: string | null
	artist: string | null
	extensionRemovedAt: string | null
	addedAt: string
	unreadCount: number
	downloadCount: number
	chapterCount?: number
	latestChapter?: { number: number | null; uploadedAt: string | null } | null
	sourceName?: string
	source: Extension | null
	chapters: Chapter[]
	readingProgress: ReadingProgress[]
	tags: string[]
	genres: string[]
	folders: Folder[]
	trackLinks?: TrackLink[]
	metadata?: MediaMetadata | null
}

export interface Chapter {
	id: string
	mediaId: string | null
	externalId: string
	title: string | null
	number: number | null
	scanlator: string | null
	sourceOrder: number | null
	uploadedAt: string | null
	completed: boolean
	downloaded: boolean
	readingProgress: ReadingProgress | null
	download: Download | null
	pages: string[] | null
	pageCount: number | null
	videoUrl: string | null
}

export type DownloadStatus = 'QUEUED' | 'DOWNLOADING' | 'DONE' | 'FAILED'

export interface Download {
	id: string
	mediaId: string
	chapterId: string
	chapter: Chapter
	status: DownloadStatus
	progress: number
	downloadedBytes: number | null
	bytesPerSec: number | null
	finalSizeBytes: number | null
	error: string | null
	createdAt: string
	completedAt: string | null
}

export interface DownloaderStatus {
	isRunning: boolean
	queuedCount: number
	downloadingCount: number
	failedCount: number
}

export interface ReadingProgress {
	id: string
	mediaId: string
	chapterId: string
	progress: number
	completed: boolean
	positionSeconds: number | null
	durationSeconds: number | null
	updatedAt: string
}

export interface SearchResult {
	id: string
	externalId: string
	title: string
	thumbnailUrl: string | null
	inLibrary: boolean
	status: string | null
	genres: string[]
}

export interface SearchResponse {
	results: SearchResult[]
	hasNextPage: boolean
}

export interface MangaInfo {
	id:            string | null
	extensionId:   string | null
	externalId:    string
	contentType:   ContentType
	title:         string
	description:   string | null
	thumbnailUrl:  string | null
	status:        string | null
	author:        string | null
	artist:        string | null
	genres:        string[]
	tags:          string[]
	inLibrary:     boolean
	chapterCount:  number
	unreadCount:   number
	downloadCount: number
	chapters?:     Chapter[]
	sourceName?:   string | null
	source?:       { id: string; displayName: string; iconUrl: string | null } | null
}

export interface SourceDetails {
	sourceEntryId: string
	title: string
	description: string | null
	coverUrl: string | null
	status: string | null
	authors: string[]
	artists: string[]
	genres: string[]
	mediaId: string | null
}

export interface AboutServer {
	name: string
	version: string
	buildTime: string
}

export interface StorageInfo {
	usedBytes: number
	totalBytes: number
	freeBytes: number
}

export interface Folder {
	id: string
	name: string
	kind: string
	systemKey: string | null
	parentFolderId: string | null
	sortOrder: number
	includeInUpdate: boolean
	includeInDownload: boolean
}
export interface PreviewChapter {
	externalId:  string
	title:       string | null
	number:      number | null
	sourceOrder: number | null
	uploadedAt:  string | null
}

export interface RecentChapter {
	chapter: Chapter
	mediaId: string
	libraryEntryTitle: string
	libraryEntryCoverPath: string | null
	contentType: ContentType
}

export interface Tracker {
	key: string
	name: string
	configured: boolean
	isLoggedIn: boolean
	authUrl: string | null
	iconUrl: string | null
	username: string | null
	scoreOptions: string[]
	statusOptions: { value: number; name: string; animeName: string }[]
}

export interface TrackSearchResult {
	remoteId: string
	title: string
	url: string
	coverUrl: string | null
	summary: string | null
	totalChapters: number | null
	publishingStatus: string | null
	mediaType?: string | null
}

export interface TrackLink {
	id: string
	mediaId: string
	trackerKey: string
	remoteId: string
	title: string
	url: string
	status: number
	statusName: string
	lastChapterRead: number
	totalChapters: number
	score: number
	startedAt: string | null
	finishedAt: string | null
	private: boolean
	lastSyncedAt: string | null
}

export interface MediaMetadata {
	mediaId: string
	provider: string
	providerId: string
	url: string
	coverUrl: string | null
	malId: number | null
	malUrl: string | null
	confidence: number | null
	locked: boolean
	matchedAt: string | null
}

export interface MetadataCandidate {
	provider: string
	providerId: string
	title: string
	url: string
	coverUrl: string | null
	description: string | null
	status: string | null
	genres: string[]
	startYear: number | null
}

export interface LibraryUpdateStatus {
	running: boolean
	total: number
	done: number
	currentTitle: string | null
	newChapterCount: number
	failedTitles: string[]
	startedAt: string | null
	finishedAt: string | null
}

export interface HeaderFilter    { __typename: 'HeaderFilter'; name: string }
export interface SeparatorFilter { __typename: 'SeparatorFilter'; name: string }
export interface SelectFilter    { __typename: 'SelectFilter'; name: string; values: string[]; state: number }
export interface TextFilter      { __typename: 'TextFilter'; name: string; state: string }
export interface CheckBoxFilter  { __typename: 'CheckBoxFilter'; name: string; state: boolean }
export interface TriStateFilter  { __typename: 'TriStateFilter'; name: string; state: number }
export interface SortFilter      { __typename: 'SortFilter'; name: string; values: string[]; hasState: boolean; index: number | null; ascending: boolean | null }
export interface GroupFilter     { __typename: 'GroupFilter'; name: string; children: FilterNode[] }

export type FilterNode =
	| HeaderFilter | SeparatorFilter | SelectFilter | TextFilter
	| CheckBoxFilter | TriStateFilter | SortFilter | GroupFilter

export interface SourcePreference {
	key: string
	title: string
}

export interface FilterInput {
	name: string
	select?:   { state: number }
	text?:     { state: string }
	checkbox?: { state: boolean }
	tristate?: { state: number }
	group?:    { children: FilterInput[] }
	sort?:     { hasState: boolean; index?: number | null; ascending?: boolean | null }
}

export type SettingType   = 'BOOL' | 'INT' | 'STRING'
export type SettingKind   = 'BOOTSTRAP' | 'RUNTIME'
export type SettingScope  = 'LIVE' | 'SANDBOX_RESTART' | 'FULL_RESTART'
export type SettingSource = 'FILE' | 'DB' | 'DEFAULT'

export interface ServerSetting {
	key: string
	value: string
	default: string
	type: SettingType
	kind: SettingKind
	scope: SettingScope
	source: SettingSource
	editable: boolean
	description: string
}

export interface UpdateSettingResult {
	setting: ServerSetting
	restartRequired: boolean
}

export type CloudflareSolverState = 'NOT_INSTALLED' | 'DOWNLOADING' | 'INSTALLED' | 'RUNNING' | 'ERROR'

export interface CloudflareSolver {
	state: CloudflareSolverState
	downloadProgress: number
	error: string | null
	supportedOnPlatform: boolean
}
