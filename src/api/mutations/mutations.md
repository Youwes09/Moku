# Mutations

## Manga (`mutations/manga.ts`)

| Mutation | Variables | Description |
|----------|-----------|-------------|
| `FETCH_MANGA` | `id: Int!` | Fetch and refresh manga metadata from its source |
| `UPDATE_MANGA` | `id: Int!`, `inLibrary: Boolean` | Update a single manga's library membership |
| `UPDATE_MANGAS` | `ids: [Int!]!`, `inLibrary: Boolean` | Bulk-update library membership for multiple manga |
| `UPDATE_MANGA_CATEGORIES` | `mangaId: Int!`, `addTo: [Int!]!`, `removeFrom: [Int!]!` | Add or remove a single manga from categories |
| `UPDATE_MANGAS_CATEGORIES` | `ids: [Int!]!`, `addTo: [Int!]!`, `removeFrom: [Int!]!` | Bulk add/remove multiple manga from categories |
| `CREATE_CATEGORY` | `name: String!` | Create a new category |
| `UPDATE_CATEGORY` | `id: Int!`, `name: String` | Update a category's name |
| `UPDATE_CATEGORIES` | `ids: [Int!]!`, `patch: UpdateCategoryPatchInput!` | Bulk-update multiple categories |
| `DELETE_CATEGORY` | `id: Int!` | Delete a category |
| `UPDATE_CATEGORY_ORDER` | `id: Int!`, `position: Int!` | Move a category to a new position |
| `UPDATE_CATEGORY_MANGA` | `categoryId: Int!` | Trigger a metadata update for all manga in a category |
| `UPDATE_LIBRARY` | — | Trigger a full library metadata refresh |
| `UPDATE_LIBRARY_MANGA` | `mangaId: Int!` | Trigger a metadata update for a single manga |
| `UPDATE_STOP` | — | Stop the currently running library update job |
| `CREATE_BACKUP` | — | Create a backup and return its download URL |
| `RESTORE_BACKUP` | `backup: Upload!` | Restore a backup file and return the restore job status |
| `SET_MANGA_META` | `mangaId: Int!`, `key: String!`, `value: String!` | Set a key/value meta entry on a manga |
| `DELETE_MANGA_META` | `mangaId: Int!`, `key: String!` | Delete a key/value meta entry from a manga |

---

## Chapters (`mutations/chapters.ts`)

| Mutation | Variables | Description |
|----------|-----------|-------------|
| `FETCH_CHAPTERS` | `mangaId: Int!` | Fetch/refresh the chapter list for a manga from its source |
| `FETCH_CHAPTER_PAGES` | `chapterId: Int!` | Fetch the page URLs for a specific chapter |
| `MARK_CHAPTER_READ` | `id: Int!`, `isRead: Boolean!` | Mark a single chapter read or unread |
| `MARK_CHAPTERS_READ` | `ids: [Int!]!`, `isRead: Boolean!` | Bulk mark chapters read or unread |
| `UPDATE_CHAPTERS_PROGRESS` | `ids: [Int!]!`, `isRead: Boolean`, `isBookmarked: Boolean`, `lastPageRead: Int` | Bulk update read state, bookmark state, and last page read |
| `DELETE_DOWNLOADED_CHAPTERS` | `ids: [Int!]!` | Delete downloaded chapter files |
| `SET_CHAPTER_META` | `chapterId: Int!`, `key: String!`, `value: String!` | Set a key/value meta entry on a chapter |
| `DELETE_CHAPTER_META` | `chapterId: Int!`, `key: String!` | Delete a key/value meta entry from a chapter |

---

## Downloads (`mutations/downloads.ts`)

