<script lang="ts">
  import { platformService } from '$lib/platform-service'
  import { autoBackupAppData } from '$lib/core/backup'
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import type { ReleaseInfo } from '$lib/platform-adapters/types'

  type UpdatePhase = 'idle' | 'downloading' | 'launching' | 'ready' | 'error'

  const supportsUpdates = platformService.isSupported('app-updates')
  const IS_WINDOWS      = navigator.userAgent.includes('Windows')

  interface AboutServer { name: string; version: string; buildTime: string }

  let appVersion      = $state('…')
  let releases        = $state<ReleaseInfo[]>([])
  let releasesLoading = $state(false)
  let releasesError   = $state<string | null>(null)
  let expandedTag     = $state<string | null>(null)
  let updatePhase     = $state<UpdatePhase>('idle')
  let updateError     = $state<string | null>(null)
  let dlBytes         = $state(0)
  let dlTotal         = $state<number | null>(null)
  let targetTag       = $state<string | null>(null)
  let releasesLoaded  = false

  let serverInfo = $state<AboutServer | null>(null)

  $effect(() => {
    platformService.getVersion().then(v => appVersion = v).catch(() => appVersion = 'unknown')
    if (!releasesLoaded) { releasesLoaded = true; loadReleases() }
    loadServerInfo()
  })

  $effect(() => {
    if (!supportsUpdates) return
    let unlisten: (() => void) | undefined
    platformService.onUpdateProgress(p => {
      dlBytes = p.downloaded; dlTotal = p.total ?? null
    }).then(fn => { unlisten = fn })
    return () => unlisten?.()
  })

  $effect(() => {
    if (!supportsUpdates) return
    let unlisten: (() => void) | undefined
    platformService.onUpdateLaunching(() => { updatePhase = 'launching' }).then(fn => { unlisten = fn })
    return () => unlisten?.()
  })

  async function loadReleases() {
    if (!supportsUpdates) return
    releasesLoading = true; releasesError = null
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out after 10s')), 10_000))
      releases = await Promise.race([platformService.listReleases(), timeout])
    } catch (e: any) {
      releasesError = e instanceof Error ? e.message : String(e)
    } finally { releasesLoading = false }
  }

  async function loadServerInfo() {
    try {
      serverInfo = await tsunagu.about()
    } catch {}
  }

  function stripV(v: string) { return v.replace(/^v/, '') }
  function isCurrentVersion(tag: string) { return stripV(tag) === appVersion }
  function parseSemver(v: string) { return stripV(v).split('.').map(Number) }
  function compareSemver(a: string, b: string) {
    const pa = parseSemver(a), pb = parseSemver(b)
    for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0)
    return 0
  }

  const onLatestVersion = $derived((() => {
    if (!supportsUpdates || releasesLoading || releases.length === 0 || !appVersion || appVersion === '…') return false
    const sorted = releases.slice().sort((a, b) => compareSemver(a.tag_name, b.tag_name))
    return compareSemver(appVersion, sorted[0].tag_name) <= 0
  })())

  function fmtDate(iso: string) {
    if (!iso) return ''
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return iso
    return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function fmtBuildTime(iso: string) {
    if (!iso || iso.toLowerCase() === 'unknown') return ''
    const t = Date.parse(iso)
    if (Number.isNaN(t)) return iso
    return new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function fmtBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
  }

  function fmtProgress() {
    return dlTotal
      ? `${fmtBytes(dlBytes)} / ${fmtBytes(dlTotal)} (${Math.round((dlBytes / dlTotal) * 100)}%)`
      : fmtBytes(dlBytes)
  }

  async function installUpdate(release: ReleaseInfo) {
    if (updatePhase === 'downloading') return
    targetTag = release.tag_name; updatePhase = 'downloading'; updateError = null; dlBytes = 0; dlTotal = null
    try {
      if (IS_WINDOWS) {
        await autoBackupAppData()
        await platformService.installAppUpdate(release.tag_name)
        updatePhase = 'ready'
      } else {
        await platformService.openExternal(release.html_url)
        updatePhase = 'idle'; targetTag = null
      }
    } catch (e: any) {
      updateError = e instanceof Error ? e.message : String(e)
      updatePhase = 'error'
    }
  }

  async function restartNow() { await platformService.restartApp() }
  function cancelUpdate() { updatePhase = 'idle'; updateError = null; targetTag = null; dlBytes = 0; dlTotal = null }
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Moku</p>
    <div class="s-section-body">
      <div class="s-row" style="flex-direction:column;align-items:flex-start;gap:var(--sp-1)">
        <span class="s-label">A manga reader frontend for Tsunagu.</span>
        <span class="s-desc">Built with Tauri + Svelte.</span>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Version</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Installed</span><span class="s-desc">v{appVersion}</span></div>
        {#if supportsUpdates}
          <button class="s-btn" onclick={() => { releasesError = null; loadReleases() }} disabled={releasesLoading}>
            {releasesLoading ? 'Loading…' : 'Refresh'}
          </button>
        {/if}
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Platform</span><span class="s-desc">{platformService.platform}</span></div>
      </div>
      {#if onLatestVersion}
        <div class="s-row">
          <span class="s-desc" style="color:var(--accent-fg)">✓ You're on the latest version.</span>
        </div>
      {/if}
      {#if updatePhase === 'downloading' && IS_WINDOWS}
        <div class="s-update-progress">
          <div class="s-update-bar">
            <div class="s-update-fill" style="width:{dlTotal ? Math.round((dlBytes / dlTotal) * 100) : 0}%"></div>
          </div>
          <div class="s-update-labels">
            <span>Downloading {targetTag ?? 'update'}…</span>
            <span>{fmtProgress()}</span>
          </div>
        </div>
      {/if}
      {#if updatePhase === 'launching'}
        <div class="s-update-ready">
          <span class="s-update-ready-label">Launching installer for {targetTag}…</span>
        </div>
      {/if}
      {#if updatePhase === 'ready'}
        <div class="s-update-ready">
          <span class="s-update-ready-label">{targetTag} downloaded. Restart to install.</span>
          <button class="s-btn s-btn-accent" onclick={restartNow}>Restart now</button>
          <button class="s-btn-icon" onclick={cancelUpdate} title="Dismiss">✕</button>
        </div>
      {/if}
      {#if updatePhase === 'error'}
        <div class="s-row">
          <span class="s-desc" style="color:var(--color-error)">{updateError}</span>
          <button class="s-btn" onclick={cancelUpdate}>Dismiss</button>
        </div>
      {/if}
    </div>
  </div>

  {#if serverInfo}
    <div class="s-section">
      <p class="s-section-title">Server</p>
      <div class="s-section-body">
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Version</span>
            <span class="s-desc">{serverInfo.version}</span>
          </div>
        </div>
        {#if fmtBuildTime(serverInfo.buildTime)}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Built</span>
              <span class="s-desc">{fmtBuildTime(serverInfo.buildTime)}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if supportsUpdates}
    <div class="s-section">
      <p class="s-section-title">Releases</p>
      <div class="s-section-body">
        {#if releasesError}
          <p class="s-empty" style="color:var(--color-error)">{releasesError}</p>
        {:else if releasesLoading}
          <p class="s-empty">Fetching releases…</p>
        {:else if releases.length === 0}
          <p class="s-empty">No releases found.</p>
        {:else}
          <div class="s-release-scroll">
            {#each releases as release}
              {@const isCurrent    = isCurrentVersion(release.tag_name)}
              {@const isExpanded   = expandedTag === release.tag_name}
              {@const isTarget     = targetTag === release.tag_name}
              {@const isInstalling = isTarget && updatePhase === 'downloading'}
              <div class="s-release-row" class:current={isCurrent}>
                <div class="s-release-header">
                  <div class="s-release-meta">
                    <span class="s-release-tag">{release.tag_name}</span>
                    {#if isCurrent}<span class="s-release-badge">installed</span>{/if}
                    {#if release.published_at}<span class="s-release-date">{fmtDate(release.published_at)}</span>{/if}
                  </div>
                  <div class="s-btn-row">
                    {#if release.body.trim()}
                      <button class="s-btn" onclick={() => expandedTag = isExpanded ? null : release.tag_name}>
                        {isExpanded ? 'Hide' : 'Changelog'}
                      </button>
                    {/if}
                    {#if !isCurrent}
                      {#if IS_WINDOWS}
                        <button class="s-btn" class:s-btn-accent={!isInstalling}
                          disabled={updatePhase === 'downloading'} onclick={() => installUpdate(release)}>
                          {isInstalling ? 'Downloading…' : 'Install'}
                        </button>
                      {:else}
                        <button class="s-btn" onclick={() => installUpdate(release)}>Open on GitHub</button>
                      {/if}
                    {/if}
                  </div>
                </div>
                {#if isExpanded && release.body.trim()}
                  <div class="s-release-body">
                    <pre class="s-release-body pre">{release.body.trim()}</pre>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="s-section">
    <p class="s-section-title">Links</p>
    <div class="s-section-body">
      <div class="s-row" style="flex-direction:column;align-items:flex-start;gap:var(--sp-2)">
        <a href="https://github.com/moku-project/Moku" target="_blank" class="s-label" style="color:var(--accent-fg);text-decoration:none">GitHub →</a>
        <a href="https://discord.gg/Jq3pwuNqPp" target="_blank" class="s-label" style="color:var(--accent-fg);text-decoration:none">Discord →</a>
      </div>
    </div>
  </div>

</div>