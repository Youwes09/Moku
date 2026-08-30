import type {
  PlatformAdapter, PlatformFeature, DiscordPresence, UpdateProgress, MigrateProgress,
} from '$lib/platform-adapters/types'

let adapter: PlatformAdapter | null = null

export function initPlatformService(a: PlatformAdapter): void {
  adapter = a
}

function get(): PlatformAdapter {
  if (!adapter) throw new Error('PlatformService not initialized')
  return adapter
}

export const platformService = {
  get platform()                                            { return get().platform },

  isSupported: (f: PlatformFeature)                        => adapter?.isSupported(f) ?? false,
  init:        ()                                          => get().init(),
  destroy:     ()                                          => get().destroy(),

  getAppDir:   ()                                          => get().getAppDir(),

  loadStore:   (key: string)                               => get().loadStore(key),
  saveStore:   (key: string, value: unknown)               => get().saveStore(key, value),

  storeCredential: (k: string, v: string)                  => get().storeCredential(k, v),
  getCredential:   (k: string)                             => get().getCredential(k),
  authenticateBiometric: ()                                => get().authenticateBiometric(),

  readFile:        (path: string)                          => get().readFile(path),
  writeFile:       (path: string, data: Uint8Array)        => get().writeFile(path, data),
  pickFolder:      ()                                      => get().pickFolder(),
  checkPathExists: (path: string)                          => get().checkPathExists(path),
  createDirectory: (path: string)                          => get().createDirectory(path),
  openPath:        (path: string)                          => get().openPath(path),
  getDefaultDownloadsPath: ()                              => get().getDefaultDownloadsPath(),
  getStorageInfo:  (downloadsPath: string)                 => get().getStorageInfo(downloadsPath),
  migrateDownloads:(src: string, dst: string)              => get().migrateDownloads(src, dst),
  getAutoBackupDir:()                                      => get().getAutoBackupDir(),

  fetchImage:      (url: string, headers: Record<string, string>) => get().fetchImage(url, headers),

  setTitle:         (title: string)                        => get().setTitle(title),
  minimize:         ()                                     => get().minimize(),
  maximize:         ()                                     => get().maximize(),
  close:            ()                                     => get().close(),
  toggleFullscreen: ()                                     => get().toggleFullscreen(),

  setDiscordPresence:   (p: DiscordPresence)               => get().setDiscordPresence(p),
  clearDiscordPresence: ()                                  => get().clearDiscordPresence(),

  getVersion:        ()                                    => get().getVersion(),
  openExternal:      (url: string)                         => get().openExternal(url),
  checkForAppUpdate: ()                                    => get().checkForAppUpdate(),
  installAppUpdate:  (tag: string)                         => get().installAppUpdate(tag),
  restartApp:        ()                                    => get().restartApp(),
  exitApp:           ()                                    => get().exitApp(),
  listReleases:      ()                                    => get().listReleases(),

  clearMokuCache:     ()                                   => get().clearMokuCache(),

  onUpdateProgress:  (cb: (p: UpdateProgress) => void)     => get().onUpdateProgress(cb),
  onUpdateLaunching: (cb: () => void)                      => get().onUpdateLaunching(cb),
  onMigrateProgress: (cb: (p: MigrateProgress) => void)    => get().onMigrateProgress(cb),
}