| Mutation | Variables | Description |
|----------|-----------|-------------|
| `ENQUEUE_DOWNLOAD` | `chapterId: Int!` | Add a single chapter to the download queue |
| `ENQUEUE_CHAPTERS_DOWNLOAD` | `chapterIds: [Int!]!` | Add multiple chapters to the download queue |
| `DEQUEUE_DOWNLOAD` | `chapterId: Int!` | Remove a single chapter from the download queue |
| `DEQUEUE_CHAPTERS_DOWNLOAD` | `chapterIds: [Int!]!` | Remove multiple chapters from the download queue |
| `REORDER_DOWNLOAD` | `chapterId: Int!`, `to: Int!` | Move a queued chapter to a new position |
| `START_DOWNLOADER` | — | Start the downloader |
| `STOP_DOWNLOADER` | — | Stop the downloader |
| `CLEAR_DOWNLOADER` | — | Clear all items from the download queue |
| `FETCH_SOURCE_MANGA` | `source: LongString!`, `type: FetchSourceMangaType!`, `page: Int!`, `query: String`, `filters: [FilterChangeInput!]` | Fetch manga from a source (browse/search) with pagination |
| `SET_DOWNLOADS_PATH` | `path: String!` | Set the downloads directory path |
| `SET_LOCAL_SOURCE_PATH` | `path: String!` | Set the local source directory path |

---

## Extensions (`mutations/extensions.ts`)

| Mutation | Variables | Description |
|----------|-----------|-------------|
| `FETCH_EXTENSIONS` | — | Fetch the latest extension list from configured repos |
| `UPDATE_EXTENSION` | `id: String!`, `install: Boolean`, `uninstall: Boolean`, `update: Boolean` | Install, uninstall, or update a single extension |
| `UPDATE_EXTENSIONS` | `ids: [String!]!`, `install: Boolean`, `uninstall: Boolean`, `update: Boolean` | Bulk install, uninstall, or update multiple extensions |
| `INSTALL_EXTERNAL_EXTENSION` | `url: String!` | Install an extension from an external APK URL |
| `UPDATE_SOURCE_PREFERENCE` | `source: LongString!`, `change: SourcePreferenceChangeInput!` | Update a source-specific preference value |
| `SET_SOURCE_META` | `sourceId: LongString!`, `key: String!`, `value: String!` | Set a key/value meta entry on a source |
| `DELETE_SOURCE_META` | `sourceId: LongString!`, `key: String!` | Delete a key/value meta entry from a source |
| `SET_CATEGORY_META` | `categoryId: Int!`, `key: String!`, `value: String!` | Set a key/value meta entry on a category |
| `DELETE_CATEGORY_META` | `categoryId: Int!`, `key: String!` | Delete a key/value meta entry from a category |
| `SET_GLOBAL_META` | `key: String!`, `value: String!` | Set a global key/value meta entry |
| `DELETE_GLOBAL_META` | `key: String!` | Delete a global key/value meta entry |
| `CLEAR_CACHED_IMAGES` | `cachedPages: Boolean`, `cachedThumbnails: Boolean`, `downloadedThumbnails: Boolean` | Selectively clear cached page images, cached thumbnails, or downloaded thumbnails |
| `RESET_SETTINGS` | — | Reset all server settings to defaults |
| `UPDATE_WEBUI` | — | Trigger a WebUI update and return live status |
| `RESET_WEBUI_UPDATE_STATUS` | — | Reset the WebUI update status back to idle |
| `SET_EXTENSION_REPOS` | `repos: [String!]!` | Set the list of extension repository URLs |
| `SET_SERVER_AUTH` | `authMode: AuthMode!`, `authUsername: String!`, `authPassword: String!` | Configure server auth mode and credentials |
| `SET_SOCKS_PROXY` | `socksProxyEnabled: Boolean!`, `socksProxyHost: String!`, `socksProxyPort: String!`, `socksProxyVersion: Int!`, `socksProxyUsername: String!`, `socksProxyPassword: String!` | Configure SOCKS proxy settings |
| `SET_FLARESOLVERR` | `flareSolverrEnabled: Boolean!`, `flareSolverrUrl: String!`, `flareSolverrTimeout: Int!`, `flareSolverrSessionName: String!`, `flareSolverrSessionTtl: Int!`, `flareSolverrAsResponseFallback: Boolean!` | Configure FlareSolverr integration |

---

