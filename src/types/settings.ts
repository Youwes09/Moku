import { DEFAULT_KEYBINDS, type Keybinds } from "../core/keybinds/defaultBinds";

export type PageStyle        = "single" | "double" | "longstrip";
export type FitMode          = "width" | "height" | "screen" | "original";
export type LibraryFilter    = "all" | "library" | "downloaded" | string;
export type ReadingDirection = "ltr" | "rtl";
export type ChapterSortDir   = "desc" | "asc";
export type ChapterSortMode  = "source" | "chapterNumber" | "uploadDate";
export type ContentLevel     = "strict" | "moderate" | "unrestricted";

export type LibrarySortMode =
  | "az" | "unreadCount" | "totalChapters"
  | "recentlyAdded" | "recentlyRead" | "latestFetched" | "latestUploaded";

export type LibrarySortDir = "asc" | "desc";

export type LibraryStatusFilter  = "ALL" | "ONGOING" | "COMPLETED" | "CANCELLED" | "HIATUS" | "UNKNOWN";
export type LibraryContentFilter = "unread" | "started" | "downloaded" | "bookmarked" | "marked";

export type BuiltinTheme = "original" | "dark" | "light" | "light-contrast" | "midnight" | "warm";
export type Theme        = BuiltinTheme | string;

export interface ThemeTokens {
  "bg-void": string; "bg-base": string; "bg-surface": string;
  "bg-raised": string; "bg-overlay": string; "bg-subtle": string;
  "border-dim": string; "border-base": string; "border-strong": string; "border-focus": string;
  "text-primary": string; "text-secondary": string; "text-muted": string;
  "text-faint": string; "text-disabled": string;
  "accent": string; "accent-dim": string; "accent-muted": string;
  "accent-fg": string; "accent-bright": string;
  "color-error": string; "color-error-bg": string;
  "color-success": string; "color-info": string; "color-info-bg": string;
}

export interface CustomTheme { id: string; name: string; tokens: ThemeTokens; }

export const DEFAULT_THEME_TOKENS: ThemeTokens = {
  "bg-void": "#080808", "bg-base": "#0c0c0c", "bg-surface": "#101010",
  "bg-raised": "#151515", "bg-overlay": "#1a1a1a", "bg-subtle": "#202020",
  "border-dim": "#1c1c1c", "border-base": "#242424", "border-strong": "#2e2e2e", "border-focus": "#4a5c4a",
  "text-primary": "#f0efec", "text-secondary": "#c8c6c0", "text-muted": "#8a8880",
  "text-faint": "#4e4d4a", "text-disabled": "#2a2a28",
  "accent": "#6b8f6b", "accent-dim": "#2a3d2a", "accent-muted": "#1a251a",
  "accent-fg": "#a8c4a8", "accent-bright": "#8fb88f",
  "color-error": "#c47a7a", "color-error-bg": "#1f1212",
  "color-success": "#7aab7a", "color-info": "#7a9ec4", "color-info-bg": "#121a1f",
};

export interface MangaPrefs {
  autoDownload: boolean; downloadAhead: number; deleteOnRead: boolean;
  deleteDelayHours: number; maxKeepChapters: number; pauseUpdates: boolean;
  refreshInterval: "global" | "daily" | "weekly" | "manual";
  preferredScanlator: string; scanlatorFilter: string[];
  scanlatorBlacklist: string[]; scanlatorForce: boolean;
  autoDownloadScanlators: string[];
  coverUrl?: string;
}

export const DEFAULT_MANGA_PREFS: MangaPrefs = {
  autoDownload: false, downloadAhead: 0, deleteOnRead: false,
  deleteDelayHours: 0, maxKeepChapters: 0, pauseUpdates: false,
  refreshInterval: "global", preferredScanlator: "", scanlatorFilter: [],
  scanlatorBlacklist: [], scanlatorForce: false,
  autoDownloadScanlators: [],
};

export interface ReaderSettings {
  pageStyle:           PageStyle;
  fitMode:             FitMode;
  readingDirection:    ReadingDirection;
  readerZoom:          number;
  pageGap:             boolean;
  optimizeContrast:    boolean;
  offsetDoubleSpreads: boolean;
  barPosition?:        "top" | "left" | "right";
}

export interface ReaderPreset {
  id:       string;
  name:     string;
  settings: ReaderSettings;
}

