import { DEFAULT_KEYBINDS, type Keybinds } from '$lib/core/keybinds/defaultBinds'
import type { LibrarySortOption, LibraryStatusFilter, LibraryContentFilter } from '$lib/state/library.svelte'

export type PageStyle = 'single' | 'double' | 'longstrip' | 'fade'
export type FitMode = 'width' | 'height' | 'screen' | 'original'
export type ReadingDirection = 'ltr' | 'rtl'
export type ChapterSortDir = 'desc' | 'asc'
export type ChapterSortMode = 'source' | 'chapterNumber' | 'uploadDate'
export type ContentLevel = 'strict' | 'moderate' | 'unrestricted'
export type ContentTypeFilter = 'all' | 'MANGA' | 'NOVEL' | 'ANIME'


export type LibrarySortDir = 'asc' | 'desc'
export type BuiltinTheme = 'original' | 'dark' | 'light' | 'light-contrast' | 'midnight' | 'warm'
export type Theme = BuiltinTheme | string

export interface ThemeTokens {
	'bg-void': string
	'bg-base': string
	'bg-surface': string
	'bg-raised': string
	'bg-overlay': string
	'bg-subtle': string
	'border-dim': string
	'border-base': string
	'border-strong': string
	'border-focus': string
	'text-primary': string
	'text-secondary': string
	'text-muted': string
	'text-faint': string
	'text-disabled': string
	accent: string
	'accent-dim': string
	'accent-muted': string
	'accent-fg': string
	'accent-bright': string
	'color-error': string
	'color-error-bg': string
	'color-success': string
	'color-info': string
	'color-info-bg': string
}

export interface CustomTheme {
	id: string
	name: string
	tokens: ThemeTokens
}

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
	'bg-void': '#080808',
	'bg-base': '#0c0c0c',
	'bg-surface': '#101010',
	'bg-raised': '#151515',
	'bg-overlay': '#1a1a1a',
	'bg-subtle': '#202020',
	'border-dim': '#1c1c1c',
	'border-base': '#242424',
	'border-strong': '#2e2e2e',
	'border-focus': '#4a5c4a',
	'text-primary': '#f0efec',
	'text-secondary': '#c8c6c0',
	'text-muted': '#8a8880',
	'text-faint': '#4e4d4a',
	'text-disabled': '#2a2a28',
	accent: '#6b8f6b',
	'accent-dim': '#2a3d2a',
	'accent-muted': '#1a251a',
	'accent-fg': '#a8c4a8',
	'accent-bright': '#8fb88f',
	'color-error': '#c47a7a',
	'color-error-bg': '#1f1212',
	'color-success': '#7aab7a',
	'color-info': '#7a9ec4',
	'color-info-bg': '#121a1f',
}

export interface MangaPrefs {
	autoDownload: boolean
	downloadAhead: number
	deleteOnRead: boolean
	deleteDelayHours: number
	maxKeepChapters: number
	pauseUpdates: boolean
	refreshInterval: 'global' | 'daily' | 'weekly' | 'manual'
	preferredScanlator: string
	scanlatorFilter: string[]
	scanlatorBlacklist: string[]
	scanlatorForce: boolean
	autoDownloadScanlators: string[]
	coverUrl?: string
	preferredVideoSource?: string
}

export const DEFAULT_MANGA_PREFS: MangaPrefs = {
	autoDownload: false,
	downloadAhead: 0,
	deleteOnRead: false,
	deleteDelayHours: 0,
	maxKeepChapters: 0,
	pauseUpdates: false,
	refreshInterval: 'global',
	preferredScanlator: '',
	scanlatorFilter: [],
	scanlatorBlacklist: [],
	scanlatorForce: false,
	autoDownloadScanlators: [],
}

export interface ReaderSettings {
	pageStyle: PageStyle
	fitMode: FitMode
	readingDirection: ReadingDirection
	readerZoom: number
	pageGap: boolean
	optimizeContrast: boolean
	offsetDoubleSpreads: boolean
	barPosition?: 'top' | 'left' | 'right'
}

export interface ReaderPreset {
	id: string
	name: string
	settings: ReaderSettings
}