## Tracking (`mutations/tracking.ts`)

| Mutation | Variables | Description |
|----------|-----------|-------------|
| `BIND_TRACK` | `mangaId: Int!`, `trackerId: Int!`, `remoteId: LongString!` | Bind a manga to a remote tracker entry |
| `UPDATE_TRACK` | `recordId: Int!`, `status: Int`, `lastChapterRead: Float`, `scoreString: String`, `startDate: LongString`, `finishDate: LongString`, `private: Boolean` | Update tracking progress, status, score, and dates |
| `UNBIND_TRACK` | `recordId: Int!` | Unbind a manga from a tracker record |
| `FETCH_TRACK` | `recordId: Int!` | Refresh a track record from the remote tracker |
| `TRACK_PROGRESS` | `mangaId: Int!` | Sync current reading progress to all bound trackers for a manga |
| `LOGIN_TRACKER_OAUTH` | `trackerId: Int!`, `callbackUrl: String!` | Initiate OAuth login for a tracker |
| `LOGIN_TRACKER_CREDENTIALS` | `trackerId: Int!`, `username: String!`, `password: String!` | Log into a tracker with username and password |
| `LOGOUT_TRACKER` | `trackerId: Int!` | Log out of a tracker |
| `CONNECT_KOSYNC` | `username: String!`, `password: String!`, `serverAddress: String!` | Connect a KOReader sync account |
| `LOGOUT_KOSYNC` | — | Disconnect the KOReader sync account |
| `PULL_KOSYNC_PROGRESS` | `chapterId: Int!` | Pull reading progress from KOReader sync for a chapter |
| `PUSH_KOSYNC_PROGRESS` | `chapterId: Int!` | Push reading progress to KOReader sync for a chapter |
| `LOGIN_USER` | `username: String!`, `password: String!` | Authenticate and return access + refresh tokens |
| `REFRESH_TOKEN` | — | Refresh the current access token |

---

## New in Preview

Mutations now available and not yet wired to any feature in Moku:

| Mutation | Potential Feature |
|----------|-------------------|
| `UPDATE_MANGAS_CATEGORIES` | Bulk category editor — move/assign multiple manga at once |
| `UPDATE_CATEGORIES` | Bulk category settings — toggle update/download flags for multiple categories at once |
| `UPDATE_CATEGORY_MANGA` | Per-category refresh button — update only one category's manga |
| `UPDATE_LIBRARY_MANGA` | Single manga refresh — trigger from series detail without a full library update |
| `UPDATE_STOP` | Cancel button for library update jobs |
| `UPDATE_EXTENSIONS` | Bulk extension updater — "update all" button in extensions page |
| `UPDATE_SOURCE_PREFERENCE` | Source settings page — persist source-specific preferences |
| `SET_SOURCE_META` / `DELETE_SOURCE_META` | Per-source client state — store browse position, last filter, etc. |
| `SET_CATEGORY_META` / `DELETE_CATEGORY_META` | Per-category client state — store sort/filter preferences per category |
| `SET_CHAPTER_META` / `DELETE_CHAPTER_META` | Per-chapter client state — annotations, custom notes |
| `SET_GLOBAL_META` / `DELETE_GLOBAL_META` | Server-synced app state — replace local persistence for settings that should roam |
| `CLEAR_CACHED_IMAGES` | Storage settings — granular cache clearing (pages, thumbnails, downloaded) |
| `RESET_SETTINGS` | Settings page — factory reset button |
| `UPDATE_WEBUI` / `RESET_WEBUI_UPDATE_STATUS` | WebUI update flow in settings — trigger and monitor update progress |
| `TRACK_PROGRESS` | One-tap sync — push current reading position to all trackers without opening tracking panel |
| `CONNECT_KOSYNC` / `LOGOUT_KOSYNC` | KOReader sync settings section — connect/disconnect account |
| `PULL_KOSYNC_PROGRESS` / `PUSH_KOSYNC_PROGRESS` | KOReader sync — manual pull/push per chapter, or auto-sync on chapter open/close |