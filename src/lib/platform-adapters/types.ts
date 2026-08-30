export type PlatformFeature =
  | 'biometric-auth'
  | 'native-window'
  | 'filesystem'
  | 'app-updates'
  | 'discord-rpc'

export type Platform = 'tauri' | 'capacitor' | 'web'

export interface DiscordAssets {
  largeImage?: string
  largeText?:  string
  largeUrl?:   string
  smallImage?: string
  smallText?:  string
  smallUrl?:   string
}

export interface DiscordButton {
  label: string
  url:   string
}

export interface DiscordPresence {
  state?:      string
  details?:    string
  assets?:     DiscordAssets
  buttons?:    DiscordButton[]
  timestamps?: { start?: number; end?: number }
  activityType?:      number
  statusDisplayType?: number
}

export interface AppUpdateInfo {
  version: string
  url:     string
  notes:   string
}

export interface StorageInfo {
  manga_bytes: number
  total_bytes: number
  free_bytes:  number
  path:        string
}

export interface MigrateProgress {
  done:    number
  total:   number
  current: string
}

export interface UpdateProgress {
  downloaded: number
  total:      number | null
}

export interface ReleaseInfo {
  tag_name:     string
  name:         string
  body:         string
  published_at: string
  html_url:     string
}

export interface PlatformAdapter {
  readonly platform: Platform

  init():    Promise<void>
  destroy(): Promise<void>
  isSupported(feature: PlatformFeature): boolean

  getAppDir(): Promise<string>

  loadStore(key: string):                  Promise<unknown>
  saveStore(key: string, value: unknown):  Promise<void>

  storeCredential(key: string, value: string): Promise<void>
  getCredential(key: string):                  Promise<string | null>
  authenticateBiometric():                     Promise<boolean>

  readFile(path: string):                  Promise<Uint8Array>
  writeFile(path: string, data: Uint8Array): Promise<void>
  pickFolder():                            Promise<string | null>
  checkPathExists(path: string):           Promise<boolean>
  createDirectory(path: string):           Promise<void>
  openPath(path: string):                  Promise<void>
  getDefaultDownloadsPath():               Promise<string>
  getStorageInfo(downloadsPath: string):   Promise<StorageInfo>
  migrateDownloads(src: string, dst: string): Promise<void>
  getAutoBackupDir():                      Promise<string>

  fetchImage(url: string, headers: Record<string, string>): Promise<Blob>

  setTitle(title: string): Promise<void>
  minimize():              Promise<void>
  maximize():              Promise<void>
  close():                 Promise<void>
  toggleFullscreen():      Promise<void>

  setDiscordPresence(presence: DiscordPresence): Promise<void>
  clearDiscordPresence():                        Promise<void>

  getVersion():                  Promise<string>
  openExternal(url: string):     Promise<void>
  checkForAppUpdate():           Promise<AppUpdateInfo | null>
  installAppUpdate(tag: string): Promise<void>
  restartApp():                  Promise<void>
  exitApp():                     Promise<void>
  listReleases():                Promise<ReleaseInfo[]>

  clearMokuCache(): Promise<void>

  onUpdateProgress(cb: (p: UpdateProgress) => void):   Promise<() => void>
  onUpdateLaunching(cb: () => void):                   Promise<() => void>
  onMigrateProgress(cb: (p: MigrateProgress) => void): Promise<() => void>
}
