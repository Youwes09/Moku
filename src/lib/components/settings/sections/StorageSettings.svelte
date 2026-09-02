<script lang="ts">
  import { Trash, ClockCounterClockwise } from 'phosphor-svelte'
  import { untrack } from 'svelte'
  import { platformService } from '$lib/platform-service'
  import { addToast as toast } from '$lib/state/notifications.svelte'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { exportAppData, importAppData } from '$lib/core/backup'
  import { loadBackups, saveBackups, saveSettings, saveLibrary } from '$lib/core/persistence/persist'
  import { DEFAULT_SETTINGS } from '$lib/types/settings'
  import { DEFAULT_READING_STATS } from '$lib/types/history'
  import { clearBlobCache } from '$lib/core/cache/imageCache'
  import { cache as queryCache } from '$lib/core/cache/queryCache'
  import { tsunagu } from '$lib/server-adapters/tsunagu'

  const supportsFilesystem = platformService.isSupported('filesystem')

  type ResetState = 'idle' | 'busy' | 'done' | 'error'
  interface ResetItem { key: string; label: string; desc: string; state: ResetState; error: string | null; confirm: boolean }

  let resetItems = $state<ResetItem[]>([
    { key: 'all-cache',       label: 'Clear all caches',      desc: 'Flushes the image blob cache, page cache, query cache, Moku disk cache, and server image/thumbnail cache in one pass.', state: 'idle', error: null, confirm: false },
    { key: 'reading-history', label: 'Clear reading history', desc: 'Erases chapter history, read log, reading stats, and daily read counts.',                                                        state: 'idle', error: null, confirm: true  },
    { key: 'moku-settings',   label: 'Reset Moku settings',   desc: 'Restores all app settings to their defaults. Does not affect library data.',                                                       state: 'idle', error: null, confirm: true  },
  ])

  let confirming = $state<string | null>(null)

  function patchReset(key: string, update: Partial<ResetItem>) {
    resetItems = resetItems.map(i => i.key === key ? { ...i, ...update } : i)
  }

  function showExitCountdown(): Promise<void> {
    return new Promise(resolve => {
      const backdrop = document.createElement('div')
      backdrop.className = 's-backdrop'
      backdrop.style.cssText = 'z-index:99999'
      const modal = document.createElement('div')
      modal.style.cssText = 'background:var(--bg-surface);border:1px solid var(--border-base);border-radius:var(--radius-2xl);box-shadow:0 0 0 1px rgba(255,255,255,0.04) inset,0 24px 80px rgba(0,0,0,0.7);width:min(400px,calc(100vw - 40px));display:flex;flex-direction:column;overflow:hidden;animation:s-scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both'
      const header = document.createElement('div')
      header.style.cssText = 'padding:var(--sp-4) var(--sp-5) var(--sp-3);border-bottom:1px solid var(--border-dim)'
      const title = document.createElement('p')
      title.style.cssText = 'margin:0;font-size:var(--text-sm);font-weight:var(--weight-medium);color:var(--text-primary);letter-spacing:0.01em'
      title.textContent = 'Reset complete'
      header.appendChild(title)
      const body = document.createElement('div')
      body.style.cssText = 'padding:var(--sp-4) var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-2)'
      const sub = document.createElement('p')
      sub.style.cssText = 'margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide);line-height:var(--leading-snug)'
      sub.textContent = 'Moku will close so you can relaunch with the reset applied.'
      const counter = document.createElement('p')
      counter.style.cssText = 'margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide)'
      counter.textContent = 'Closing in 3…'
      body.append(sub, counter)
      const footer = document.createElement('div')
      footer.style.cssText = 'padding:var(--sp-3) var(--sp-5);border-top:1px solid var(--border-dim);display:flex;justify-content:flex-end'
      const btn = document.createElement('button')
      btn.className = 's-btn s-btn-danger'
      btn.textContent = 'Close now'
      footer.appendChild(btn)
      modal.append(header, body, footer)
      backdrop.appendChild(modal)
      document.body.appendChild(backdrop)
      let secs = 3
      const tick = setInterval(() => {
        secs--
        counter.textContent = secs > 0 ? `Closing in ${secs}…` : 'Closing…'
        if (secs <= 0) { clearInterval(tick); backdrop.remove(); resolve() }
      }, 1000)
      btn.addEventListener('click', () => { clearInterval(tick); backdrop.remove(); resolve() })
    })
  }

  async function clearAllCaches(): Promise<void> {
    clearBlobCache()
    queryCache.clearAll()
    await Promise.all([
      platformService.clearMokuCache(),
      tsunagu.clearImageCache(),
    ])
  }

  async function runReset(key: string) {
    confirming = null
    patchReset(key, { state: 'busy', error: null })
    try {
      switch (key) {
        case 'all-cache':
          await clearAllCaches()
          break
        case 'reading-history':
          await saveLibrary({ sessions: [], bookmarks: [], dailyReadCounts: {} })
          break
        case 'moku-settings':
          localStorage.clear()
          await saveSettings({ settings: DEFAULT_SETTINGS, storeVersion: 2 })
          patchReset(key, { state: 'done' })
          await showExitCountdown()
          platformService.exitApp()
          return
      }
      patchReset(key, { state: 'done' })
      setTimeout(() => patchReset(key, { state: 'idle' }), 3000)
    } catch (e: any) {
      patchReset(key, { state: 'error', error: e?.message ?? String(e) })
    }
  }

  interface StorageInfo { manga_bytes: number; total_bytes: number; free_bytes: number; path: string }

  const isExternalServer = $derived.by(() => {
    const url = (settingsState.settings.serverUrl ?? 'http://localhost:6007').toLowerCase().trim()
    try {
      const host = new URL(url).hostname
      return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
    } catch { return false }
  })

  let storageInfo    = $state<StorageInfo | null>(null)
  let storageLoading = $state(false)
  let storageError   = $state<string | null>(null)

  let downloadsPathInput   = $state(settingsState.settings.serverDownloadsPath ?? '')
  let localSourcePathInput = $state(settingsState.settings.serverLocalSourcePath ?? '')
  let rescanning           = $state(false)

  async function rescanLocal() {
    if (rescanning) return
    rescanning = true
    try {
      const found = await tsunagu.rescanLocalMedia()
      const { loadLibrary } = await import('$lib/state/library.svelte')
      await loadLibrary(true)
      toast({ kind: 'success', title: 'Local library rescanned', body: `${found.length} local ${found.length === 1 ? 'title' : 'titles'}` })
    } catch (e) {
      toast({ kind: 'error', title: 'Rescan failed', body: String(e) })
    } finally { rescanning = false }
  }
  let pathsSaving          = $state(false)
  let pathsError           = $state<string | null>(null)
  let pathsFieldError      = $state<{ dl?: string; loc?: string }>({})
  let pathsSaved           = $state(false)

  let defaultDownloadsPath = $state('')
  $effect(() => {
    if (!supportsFilesystem) return
    if (!isExternalServer) {
      platformService.getDefaultDownloadsPath().then(p => { defaultDownloadsPath = p })
    } else {
      defaultDownloadsPath = ''
    }
  })

  let confirmedDownloadsPath   = $state(settingsState.settings.serverDownloadsPath ?? '')
  let confirmedLocalSourcePath = $state(settingsState.settings.serverLocalSourcePath ?? '')

  let migrateFrom     = $state<string | null>(null)
  let migrateTo       = $state<string | null>(null)
  let migrating       = $state(false)
  let migrateProgress = $state<{ done: number; total: number; current: string } | null>(null)
  let migrateError    = $state<string | null>(null)
  let migrateUnlisten: (() => void) | null = null

  let extraScanDirs     = $state<string[]>([...(settingsState.settings.extraScanDirs ?? [])])
  let newScanDir        = $state('')
  let multiStorageInfos = $state<(StorageInfo & { label: string })[]>([])
  let advStorageOpen    = $state(false)
  let backupSectionOpen = $state(false)
  let resetSectionOpen  = $state(false)

  async function fetchStorage() {
    if (!supportsFilesystem) return
    storageLoading = true; storageError = null
    try {
      if (isExternalServer) { multiStorageInfos = []; storageInfo = null; return }
      const dl  = settingsState.settings.serverDownloadsPath ?? ''
      const loc = settingsState.settings.serverLocalSourcePath ?? ''
      const effectiveDl = dl || defaultDownloadsPath
      const dirsToScan: { path: string; label: string }[] = []
      if (effectiveDl) dirsToScan.push({ path: effectiveDl, label: dl ? 'Downloads' : 'Downloads (default)' })
      if (loc && loc !== effectiveDl) dirsToScan.push({ path: loc, label: 'Local source' })
      for (const p of extraScanDirs) {
        if (p && !dirsToScan.find(d => d.path === p)) dirsToScan.push({ path: p, label: p })
      }
      if (dirsToScan.length === 0) { multiStorageInfos = []; storageInfo = null; return }
      const results = await Promise.allSettled(
        dirsToScan.map(d => platformService.getStorageInfo(d.path).then(info => ({ ...info, label: d.label })))
      )
      multiStorageInfos = results
        .filter((r): r is PromiseFulfilledResult<StorageInfo & { label: string }> => r.status === 'fulfilled')
        .map(r => r.value)
      storageInfo = multiStorageInfos[0] ?? null
    } catch (e: any) {
      storageError = e instanceof Error ? e.message : String(e)
    } finally { storageLoading = false }
  }

  async function validatePath(path: string): Promise<string | null> {
    if (!path.trim() || isExternalServer || !supportsFilesystem) return null
    try {
      const exists = await platformService.checkPathExists(path.trim())
      return exists ? null : 'Directory does not exist'
    } catch { return 'Could not check path' }
  }

  async function createDirectory(path: string): Promise<void> {
    if (isExternalServer) throw new Error('Cannot create directories on an external server')
    await platformService.createDirectory(path)
  }

  async function savePaths() {
    const dl  = downloadsPathInput.trim()
    const loc = localSourcePathInput.trim()
    pathsError = null; pathsFieldError = {}
    const [dlErr, locErr] = await Promise.all([validatePath(dl), validatePath(loc)])
    if (dlErr || locErr) { pathsFieldError = { ...(dlErr ? { dl: dlErr } : {}), ...(locErr ? { loc: locErr } : {}) }; return }
    pathsSaving = true
    try {
      updateSettings({ serverDownloadsPath: dl, serverLocalSourcePath: loc })
      if (supportsFilesystem && !isExternalServer) {
        const oldDl = confirmedDownloadsPath || defaultDownloadsPath
        const newDl = dl || defaultDownloadsPath
        if (newDl && oldDl && newDl !== oldDl) {
          const hadContent = await platformService.checkPathExists(oldDl)
          if (hadContent) { migrateFrom = oldDl; migrateTo = newDl }
        }
      }
      confirmedDownloadsPath = dl; confirmedLocalSourcePath = loc
      pathsSaved = true; setTimeout(() => pathsSaved = false, 2000)
      await fetchStorage()
    } catch (e: any) {
      pathsError = e?.message ?? 'Failed to save paths'
    } finally { pathsSaving = false }
  }

  async function startMigration() {
    if (!migrateFrom || !migrateTo) return
    migrating = true; migrateError = null; migrateProgress = { done: 0, total: 0, current: '' }
    migrateUnlisten = await platformService.onMigrateProgress(p => { migrateProgress = p })
    try {
      await platformService.migrateDownloads(migrateFrom, migrateTo)
      migrateFrom = null; migrateTo = null; migrateProgress = null
      await fetchStorage()
    } catch (e: any) {
      migrateError = e?.message ?? 'Migration failed'
    } finally { migrating = false; migrateUnlisten?.(); migrateUnlisten = null }
  }

  function dismissMigration() { migrateFrom = null; migrateTo = null; migrateError = null; migrateProgress = null }

  async function browseDownloadsFolder() {
    const picked = await platformService.pickFolder()
    if (picked) { downloadsPathInput = picked; pathsFieldError = { ...pathsFieldError, dl: undefined }; await savePaths() }
  }

  async function browseLocalSourceFolder() {
    const picked = await platformService.pickFolder()
    if (picked) { localSourcePathInput = picked; pathsFieldError = { ...pathsFieldError, loc: undefined }; await savePaths() }
  }

  async function browseExtraScanDir() {
    const picked = await platformService.pickFolder()
    if (picked) { newScanDir = picked; addExtraScanDir() }
  }

  function addExtraScanDir() {
    const dir = newScanDir.trim()
    if (!dir || extraScanDirs.includes(dir)) return
    extraScanDirs = [...extraScanDirs, dir]
    updateSettings({ extraScanDirs }); newScanDir = ''; fetchStorage()
  }

  function removeExtraScanDir(path: string) {
    extraScanDirs = extraScanDirs.filter(d => d !== path)
    updateSettings({ extraScanDirs }); fetchStorage()
  }

  function fmtBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
  }

  let backupLoading = $state(false)
  let backupError   = $state<string | null>(null)
  let backupList    = $state<{ url: string; name: string; deleting?: boolean }[]>([])

  let srvStorage    = $state<import('$lib/server-adapters/types').StorageInfo | null>(null)
  let srvLoading    = $state(false)
  let srvError      = $state<string | null>(null)
  let srvClearing   = $state<string | null>(null)

  let dbBackups     = $state<import('$lib/server-adapters/types').DatabaseBackup[]>([])
  let dbBackupsErr  = $state<string | null>(null)
  let backingUp     = $state(false)
  let deletingBk    = $state<string | null>(null)

  async function loadServerStorage() {
    srvLoading = true; srvError = null
    try { srvStorage = await tsunagu.storageInfo() }
    catch (e) { srvError = e instanceof Error ? e.message : String(e); srvStorage = null }
    finally { srvLoading = false }
  }

  async function clearCategory(key: string) {
    if (srvClearing) return
    srvClearing = key
    try {
      srvStorage = await tsunagu.clearStorageCategory(key)
      toast({ kind: 'success', title: 'Cleared', body: key })
    } catch (e) {
      toast({ kind: 'error', title: 'Clear failed', body: e instanceof Error ? e.message : String(e) })
    } finally { srvClearing = null }
  }

  async function loadDbBackups() {
    dbBackupsErr = null
    try { dbBackups = await tsunagu.databaseBackups() }
    catch (e) { dbBackupsErr = e instanceof Error ? e.message : String(e); dbBackups = [] }
  }

  async function makeDbBackup() {
    if (backingUp) return
    backingUp = true
    try {
      await tsunagu.createDatabaseBackup()
      await loadDbBackups()
      toast({ kind: 'success', title: 'Database backed up' })
    } catch (e) {
      toast({ kind: 'error', title: 'Backup failed', body: e instanceof Error ? e.message : String(e) })
    } finally { backingUp = false }
  }

  async function deleteDbBackup(name: string) {
    if (deletingBk) return
    deletingBk = name
    try {
      await tsunagu.deleteDatabaseBackup(name)
      dbBackups = dbBackups.filter(b => b.name !== name)
    } catch (e) {
      toast({ kind: 'error', title: 'Delete failed', body: e instanceof Error ? e.message : String(e) })
    } finally { deletingBk = null }
  }

  async function loadBackupList() {
    backupList = (await loadBackups()).map(b => ({ ...b }))
  }

  async function saveBackupList() {
    await saveBackups(backupList.map(({ url, name }) => ({ url, name })))
  }

  let appDataExporting = $state(false)
  let appDataImporting = $state(false)
  let appDataError     = $state<string | null>(null)
  let appDataMsg       = $state<string | null>(null)
  let appDataBackupDir = $state<string | null>(null)

  $effect(() => {
    if (!supportsFilesystem) return
    platformService.getAutoBackupDir().then(d => { appDataBackupDir = d }).catch(() => {})
  })

  async function handleExportAppData() {
    appDataExporting = true; appDataError = null; appDataMsg = null
    try {
      await exportAppData()
      appDataMsg = 'Backup saved.'
      setTimeout(() => appDataMsg = null, 3000)
    } catch (e: any) {
      if (String(e).includes('Cancelled')) return
      appDataError = e?.message ?? String(e)
    } finally { appDataExporting = false }
  }

  async function handleImportAppData() {
    appDataImporting = true; appDataError = null; appDataMsg = null
    try {
      await importAppData()
    } catch (e: any) {
      if (String(e).includes('Cancelled')) { appDataImporting = false; return }
      appDataError = e?.message ?? String(e)
      appDataImporting = false
    }
  }

  $effect(() => { untrack(() => { loadBackupList(); fetchStorage(); loadServerStorage(); loadDbBackups() }) })
