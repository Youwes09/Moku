import { invoke }                                          from '@tauri-apps/api/core'
import { getCurrentWindow }                                from '@tauri-apps/api/window'
import { listen }                                          from '@tauri-apps/api/event'
import { open }                                            from '@tauri-apps/plugin-dialog'
import { readFile, writeFile }                             from '@tauri-apps/plugin-fs'
import { fetch as tauriFetch }                             from '@tauri-apps/plugin-http'
import { open as openUrl }                                 from '@tauri-apps/plugin-shell'
import { getVersion }                                      from '@tauri-apps/api/app'
import { connect, disconnect, setActivity, clearActivity } from 'tauri-plugin-discord-rpc-api'
import type {
  PlatformAdapter, PlatformFeature, Platform,
  DiscordPresence,
  AppUpdateInfo, StorageInfo, ReleaseInfo,
  UpdateProgress, MigrateProgress,
} from '$lib/platform-adapters/types'

const DISCORD_APP_ID = '1487894643613106298'

export class TauriAdapter implements PlatformAdapter {
  readonly platform: Platform = 'tauri'

  async init() {
    await connect(DISCORD_APP_ID).catch(() => {})
  }

  async destroy() {
    await disconnect().catch(() => {})
  }

  isSupported(feature: PlatformFeature): boolean {
    const supported: PlatformFeature[] = [
      'biometric-auth',
      'native-window', 'filesystem', 'app-updates', 'discord-rpc',
    ]
    return supported.includes(feature)
  }

  async getAppDir(): Promise<string> {
    return invoke<string>('get_app_dir')
  }

  async loadStore(key: string): Promise<unknown> {
    try {
      const raw = await invoke<unknown>('load_store', { key })
      if (typeof raw === 'string') {
        try { return JSON.parse(raw) } catch { return null }
      }
      return raw
    } catch {
      return null
    }
  }

  async saveStore(key: string, value: unknown): Promise<void> {
    await invoke('save_store', { key, value: JSON.stringify(value) })
  }

  async storeCredential(key: string, value: string): Promise<void> {
    await invoke('store_credential', { key, value })
  }

  async getCredential(key: string): Promise<string | null> {
    try {
      return await invoke<string | null>('get_credential', { key })
    } catch {
      return null
    }
  }

  async authenticateBiometric(): Promise<boolean> {
    try {
      await invoke('windows_hello_authenticate', { reason: 'Authenticate to access Moku' })
      return true
    } catch {
      return false
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    return readFile(path)
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    await writeFile(path, data)
  }

  async pickFolder(): Promise<string | null> {
    const result = await open({ directory: true, multiple: false })
    return typeof result === 'string' ? result : null
  }

  async checkPathExists(path: string): Promise<boolean> {
    return invoke('check_path_exists', { path })
  }

  async createDirectory(path: string): Promise<void> {
    await invoke('create_directory', { path })
  }

  async openPath(path: string): Promise<void> {
    await invoke('open_path', { path })
  }

  async getDefaultDownloadsPath(): Promise<string> {
    return invoke('get_default_downloads_path')
  }

  async getStorageInfo(downloadsPath: string): Promise<StorageInfo> {
    return invoke('get_storage_info', { downloadsPath })
  }

  async migrateDownloads(src: string, dst: string): Promise<void> {
    await invoke('migrate_downloads', { src, dst })
  }

  async getAutoBackupDir(): Promise<string> {
    return invoke('get_auto_backup_dir')
  }

  async listSystemFonts(): Promise<string[]> {
    return invoke('list_system_fonts')
  }

  async fetchImage(url: string, headers: Record<string, string>): Promise<Blob> {
    const res = await tauriFetch(url, { method: 'GET', headers })
    if (!res.ok) throw new Error(`${res.status}`)
    return res.blob()
  }

  async setTitle(title: string): Promise<void> {
    await getCurrentWindow().setTitle(title)
  }

  async minimize(): Promise<void> {
    await getCurrentWindow().minimize()
  }

  async maximize(): Promise<void> {
    const win = getCurrentWindow()
    await (await win.isMaximized() ? win.unmaximize() : win.maximize())
  }

  async close(): Promise<void> {
    await getCurrentWindow().close()
  }

  async toggleFullscreen(): Promise<void> {
    const win = getCurrentWindow()
    await win.setFullscreen(!await win.isFullscreen())
  }

  async setDiscordPresence(presence: DiscordPresence): Promise<void> {
    await setActivity(presence).catch(() => {})
  }

  async clearDiscordPresence(): Promise<void> {
    await clearActivity().catch(() => {})
  }

  async getVersion(): Promise<string> {
    return getVersion()
  }

  async openExternal(url: string): Promise<void> {
    await openUrl(url)
  }

  async checkForAppUpdate(): Promise<AppUpdateInfo | null> {
    const releases = await invoke<Array<{ tag_name: string; html_url: string; body: string }>>('list_releases')
    const current  = await getVersion()
    const valid    = releases.filter(r => r.tag_name?.trim())
    if (!valid.length) return null

    const parse  = (v: string) => v.replace(/^v/, '').split('.').map(Number)
    const latest = valid.map(r => r.tag_name).sort((a, b) => {
      const pa = parse(a), pb = parse(b)
      for (let i = 0; i < 3; i++) if ((pb[i] ?? 0) !== (pa[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
      return 0
    })[0]

    const pa = parse(latest), pb = parse(current)
    if (!pa.some((n, i) => n > (pb[i] ?? 0))) return null

    const rel = valid.find(r => r.tag_name === latest)!
    return { version: latest.replace(/^v/, ''), url: rel.html_url, notes: rel.body }
  }

  async installAppUpdate(tag: string): Promise<void> {
    await invoke('download_and_install_update', { tag })
  }

  async restartApp(): Promise<void> {
    await invoke('restart_app')
  }

  async exitApp(): Promise<void> {
    await invoke('exit_app')
  }

  async listReleases(): Promise<ReleaseInfo[]> {
    const all = await invoke<ReleaseInfo[]>('list_releases')
    return all.filter(r => typeof r.tag_name === 'string' && r.tag_name.trim())
  }

  async clearMokuCache(): Promise<void> {
    await invoke('clear_moku_cache')
  }

  async onUpdateProgress(cb: (p: UpdateProgress) => void): Promise<() => void> {
    return listen<UpdateProgress>('update-progress', e => cb(e.payload))
  }

  async onUpdateLaunching(cb: () => void): Promise<() => void> {
    return listen('update-launching', cb)
  }

  async onMigrateProgress(cb: (p: MigrateProgress) => void): Promise<() => void> {
    return listen<MigrateProgress>('migrate_progress', e => cb(e.payload))
  }
}