export interface Settings {
  pageStyle: PageStyle; readingDirection: ReadingDirection; fitMode: FitMode;
  readerZoom: number; pageGap: boolean; optimizeContrast: boolean;
  offsetDoubleSpreads: boolean; preloadPages: number;
  autoMarkRead: boolean; autoNextChapter: boolean;
  libraryCropCovers: boolean; libraryPageSize: number;
  contentLevel: ContentLevel; sourceOverridesEnabled: boolean;
  nsfwAllowedSourceIds: string[]; nsfwBlockedSourceIds: string[];
  discordRpc: boolean;
  chapterSortDir: ChapterSortDir; chapterSortMode: ChapterSortMode; chapterPageSize: number;
  uiZoom: number; compactSidebar: boolean; gpuAcceleration: boolean;
  serverUrl: string; serverBinary: string; autoStartServer: boolean; suwayomiWebUI: boolean;
  preferredExtensionLang: string; keybinds: Keybinds;
  idleTimeoutMin?: number; splashCards?: boolean;
  storageLimitGb: number | null; markReadOnNext: boolean; readerDebounceMs: number;
  autoBookmark: boolean; theme: Theme; libraryBranches: boolean; renderLimit: number;
  heroSlots: (number | null)[]; mangaLinks: Record<number, number[]>;
  mangaPrefs: Record<number, Partial<MangaPrefs>>;
  serverAuthUser: string; serverAuthPass: string;
  serverAuthMode: "NONE" | "BASIC_AUTH" | "SIMPLE_LOGIN" | "UI_LOGIN";
  socksProxyEnabled: boolean; socksProxyHost: string; socksProxyPort: string;
  socksProxyVersion: number; socksProxyUsername: string; socksProxyPassword: string;
  flareSolverrEnabled: boolean; flareSolverrUrl: string; flareSolverrTimeout: number;
  flareSolverrSessionName: string; flareSolverrSessionTtl: number; flareSolverrAsResponseFallback: boolean;
  appLockEnabled: boolean; appLockPin: string;
  customThemes: CustomTheme[]; hiddenCategoryIds: number[];
  defaultLibraryCategoryId: number | null; savedIsDefaultCategory: boolean;
  libraryTabSort: Record<string, { mode: LibrarySortMode; dir: LibrarySortDir }>;
  libraryTabStatus: Record<string, LibraryStatusFilter>;
  libraryTabFilters: Record<string, Partial<Record<LibraryContentFilter, boolean>>>;
  maxPageWidth?: number; uiScale?: number;
  extraScanDirs: string[]; serverDownloadsPath: string; serverLocalSourcePath: string;
  qolAnimations: boolean;
  libraryStatsAlways: boolean;
  pinnedSourceIds: string[];
  readerPresets: ReaderPreset[];
  mangaReaderSettings: Record<number, ReaderSettings>;
  barPosition?: "top" | "left" | "right";
  trackerSyncBack: boolean;
  trackerSyncBackThreshold: number | null;
  trackerRespectScanlatorFilter: boolean;
  pinchZoom?: boolean;
  autoLinkOnOpen: boolean;
  downloadToastsEnabled: boolean;
  downloadAutoRetry: boolean;
  hiddenLibraryTabs: string[];
  libraryPinnedTabOrder: string[];
  autoScroll?: boolean;
  autoScrollSpeed?: number;
  disableAutoComplete: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  pageStyle: "longstrip", readingDirection: "ltr", fitMode: "width",
  readerZoom: 1.0, pageGap: true, optimizeContrast: false, offsetDoubleSpreads: false,
  preloadPages: 3, autoMarkRead: true, autoNextChapter: true,
  libraryCropCovers: true, libraryPageSize: 48,
  contentLevel: "strict", sourceOverridesEnabled: false,
  nsfwAllowedSourceIds: [], nsfwBlockedSourceIds: [],
  discordRpc: false,
  chapterSortDir: "desc", chapterSortMode: "source", chapterPageSize: 25,
  uiZoom: 1.0, compactSidebar: false, gpuAcceleration: true,
  serverUrl: "http://localhost:4567", serverBinary: "", autoStartServer: true, suwayomiWebUI: false,
  preferredExtensionLang: "en", keybinds: DEFAULT_KEYBINDS,
  idleTimeoutMin: 5, splashCards: true, storageLimitGb: null,
  markReadOnNext: true, readerDebounceMs: 120, autoBookmark: true,
  theme: "dark", libraryBranches: true, renderLimit: 48,
  heroSlots: [null, null, null, null], mangaLinks: {}, mangaPrefs: {},
  serverAuthUser: "", serverAuthPass: "", serverAuthMode: "NONE",
  socksProxyEnabled: false, socksProxyHost: "", socksProxyPort: "1080",
  socksProxyVersion: 5, socksProxyUsername: "", socksProxyPassword: "",
  flareSolverrEnabled: false, flareSolverrUrl: "http://localhost:8191",
  flareSolverrTimeout: 60, flareSolverrSessionName: "moku",
  flareSolverrSessionTtl: 15, flareSolverrAsResponseFallback: false,
  appLockEnabled: false, appLockPin: "",
  customThemes: [], hiddenCategoryIds: [], defaultLibraryCategoryId: null,
  savedIsDefaultCategory: false,
  libraryTabSort: {}, libraryTabStatus: {}, libraryTabFilters: {},
  extraScanDirs: [], serverDownloadsPath: "", serverLocalSourcePath: "",
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
  disableAutoComplete: false,
};