</script>

<div class="s-panel">

  {#if migrateFrom && !isExternalServer}
    <div class="s-migrate-banner">
      <div class="s-migrate-body">
        <span class="s-migrate-title">Manga found at the previous path. Move it?</span>
        <span class="s-migrate-paths">{migrateFrom} → {migrateTo}</span>
        {#if migrateProgress && migrateProgress.total > 0}
          <div class="s-migrate-bar"><div class="s-migrate-fill" style="width:{Math.round((migrateProgress.done/migrateProgress.total)*100)}%"></div></div>
          <span class="s-migrate-paths">{migrateProgress.current} · {migrateProgress.done} / {migrateProgress.total}</span>
        {/if}
        {#if migrateError}<span class="s-desc" style="color:var(--color-error)">{migrateError}</span>{/if}
      </div>
      <div class="s-migrate-actions">
        <button class="s-btn s-btn-accent" onclick={startMigration} disabled={migrating}>
          {migrating ? (migrateProgress ? `Moving… ${migrateProgress.done}/${migrateProgress.total}` : 'Starting…') : 'Move files'}
        </button>
        <button class="s-btn" onclick={dismissMigration} disabled={migrating}>Skip</button>
      </div>
    </div>
  {/if}

  <div class="s-section">
    <p class="s-section-title">
      Disk Usage
      <button class="s-btn" onclick={() => { loadServerStorage(); fetchStorage() }} disabled={srvLoading || storageLoading}>{srvLoading || storageLoading ? '…' : '↻'}</button>
    </p>
    <div class="s-section-body">
      {#if srvStorage}
        {@const limitGb    = settingsState.settings.storageLimitGb ?? null}
        {@const limitBytes = limitGb !== null ? limitGb * 1024 ** 3 : null}
        {@const cap        = limitBytes !== null ? Math.min(limitBytes, srvStorage.totalBytes) : srvStorage.totalBytes}
        {@const pct        = cap > 0 ? Math.min(100, (srvStorage.usedBytes / cap) * 100) : 0}
        <div class="s-storage-wrap">
          <div class="s-storage-header">
            <span class="s-storage-label">Server data</span>
            <span class="s-storage-used">{fmtBytes(srvStorage.usedBytes)} of {fmtBytes(cap)}</span>
          </div>
          <div class="s-storage-bar">
            <div class="s-storage-fill" class:critical={pct > 90} class:warn={pct > 75 && pct <= 90} style="width:{pct}%"></div>
          </div>
          <div class="s-storage-footer">
            <span>{srvStorage.mediaDir ?? srvStorage.dataDir ?? ''}</span>
            <span>{fmtBytes(srvStorage.freeBytes)} free</span>
          </div>
        </div>
        {#each srvStorage.categories ?? [] as c (c.key)}
          <div class="s-row">
            <div class="s-row-info"><span class="s-label">{c.label}</span></div>
            <span class="s-desc" style="flex-shrink:0;white-space:nowrap">{fmtBytes(c.bytes)} · {c.fileCount} {c.fileCount === 1 ? 'file' : 'files'}</span>
          </div>
        {/each}
      {:else if multiStorageInfos.length > 0}
        {#each multiStorageInfos as info}
          {@const limitGb    = settingsState.settings.storageLimitGb ?? null}
          {@const limitBytes = limitGb !== null ? limitGb * 1024 ** 3 : null}
          {@const available  = info.manga_bytes + info.free_bytes}
          {@const cap        = limitBytes !== null ? Math.min(limitBytes, available) : available}
          {@const pct        = cap > 0 ? Math.min(100, (info.manga_bytes / cap) * 100) : 0}
          <div class="s-storage-wrap">
            <div class="s-storage-header">
              <span class="s-storage-label">{info.label}</span>
              <span class="s-storage-used">{fmtBytes(info.manga_bytes)} of {fmtBytes(cap)}</span>
            </div>
            <div class="s-storage-bar">
              <div class="s-storage-fill" class:critical={pct > 90} class:warn={pct > 75 && pct <= 90} style="width:{pct}%"></div>
            </div>
            <div class="s-storage-footer">
              <span>{info.path}</span>
              <span>{fmtBytes(info.free_bytes)} free</span>
            </div>
          </div>
        {/each}
      {:else if srvLoading || storageLoading}
        <p class="s-empty">Reading storage…</p>
      {:else if srvError || storageError}
        <p class="s-empty" style="color:var(--color-error)">{srvError ?? storageError}</p>
      {:else if !supportsFilesystem}
        <p class="s-empty">Disk usage is unavailable in web mode.</p>
      {:else}
        <p class="s-empty">No storage data available.</p>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Downloads Path</p>
    <div class="s-section-body">
      {#if isExternalServer}
        <div class="s-row">
          <span class="s-desc">Read from the external server. Edits update its config directly.</span>
        </div>
      {/if}
      <div class="s-row" style="gap:var(--sp-2)">
        <input class="s-input full" class:error={!!pathsFieldError.dl}
          bind:value={downloadsPathInput}
          placeholder={isExternalServer ? 'Server default' : (defaultDownloadsPath || 'Default location')}
          spellcheck="false"
          onkeydown={(e) => e.key === 'Enter' && savePaths()}
          oninput={() => { pathsFieldError = { ...pathsFieldError, dl: undefined } }} />
        {#if !isExternalServer && supportsFilesystem}
          <button class="s-btn" onclick={browseDownloadsFolder}>Browse</button>
        {/if}
      </div>
      <div class="s-row">
        <div class="s-row-info">
          {#if pathsFieldError.dl}
            <span class="s-desc" style="color:var(--color-error)">{pathsFieldError.dl}</span>
          {/if}
          {#if pathsError}
            <span class="s-desc" style="color:var(--color-error)">{pathsError}</span>
          {/if}
        </div>
        <div class="s-btn-row">
          {#if pathsFieldError.dl && !isExternalServer && supportsFilesystem}
            <button class="s-btn" onclick={async () => {
              try { await createDirectory(downloadsPathInput.trim()); pathsFieldError = { ...pathsFieldError, dl: undefined } }
              catch (e: any) { pathsFieldError = { ...pathsFieldError, dl: e?.message ?? 'Failed' } }
            }}>Create</button>
          {/if}
          {#if downloadsPathInput.trim() !== confirmedDownloadsPath}
            <button class="s-btn s-btn-accent" onclick={savePaths} disabled={pathsSaving}>
              {pathsSaved ? 'Saved ✓' : pathsSaving ? 'Saving…' : 'Save'}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Storage Limit</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Warn when limit is reached</span>
          <span class="s-desc">{settingsState.settings.storageLimitGb === null ? 'No limit set' : `Warn above ${settingsState.settings.storageLimitGb} GB`}</span>
        </div>
        {#if settingsState.settings.storageLimitGb === null}
          <button class="s-btn" onclick={() => updateSettings({ storageLimitGb: 10 })}>Set limit</button>
        {:else}
          <div class="s-stepper">
            <button class="s-step-btn" onclick={() => updateSettings({ storageLimitGb: Math.max(1, (settingsState.settings.storageLimitGb ?? 10) - 1) })} disabled={(settingsState.settings.storageLimitGb ?? 10) <= 1}>−</button>
            <input type="number" min="1" step="1" class="s-slider-val" style="width:52px"
              value={settingsState.settings.storageLimitGb}
              oninput={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n) && n > 0) updateSettings({ storageLimitGb: n }) }} />
            <span class="s-slider-unit">GB</span>
            <button class="s-step-btn" onclick={() => updateSettings({ storageLimitGb: (settingsState.settings.storageLimitGb ?? 10) + 1 })}>+</button>
            <button class="s-btn-icon" title="Remove limit" onclick={() => updateSettings({ storageLimitGb: null })}>↺</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => advStorageOpen = !advStorageOpen}>
      <span class="s-label">Advanced</span>
      <svg class="s-collapsible-caret" class:open={advStorageOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if advStorageOpen}
      <div class="s-collapsible-body">
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Local source path</span>
            <span class="s-desc">Read manga already on disk without an extension. Leave blank if unused.</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="s-btn-row">
              <input class="s-input mono" class:error={!!pathsFieldError.loc}
                bind:value={localSourcePathInput} placeholder="Optional" spellcheck="false"
                onkeydown={(e) => e.key === 'Enter' && savePaths()}
                oninput={() => { pathsFieldError = { ...pathsFieldError, loc: undefined } }} />
              {#if !isExternalServer && supportsFilesystem}
                <button class="s-btn" onclick={browseLocalSourceFolder}>Browse</button>
              {/if}
              {#if pathsFieldError.loc && !isExternalServer && supportsFilesystem}
                <button class="s-btn" onclick={async () => {
                  try { await createDirectory(localSourcePathInput.trim()); pathsFieldError = { ...pathsFieldError, loc: undefined } }
                  catch (e: any) { pathsFieldError = { ...pathsFieldError, loc: e?.message ?? 'Failed' } }
                }}>Create</button>
              {/if}
              <button class="s-btn" onclick={rescanLocal} disabled={rescanning}>{rescanning ? 'Scanning…' : 'Rescan'}</button>
            </div>
            {#if pathsFieldError.loc}<span class="s-desc" style="color:var(--color-error)">{pathsFieldError.loc}</span>{/if}
          </div>
        </div>

        {#each extraScanDirs as dir}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label mono" style="font-family:monospace;font-size:var(--text-xs)">{dir}</span>
              <span class="s-desc">Extra scan directory</span>
            </div>
            <button class="s-btn s-btn-danger" onclick={() => removeExtraScanDir(dir)}>Remove</button>
          </div>
        {/each}

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Additional scan path</span>
            <span class="s-desc">Include an extra directory in disk usage readings</span>
          </div>
          <div class="s-btn-row">
            <input class="s-input mono" bind:value={newScanDir} placeholder="/path/to/dir" spellcheck="false"
              onkeydown={(e) => e.key === 'Enter' && addExtraScanDir()} />
            {#if !isExternalServer && supportsFilesystem}
              <button class="s-btn" onclick={browseExtraScanDir}>Browse</button>
            {/if}
          </div>
        </div>

        {#if (srvStorage?.categories ?? []).some(c => c.clearable)}
          <p class="s-subsection-title">Clear caches</p>
          {#if srvError}<div class="s-banner s-banner-error">{srvError}</div>{/if}
          {#each (srvStorage?.categories ?? []).filter(c => c.clearable) as c (c.key)}
            <div class="s-row">
              <div class="s-row-info">
                <span class="s-label">{c.label}</span>
                <span class="s-desc">{fmtBytes(c.bytes)} · {c.fileCount} {c.fileCount === 1 ? 'file' : 'files'}</span>
              </div>
              <button class="s-btn s-btn-danger" disabled={srvClearing === c.key || c.bytes === 0} onclick={() => clearCategory(c.key)}>
                {srvClearing === c.key ? '…' : 'Clear'}
              </button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => backupSectionOpen = !backupSectionOpen}>
      <span class="s-label">Backup</span>
      <svg class="s-collapsible-caret" class:open={backupSectionOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if backupSectionOpen}
      <div class="s-collapsible-body">

        <p class="s-subsection-title">Database backup</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Server database</span>
            <span class="s-desc">Online SQLite snapshot. Restore is manual: stop the server, swap the database file, start it again.</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={makeDbBackup} disabled={backingUp}>{backingUp ? 'Backing up…' : 'Back up now'}</button>
        </div>

        {#if dbBackupsErr}<div class="s-banner s-banner-error">{dbBackupsErr}</div>{/if}

        {#each dbBackups as b (b.name)}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label mono" style="font-family:monospace;font-size:var(--text-xs)">{b.name}</span>
              <span class="s-desc">{fmtBytes(b.bytes)} · {new Date(b.createdAt).toLocaleString()}</span>
            </div>
            <div class="s-btn-row">
              <button class="s-btn" onclick={() => platformService.openPath(b.path)}>Reveal</button>
              <button class="s-btn s-btn-danger" disabled={deletingBk === b.name} onclick={() => deleteDbBackup(b.name)}>
                {deletingBk === b.name ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        {/each}

        <p class="s-subsection-title">Library backup</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Library backup</span>
            <span class="s-desc">Not available yet.</span>
          </div>
        </div>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Restore from file</span>
            <span class="s-desc">Not available yet.</span>
          </div>
          <button class="s-btn" disabled>Browse</button>
        </div>

        <p class="s-subsection-title">App data backup</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Export settings</span>
            <span class="s-desc">Save all Moku app settings to a .zip via a native save dialog.</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={handleExportAppData} disabled={appDataExporting || !supportsFilesystem}>
            {appDataExporting ? 'Saving…' : 'Export'}
          </button>
        </div>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Import settings</span>
            <span class="s-desc">Restore from a previously exported .zip file. Reloads the app immediately.</span>
          </div>
          <button class="s-btn" onclick={handleImportAppData} disabled={appDataImporting || !supportsFilesystem}>
            {appDataImporting ? 'Importing…' : 'Import'}
          </button>
        </div>

        {#if appDataError}
          <div class="s-banner s-banner-error">{appDataError}</div>
        {/if}

        {#if appDataMsg}
          <div class="s-row">
            <span class="s-desc" style="color:var(--color-success,#4caf50)">{appDataMsg}</span>
          </div>
        {/if}

        {#if appDataBackupDir}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Auto-backup location</span>
              <span class="s-desc">Pre-update snapshots are kept here (last 5).</span>
            </div>
            <button class="s-btn" onclick={() => platformService.openPath(appDataBackupDir!)}>Open folder</button>
          </div>
        {/if}

      </div>
    {/if}
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => resetSectionOpen = !resetSectionOpen}>
      <span class="s-label">Reset</span>
      <svg class="s-collapsible-caret" class:open={resetSectionOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if resetSectionOpen}
      <div class="s-collapsible-body">
        {#each resetItems as item}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">{item.label}</span>
              <span class="s-desc">{item.desc}</span>
              {#if item.error}<span class="s-desc" style="color:var(--color-error)">{item.error}</span>{/if}
            </div>
            <div class="s-btn-row">
              {#if item.state === 'done'}
                <span class="s-pill on">Done</span>
              {:else if item.state === 'busy'}
                <button class="s-btn" disabled>Working…</button>
              {:else if confirming === item.key}
                <span class="s-desc" style="color:var(--text-muted)">Sure?</span>
                <button class="s-btn s-btn-danger" onclick={() => runReset(item.key)}>Confirm</button>
                <button class="s-btn" onclick={() => confirming = null}>Cancel</button>
              {:else}
                <button
                  class="s-btn"
                  class:s-btn-danger={item.confirm}
                  onclick={() => item.confirm ? (confirming = item.key) : runReset(item.key)}
                >Reset</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

</div>