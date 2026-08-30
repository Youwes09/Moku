import type {
  PlatformAdapter, PlatformFeature, Platform,
  DiscordPresence,
  AppUpdateInfo, StorageInfo, ReleaseInfo,
  UpdateProgress, MigrateProgress,
} from '$lib/platform-adapters/types'

declare const __APP_VERSION__: string

export class WebAdapter implements PlatformAdapter {
  readonly platform: Platform = 'web'

  async init(): Promise<void> {}
  async destroy(): Promise<void> {}

  isSupported(_feature: PlatformFeature): boolean {
    return false
  }

  async getAppDir(): Promise<string> {
    return ''
  }

  async loadStore(key: string): Promise<unknown> {
    try {
      const raw = localStorage.getItem(`moku:${key}`)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async saveStore(key: string, value: unknown): Promise<void> {
    try {
      localStorage.setItem(`moku:${key}`, JSON.stringify(value))
    } catch {}
  }

  async storeCredential(key: string, value: string): Promise<void> {
    localStorage.setItem(`moku:cred:${key}`, value)
  }

  async getCredential(key: string): Promise<string | null> {
    return localStorage.getItem(`moku:cred:${key}`)
  }

  async authenticateBiometric(): Promise<boolean> {
    return false
  }

  async readFile(_path: string): Promise<Uint8Array> { return new Uint8Array() }
  async writeFile(_path: string, _data: Uint8Array): Promise<void> {}
  async pickFolder(): Promise<string | null> { return null }
  async checkPathExists(_path: string): Promise<boolean> { return false }
  async createDirectory(_path: string): Promise<void> {}
  async openPath(_path: string): Promise<void> {}
  async getDefaultDownloadsPath(): Promise<string> { return '' }
  async getStorageInfo(_downloadsPath: string): Promise<StorageInfo> {
    return { manga_bytes: 0, total_bytes: 0, free_bytes: 0, path: '' }
  }
  async migrateDownloads(_src: string, _dst: string): Promise<void> {}
  async getAutoBackupDir(): Promise<string> { return '' }

  async fetchImage(url: string, headers: Record<string, string>): Promise<Blob> {
    const res = await fetch(url, { method: 'GET', headers })
    if (!res.ok) throw new Error(`${res.status}`)
    return res.blob()
  }



  async setTitle(title: string): Promise<void> { document.title = title }
  async minimize(): Promise<void> {}
  async maximize(): Promise<void> {}
  async close(): Promise<void> {}
  async toggleFullscreen(): Promise<void> {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {})
    } else {
      await document.exitFullscreen().catch(() => {})
    }
  }

  async setDiscordPresence(_presence: DiscordPresence): Promise<void> {}
  async clearDiscordPresence(): Promise<void> {}

  async getVersion(): Promise<string> { return __APP_VERSION__ }
  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  async checkForAppUpdate(): Promise<AppUpdateInfo | null> { return null }
  async installAppUpdate(_tag: string): Promise<void> {}
  async restartApp(): Promise<void> {}
  async exitApp(): Promise<void> {}
  async listReleases(): Promise<ReleaseInfo[]> { return [] }

  async clearMokuCache(): Promise<void> {}

  async onUpdateProgress(_cb: (p: UpdateProgress) => void): Promise<() => void> { return () => {} }
  async onUpdateLaunching(_cb: () => void): Promise<() => void> { return () => {} }
  async onMigrateProgress(_cb: (p: MigrateProgress) => void): Promise<() => void> { return () => {} }
}
