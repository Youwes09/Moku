# Queries

## Manga (`queries/manga.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_LIBRARY` | — | All in-library manga with metadata, source, chapter counts, download count, unread count, bookmark count, and read progress anchors (`lastReadChapter`, `firstUnreadChapter`) |
| `GET_ALL_MANGA` | — | Minimal manga list — id, title, thumbnail, library flag, download count |
| `GET_MANGA` | `id: Int!` | Full detail for a single manga — includes `updateStrategy`, `lastReadChapter`, `firstUnreadChapter`, `highestNumberedChapter` |
| `GET_CATEGORIES` | — | All categories with order/settings and their assigned manga (minimal fields) |
| `GET_DOWNLOADED_CHAPTERS_PAGES` | — | Page counts for all downloaded chapters — used for storage stats |
| `GET_DOWNLOADS_PATH` | — | `downloadsPath` and `localSourcePath` from settings |
| `LIBRARY_UPDATE_STATUS` | — | Current library update job — `jobsInfo` progress and `mangaUpdates` list with new chapters |
| `GET_RESTORE_STATUS` | `id: String!` | Backup restore job status by job ID — `mangaProgress`, `state`, `totalManga` |
| `VALIDATE_BACKUP` | `backup: Upload!` | Validate a backup file before restore — returns missing sources and trackers |
| `MANGAS_BY_GENRE` | `filter: MangaFilterInput`, `first: Int`, `offset: Int` | Paginated manga filtered by genre, ordered by `IN_LIBRARY_AT DESC` |

---

## Chapters (`queries/chapters.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_RECENTLY_UPDATED` | — | Latest 300 chapters ordered by `FETCHED_AT DESC` with parent manga info |
| `GET_CHAPTERS` | `mangaId: Int!` | All chapters for a manga — includes `lastReadAt`, `lastPageRead`, read/download/bookmark state, page count, scanlator |

---

## Downloads (`queries/downloads.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_DOWNLOAD_STATUS` | — | Downloader state (`DownloaderState` enum) and full queue with chapter and manga info |

---

## Extensions (`queries/extensions.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_LOCAL_MANGA` | — | Manga from the local source (`sourceId: "0"`) |
| `GET_EXTENSIONS` | — | All extensions — install status, update flag, obsolete flag, metadata |
| `GET_SOURCES` | — | All sources — id, name, lang, display name, icon, NSFW flag, `isConfigurable`, `supportsLatest`, `baseUrl` |
| `GET_SETTINGS` | — | `extensionRepos` from settings |
| `GET_SERVER_SECURITY` | — | Full security config — auth mode, SOCKS proxy settings, FlareSolverr settings |

---

## Tracking (`queries/tracking.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_TRACKERS` | — | All trackers with login state, token expiry, capability flags (`supportsPrivateTracking`, `supportsReadingDates`, `supportsTrackDeletion`), scores, and statuses |
| `GET_MANGA_TRACK_RECORDS` | `mangaId: Int!` | All track records for a specific manga — includes `libraryId`, score, dates, privacy flag |
| `SEARCH_TRACKER` | `trackerId: Int!`, `query: String!` | Search a tracker by query string — returns id, title, cover, summary, publishing info |
| `GET_ALL_TRACKER_RECORDS` | — | All trackers and their full record lists with associated manga — includes `isTokenExpired`, `libraryId` |
| `GET_TRACKER_RECORDS` | `trackerId: Int!` | Records for a specific tracker with associated manga |

---

## Updater (`queries/updater.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_ABOUT_SERVER` | — | Server name, version, build type, build time, GitHub and Discord links |
| `GET_ABOUT_WEBUI` | — | WebUI channel, tag, and last update timestamp |
| `CHECK_FOR_SERVER_UPDATES` | — | Available server updates — channel, tag, download URL |
| `CHECK_FOR_WEBUI_UPDATE` | — | Available WebUI updates — channel and tag |
| `GET_WEBUI_UPDATE_STATUS` | — | Live WebUI update state (`UpdateState` enum), progress percent, and info block |

---

## Meta (`queries/meta.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_META` | `key: String!` | Single server-side key/value meta entry |
| `GET_METAS` | — | All global meta entries as a node list |

---

## KoSync (`queries/kosync.ts`)

| Query | Variables | Description |
|-------|-----------|-------------|
| `GET_KOSYNC_STATUS` | — | KOReader sync connection status |

---

## New in Preview

Queries and fields now available but not yet wired to any feature in Moku:

| Query / Field | Potential Feature |
|---------------|-------------------|
| `GET_ABOUT_SERVER` | About page — server version, build info, links to GitHub and Discord |
| `GET_ABOUT_WEBUI` | About page — WebUI version and release channel |
| `CHECK_FOR_SERVER_UPDATES` | Update available banner or settings badge |
| `CHECK_FOR_WEBUI_UPDATE` | Update available banner or settings badge |
| `GET_WEBUI_UPDATE_STATUS` | Update progress indicator in settings |
| `GET_META` / `GET_METAS` | Server-side persistence — sync app state across clients without local storage |
| `GET_KOSYNC_STATUS` | KOReader sync settings section — show connection state |
| `trackRecords` (top-level) | Flat tracker record browser — filter by score, privacy, tracker |
| `category` (single by id) | Direct category detail without fetching all categories |
| `chapter` (single by id) | Direct chapter lookup without fetching full manga chapter list |
| `source` (single by id) | Source detail page — preferences, filters, browse |
| `tracker` (single by id) | Individual tracker detail — statuses, records |
| `trackRecord` (single by id) | Direct track record lookup for deep linking |
| `lastUpdateTimestamp` | Stale data detection — poll before refetching library |
| `MangaType.hasDuplicateChapters` | Library health view — flag manga with duplicate chapter numbers |
| `MangaType.age` / `chaptersAge` | Stale manga indicator — highlight series with no updates in N days |
| `MangaType.initialized` | Loading skeleton gating — skip detail render until manga is fully fetched |
| `SourceType.isConfigurable` | Source list — show gear icon only when source is configurable |
| `SourceType.supportsLatest` | Source browse UI — conditionally show Latest tab |
| `TrackerType.supportsTrackDeletion` | Tracking panel — show remove button only when tracker supports it |
| `TrackerType.supportsReadingDates` | Tracking panel — show date fields only when tracker supports them |
| `TrackerType.isTokenExpired` | Re-auth prompt — detect expired tokens before a request fails |