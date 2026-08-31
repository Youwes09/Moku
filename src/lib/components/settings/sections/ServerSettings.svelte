<script lang="ts">
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { addToast } from '$lib/state/notifications.svelte'
  import type { Action } from 'svelte/action'
  import type { ServerSetting, CloudflareSolver } from '$lib/server-adapters/types'

  interface Props {
    selectOpen:      string | null
    closingSelect:   string | null
    toggleSelect:    (id: string) => void
    registerTrigger: (id: string, el: HTMLElement) => void
    getTrigger:      (id: string) => HTMLElement | undefined
    selectPortal:    Action<HTMLElement, HTMLElement | undefined>
    anims:           boolean
  }
  let { selectOpen, closingSelect, toggleSelect, registerTrigger, getTrigger, selectPortal, anims }: Props = $props()

  const LABELS: Record<string, string> = {
    cloudflare_solver_mode:  'Cloudflare solver',
    cloudflare_solver_url:   'Solver URL',
    novel_enabled:           'Novel support',
    metadata_backfill:       'Metadata backfill',
    idle_timeout_minutes:    'Update idle timeout',
    tracker_poll_hours:      'Tracker poll interval',
    public_url:              'Public URL',
    anilist_client_id:       'AniList client ID',
    mal_client_id:           'MyAnimeList client ID',
    mal_client_secret:       'MyAnimeList client secret',
    media_dir:               'Media directory',
    jar_cache_dir:           'Extension cache directory',
    sandbox_heap_mb:         'Sandbox heap (MB)',
    sandbox_addr:            'Sandbox address',
    sandbox_port:            'Sandbox port',
    sandbox_extensions_dir:  'Sandbox extensions directory',
    sandbox_storage_dir:     'Sandbox storage directory',
    pprof_addr:              'Profiler address',
    data_dir:                'Data directory',
    db_path:                 'Database path',
    http_addr:               'API bind address',
    api_token:               'API token',
    sandbox_jar_path:        'Sandbox JAR path',
  }

  const GROUPS: { title: string; keys: string[] }[] = [
    { title: 'Cloudflare',   keys: ['cloudflare_solver_mode', 'cloudflare_solver_url'] },
    { title: 'Features',     keys: ['novel_enabled', 'metadata_backfill', 'idle_timeout_minutes', 'tracker_poll_hours'] },
    { title: 'Integrations', keys: ['public_url', 'anilist_client_id', 'mal_client_id', 'mal_client_secret'] },
    { title: 'Directories',  keys: ['media_dir', 'jar_cache_dir', 'sandbox_extensions_dir', 'sandbox_storage_dir'] },
    { title: 'Sandbox',      keys: ['sandbox_heap_mb', 'sandbox_addr', 'sandbox_port'] },
    { title: 'Diagnostics',  keys: ['pprof_addr'] },
  ]

  const SOLVER_MODES: [string, string][] = [['disabled', 'Disabled'], ['external', 'External'], ['managed', 'Managed']]

  const HINTS: Record<string, string> = {
    cloudflare_solver_mode: 'Managed downloads a bundled solver; External points at your own FlareSolverr.',
    cloudflare_solver_url:  'Only used in External mode.',
    idle_timeout_minutes:   '0 disables the idle timeout.',
    tracker_poll_hours:     '0 disables background tracker polling.',
    metadata_backfill:      'Re-scans the library for missing metadata on startup.',
  }

  const labelFor = (k: string) => LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  function tip(s: ServerSetting): string {
    const parts = [s.description]
    if (s.source === 'FILE') parts.push('Pinned in tsunagu.toml')
    if (s.scope === 'SANDBOX_RESTART') parts.push('Restart the server to apply')
    if (s.scope === 'FULL_RESTART') parts.push('Full server restart to apply')
    return parts.filter(Boolean).join(' · ')
  }

  let settings  = $state<ServerSetting[]>([])
  let loading   = $state(true)
  let error     = $state<string | null>(null)
  let busy      = $state<string | null>(null)
  let drafts    = $state<Record<string, string>>({})
  let rowErrors = $state<Record<string, string>>({})

  const byKey    = $derived(new Map(settings.map(s => [s.key, s])))
  const known    = $derived(new Set(GROUPS.flatMap(g => g.keys)))
  const advanced = $derived(settings.filter(s => s.editable && !known.has(s.key)))
  const readOnly = $derived(settings.filter(s => !s.editable))
  const sections = $derived(
    GROUPS
      .map(g => ({ title: g.title, rows: g.keys.map(k => byKey.get(k)).filter((s): s is ServerSetting => !!s && s.editable) }))
      .filter(g => g.rows.length > 0),
  )

  let triggerSolverMode = $state<HTMLButtonElement>(null!)
  $effect(() => { if (triggerSolverMode) registerTrigger('cf-solver-mode', triggerSolverMode) })

  let cf     = $state<CloudflareSolver | null>(null)
  let cfBusy = $state(false)

  const modeOptions = $derived(
    cf && !cf.supportedOnPlatform ? SOLVER_MODES.filter(([v]) => v !== 'managed') : SOLVER_MODES,
  )

  async function loadCf() {
    try { cf = await tsunagu.cloudflareSolver() } catch { cf = null }
  }

  $effect(() => {
    if (cf?.state !== 'DOWNLOADING') return
    const t = setTimeout(loadCf, 1500)
    return () => clearTimeout(t)
  })

  async function cfAction(fn: () => Promise<CloudflareSolver>) {
    if (cfBusy) return
    cfBusy = true
    try {
      cf = await fn()
    } catch (e) {
      addToast({ kind: 'error', title: 'Cloudflare solver', body: e instanceof Error ? e.message : String(e) })
    } finally {
      cfBusy = false
    }
  }

  async function load() {
    loading = true
    error = null
    try {
      settings = await tsunagu.serverSettings()
      drafts = Object.fromEntries(settings.map(s => [s.key, s.value]))
      if (settings.some(s => s.key === 'cloudflare_solver_mode')) loadCf()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  $effect(() => { load() })

  async function commit(s: ServerSetting, value: string) {
    if (value === s.value || busy) return
    busy = s.key
    rowErrors = { ...rowErrors, [s.key]: '' }
    try {
      const res = await tsunagu.updateServerSetting(s.key, value)
      settings = settings.map(x => x.key === s.key ? res.setting : x)
      drafts = { ...drafts, [s.key]: res.setting.value }
      addToast({ kind: 'success', title: 'Server setting saved', body: labelFor(s.key) })
      if (s.key === 'cloudflare_solver_mode') loadCf()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      rowErrors = { ...rowErrors, [s.key]: msg }
      drafts = { ...drafts, [s.key]: s.value }
    } finally {
      busy = null
    }
  }
</script>

<div class="s-panel">
  {#if loading}
    <div class="s-section"><div class="s-section-body"><div class="s-row"><span class="s-desc">Loading…</span></div></div></div>
  {:else if error}
    <div class="s-section"><div class="s-section-body">
      <div class="s-row"><span class="s-desc ss-err">{error}</span><button class="s-btn" onclick={load}>Retry</button></div>
    </div></div>
  {:else if settings.length === 0}
    <div class="s-section"><div class="s-section-body"><div class="s-row"><span class="s-desc">This server doesn't expose settings.</span></div></div></div>
  {:else}
    {#snippet control(s: ServerSetting)}
      {#if s.type === 'BOOL'}
        <button role="switch" aria-checked={s.value === 'true'} aria-label={labelFor(s.key)}
          class="s-toggle" class:on={s.value === 'true'} disabled={busy === s.key}
          onclick={() => commit(s, s.value === 'true' ? 'false' : 'true')}>
          <span class="s-toggle-thumb"></span>
        </button>
      {:else if s.key === 'cloudflare_solver_mode'}
        <div class="s-select">
          <button bind:this={triggerSolverMode} class="s-select-btn" onclick={() => toggleSelect('cf-solver-mode')}>
            <span>{SOLVER_MODES.find(([v]) => v === s.value)?.[1] ?? s.value}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'cf-solver-mode'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'cf-solver-mode' || closingSelect === 'cf-solver-mode'}
            <div use:selectPortal={getTrigger('cf-solver-mode')} class="s-select-menu" class:anims class:closing={closingSelect === 'cf-solver-mode'}>
              {#each modeOptions as [v, l]}
                <button class="s-select-option" class:active={s.value === v} onclick={() => { commit(s, v); toggleSelect('cf-solver-mode') }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <input class="s-input" type={s.type === 'INT' ? 'number' : 'text'} min={s.type === 'INT' ? 0 : undefined}
          value={drafts[s.key] ?? ''} placeholder={s.default || '—'} disabled={busy === s.key}
          oninput={(e) => drafts = { ...drafts, [s.key]: (e.currentTarget as HTMLInputElement).value }}
          onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
          onblur={() => commit(s, drafts[s.key] ?? '')} />
      {/if}
    {/snippet}

    {#snippet cfStatus()}
      {#if cf && cf.state !== 'NOT_INSTALLED'}
        <div class="s-row ss-cf">
          {#if cf.state === 'DOWNLOADING'}
            <div class="ss-bar"><span style="width:{Math.round((cf.downloadProgress ?? 0) * 100)}%"></span></div>
            <span class="s-step-val">{Math.round((cf.downloadProgress ?? 0) * 100)}%</span>
          {:else if cf.state === 'ERROR'}
            <span class="s-desc ss-err">{cf.error ?? 'Solver install failed.'}</span>
            <button class="s-btn" disabled={cfBusy} onclick={() => cfAction(tsunagu.installCloudflareSolver)}>Retry</button>
          {:else}
            <span class="s-desc">{cf.state === 'RUNNING' ? 'Running' : 'Installed'} · ~230 MB</span>
            <button class="s-btn s-btn-danger" disabled={cfBusy} onclick={() => cfAction(tsunagu.uninstallCloudflareSolver)}>Remove</button>
          {/if}
        </div>
      {/if}
    {/snippet}

    {#snippet rows(list: ServerSetting[])}
      {#each list as s (s.key)}
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label" title={tip(s)}>
              {labelFor(s.key)}{#if s.scope !== 'LIVE'}<span class="ss-r" title={s.scope === 'FULL_RESTART' ? 'Full server restart to apply' : 'Restart the server to apply'}>⟳</span>{/if}
            </span>
            {#if HINTS[s.key]}<span class="s-desc">{HINTS[s.key]}</span>{/if}
            {#if rowErrors[s.key]}<span class="s-desc ss-err">{rowErrors[s.key]}</span>{/if}
          </div>
          {@render control(s)}
        </div>
        {#if s.key === 'cloudflare_solver_mode' && s.value === 'managed'}{@render cfStatus()}{/if}
      {/each}
    {/snippet}

    {#each sections as g (g.title)}
      <div class="s-section">
        <p class="s-section-title">{g.title}</p>
        <div class="s-section-body">{@render rows(g.rows)}</div>
      </div>
    {/each}

    {#if advanced.length > 0}
      <div class="s-section">
        <p class="s-section-title">Advanced</p>
        <div class="s-section-body">{@render rows(advanced)}</div>
      </div>
    {/if}

    <div class="s-section">
      <p class="s-section-title">Read-only</p>
      <div class="s-section-body">
        {#each readOnly as s (s.key)}
          <div class="s-row">
            <div class="s-row-info"><span class="s-label" title={s.description}>{labelFor(s.key)}</span></div>
            <span class="s-step-val" title={s.value}>{s.value || '—'}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .ss-err { color: var(--color-error); }
  .ss-r { margin-left: 6px; color: var(--text-faint); cursor: help; }
  .ss-cf { padding-top: 0; }
  .ss-bar { flex: 1; height: 4px; border-radius: var(--radius-full); background: var(--bg-overlay); overflow: hidden; }
  .ss-bar span { display: block; height: 100%; background: var(--accent); transition: width var(--t-base); }
</style>