export interface Settings {
	pageStyle: PageStyle
	readingDirection: ReadingDirection
	fitMode: FitMode
	readerZoom: number
	pageGap: boolean
	optimizeContrast: boolean
	offsetDoubleSpreads: boolean
	preloadPages: number
	autoMarkRead: boolean
	autoNextChapter: boolean
	libraryCropCovers: boolean
	libraryPageSize: number
	contentLevel: ContentLevel
	sourceOverridesEnabled: boolean
	nsfwAllowedSourceIds: string[]
	nsfwBlockedSourceIds: string[]
	discordRpc: boolean
	chapterSortDir: ChapterSortDir
	chapterSortMode: ChapterSortMode
	chapterPageSize: number
	uiZoom: number
	compactSidebar: boolean
	gpuAcceleration: boolean
	serverUrl: string
	serverAutoStart: boolean
	serverAuthUser: string
	serverAuthPass: string
	preferredExtensionLang: string
	keybinds: Keybinds
	idleTimeoutMin?: number
	splashCards?: boolean
	storageLimitGb: number | null
	markReadOnNext: boolean
	readerDebounceMs: number
	autoBookmark: boolean
	theme: Theme
	libraryBranches: boolean
	renderLimit: number
	heroSlots: (number | null)[]
	mangaLinks: Record<string, string[]>
	mangaPrefs: Record<string, Partial<MangaPrefs>>
	appLockEnabled: boolean
	appLockPin: string
	appLockWindowsHello: boolean
	customThemes: CustomTheme[]
	hiddenCategoryIds: string[]
	defaultLibraryCategoryId: string | null
	savedIsDefaultCategory: boolean
	libraryTabSort: Record<string, { mode: LibrarySortOption; dir: LibrarySortDir }>
	libraryTabStatus: Record<string, LibraryStatusFilter>
	libraryTabFilters: Record<string, Partial<Record<LibraryContentFilter, boolean>>>
	maxPageWidth?: number
	extraScanDirs: string[]
	serverDownloadsPath: string
	serverLocalSourcePath: string
	qolAnimations: boolean
	libraryStatsAlways: boolean
	pinnedSourceIds: string[]
	readerPresets: ReaderPreset[]
	mangaReaderSettings: Record<string, ReaderSettings>
	barPosition?: 'top' | 'left' | 'right'
	trackerSyncBack: boolean
	trackerSyncBackThreshold: number | null
	trackerRespectScanlatorFilter: boolean
	pinchZoom?: boolean
	autoLinkOnOpen: boolean
	downloadToastsEnabled: boolean
	downloadAutoRetry: boolean
	hiddenLibraryTabs: string[]
	libraryPinnedTabOrder: string[]
	autoScroll?: boolean
	autoScrollSpeed?: number
	autoplayNextEpisode?: boolean
	autoEnableSubtitles?: boolean
	preferredSubtitleLang?: string
	videoUpscale?: 'off' | 'fast' | 'quality'
	videoUpscaleExperimental?: boolean
	nethermindMode?: boolean
	playerManualChrome?: boolean
	disableAutoComplete: boolean
	systemThemeSync?: boolean
	systemThemeDark?: string
	systemThemeLight?: string
	closeAction?: 'ask' | 'tray' | 'quit'
	windowControls: boolean
	overlayBars?: boolean
	tapToToggleBar?: boolean
	automationEnabled?: boolean
	automationEnforceGlobal?: boolean
	automationDefaults?: Partial<MangaPrefs>
	libraryShowAllInSaved?: boolean
	libraryHideCompletedInSaved?: boolean
	readerContainerized?: boolean
	lastRunVersion?: string
	hasOnboarded?: boolean
	chapterViewMode?: 'list' | 'grid'
	libraryViewMode?: 'grid' | 'list'
	contentTypeFilter: ContentTypeFilter
	readerSolidChrome?: boolean
}

export const DEFAULT_SETTINGS: Settings = {
	serverAuthUser: '',
	serverAuthPass: '',
	pageStyle: 'longstrip',
	readingDirection: 'ltr',
	fitMode: 'width',
	readerZoom: 1.0,
	pageGap: true,
	optimizeContrast: false,
	offsetDoubleSpreads: false,
	preloadPages: 3,
	autoMarkRead: true,
	autoNextChapter: true,
	libraryCropCovers: true,
	libraryPageSize: 48,
	contentLevel: 'strict',
	sourceOverridesEnabled: false,
	nsfwAllowedSourceIds: [],
	nsfwBlockedSourceIds: [],
	discordRpc: false,
	chapterSortDir: 'desc',
	chapterSortMode: 'source',
	chapterPageSize: 25,
	uiZoom: 1.0,
	compactSidebar: false,
	gpuAcceleration: true,
	serverUrl: 'http://localhost:6007',
	serverAutoStart: true,
	preferredExtensionLang: 'en',
	keybinds: DEFAULT_KEYBINDS,
	idleTimeoutMin: 5,
	splashCards: true,
	storageLimitGb: null,
	markReadOnNext: true,
	readerDebounceMs: 120,
	autoBookmark: true,
	theme: 'dark',
	libraryBranches: true,
	renderLimit: 48,
	heroSlots: [null, null, null, null],
	mangaLinks: {},
	mangaPrefs: {},
	appLockEnabled: false,
	appLockPin: '',
	appLockWindowsHello: false,
	customThemes: [],
	hiddenCategoryIds: [],
	defaultLibraryCategoryId: null,
	savedIsDefaultCategory: false,
	libraryTabSort: {},
	libraryTabStatus: {},
	libraryTabFilters: {},
	extraScanDirs: [],
	serverDownloadsPath: '',
	serverLocalSourcePath: '',
	qolAnimations: true,
	libraryStatsAlways: false,
	pinnedSourceIds: [],
	readerPresets: [],
	mangaReaderSettings: {},
	trackerSyncBack: false,
	trackerSyncBackThreshold: 20,
	trackerRespectScanlatorFilter: true,
	pinchZoom: false,
	autoLinkOnOpen: false,
	downloadToastsEnabled: true,
	downloadAutoRetry: false,
	hiddenLibraryTabs: [],
	libraryPinnedTabOrder: [],
	autoScroll: false,
	autoScrollSpeed: 5,
	autoplayNextEpisode: true,
	autoEnableSubtitles: true,
	preferredSubtitleLang: '',
	videoUpscale: 'off',
	videoUpscaleExperimental: false,
	nethermindMode: false,
	readerSolidChrome: false,
	playerManualChrome: false,
	disableAutoComplete: false,
	windowControls: true,
	hasOnboarded: false,
	chapterViewMode: 'list',
	libraryViewMode: 'grid',
	contentTypeFilter: 'all',
}
