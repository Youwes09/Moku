<script lang="ts">
  import { onMount } from 'svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { platform } from '@tauri-apps/plugin-os'
  import { invoke } from '@tauri-apps/api/core'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'

  const { }: {} = $props()

  const win       = getCurrentWindow()
  const os        = platform()
  const isMac     = os === 'macos'
  const isWindows = os === 'windows'

  let isFullscreen    = $state(false)
  let closeDialogOpen = $state(false)
  let closeRemember   = $state(false)

  const showControls = $derived(settingsState.settings.windowControls ?? true)

  onMount(() => {
    let unlistenResize: (() => void) | undefined
    let unlistenClose:  (() => void) | undefined

    win.isFullscreen().then(v => { isFullscreen = v })

    win.onResized(async () => {
      isFullscreen = await win.isFullscreen()
    }).then(u => { unlistenResize = u })

    win.listen('tauri://close-requested', handleCloseRequested)
      .then(u => { unlistenClose = u })

    return () => {
      unlistenResize?.()
      unlistenClose?.()
    }
  })

  async function doQuit() {
    await invoke('exit_app')
  }

  async function doHide() {
    await win.hide()
  }

  async function handleCloseRequested() {
    const action = settingsState.settings.closeAction ?? 'ask'
    if (action === 'tray') { await doHide(); return }
    if (action === 'quit') { await doQuit(); return }
    closeDialogOpen = true
  }

  async function confirmClose(choice: 'tray' | 'quit') {
    closeDialogOpen = false
    if (closeRemember) updateSettings({ closeAction: choice })
    closeRemember = false
    if (choice === 'tray') await doHide()
    else await doQuit()
  }

  function onBackdropKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { closeDialogOpen = false; closeRemember = false }
  }
</script>

{#if showControls}
  {#if !isFullscreen}
    <div class="bar" data-tauri-drag-region>
      {#if isMac}<div class="mac-spacer"></div>{/if}
      <span class="title" data-tauri-drag-region>Moku</span>
      {#if !isMac}
        <div class="controls">
          <button onclick={() => win.minimize()} title="Minimize" aria-label="Minimize">
            <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" stroke-width="1.5" /></svg>
          </button>
          <button onclick={() => win.toggleMaximize()} title="Maximize" aria-label="Maximize">
            <svg width="9" height="9" viewBox="0 0 9 9"><rect x="0.75" y="0.75" width="7.5" height="7.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
          </button>
          <button class="close" onclick={handleCloseRequested} title="Close" aria-label="Close">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      {/if}
    </div>
  {:else if isWindows}
    <div class="fullscreen-controls">
      <button onclick={() => win.setFullscreen(false)} title="Exit Fullscreen" aria-label="Exit Fullscreen">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <polyline points="1,4 1,1 4,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="6,1 9,1 9,4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="9,6 9,9 6,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <polyline points="4,9 1,9 1,6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <button class="close" onclick={handleCloseRequested} title="Close" aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  {/if}
{/if}

{#if closeDialogOpen}
  <div
    class="close-backdrop"
    role="presentation"
    onclick={() => { closeDialogOpen = false; closeRemember = false }}
    onkeydown={onBackdropKey}
  >
    <div
      class="close-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Close Moku"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="close-header">
        <p class="close-title">Close Moku?</p>
        <p class="close-sub">Choose how the app should exit.</p>
      </div>
      <div class="close-actions">
        <button class="close-btn" onclick={() => confirmClose('tray')}>
          <span class="close-btn-label">Minimize to Tray</span>
          <span class="close-btn-desc">Keep running in the background</span>
        </button>
        <button class="close-btn close-btn-danger" onclick={() => confirmClose('quit')}>
          <span class="close-btn-label">Quit</span>
          <span class="close-btn-desc">Stop Moku entirely</span>
        </button>
      </div>
      <button class="close-remember" onclick={() => closeRemember = !closeRemember}>
        <span class="close-remember-toggle" class:on={closeRemember}><span class="close-remember-thumb"></span></span>
        <span class="close-remember-label">Remember my choice</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; height: var(--titlebar-height); padding: 0 6px 0 var(--sp-4); background: transparent; flex-shrink: 0; user-select: none; -webkit-app-region: drag; }
  .mac-spacer { width: 70px; flex-shrink: 0; -webkit-app-region: drag; }
  .title { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; opacity: 0.5; -webkit-app-region: drag; }
  .controls { display: flex; align-items: center; gap: 2px; -webkit-app-region: no-drag; }

  .controls button,
  .fullscreen-controls button {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--radius-sm);
    color: var(--text-faint);
    transition: color var(--t-base), background var(--t-base);
    -webkit-app-region: no-drag;
  }
  .controls button:hover,
  .fullscreen-controls button:hover { color: var(--text-muted); background: rgba(255,255,255,0.06); }
  .controls .close:hover,
  .fullscreen-controls .close:hover { color: #fff; background: #c0392b; }

  .fullscreen-controls { position: fixed; top: 0; right: 0; z-index: 9999; display: flex; align-items: center; gap: 2px; padding: 4px; opacity: 0; transition: opacity 0.2s ease; -webkit-app-region: no-drag; }
  .fullscreen-controls:hover { opacity: 1; }

  .close-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    z-index: var(--z-modal);
    animation: cdFade 0.18s ease both;
  }
  @keyframes cdFade { from { opacity: 0 } to { opacity: 1 } }

  .close-dialog {
    font-family: var(--font-ui);
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-2xl);
    padding: var(--sp-5);
    display: flex; flex-direction: column; gap: var(--sp-3);
    width: 300px;
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.04) inset,
      0 24px 64px rgba(0,0,0,0.7),
      0 8px 24px rgba(0,0,0,0.4);
    animation: cdPop 0.22s cubic-bezier(0.16,1,0.3,1) both;
    outline: none;
  }
  @keyframes cdPop { from { opacity: 0; transform: scale(0.96) translateY(6px) } to { opacity: 1; transform: none } }

  .close-header { display: flex; flex-direction: column; gap: 3px; }
  .close-title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); margin: 0; }
  .close-sub   { font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); margin: 0; }

  .close-actions { display: flex; flex-direction: column; gap: var(--sp-1); }

  .close-btn {
    display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
    width: 100%; padding: 10px var(--sp-3);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-dim);
    background: var(--bg-raised);
    cursor: pointer; text-align: left;
    font-family: var(--font-ui);
    transition: background var(--t-base), border-color var(--t-base), transform 80ms ease;
  }
  .close-btn:hover  { background: var(--bg-overlay); border-color: var(--border-strong); }
  .close-btn:active { transform: scale(0.985); }

  .close-btn-danger              { border-color: color-mix(in srgb, var(--color-error) 28%, transparent); }
  .close-btn-danger:hover        { background: var(--color-error-bg); border-color: color-mix(in srgb, var(--color-error) 55%, transparent); }
  .close-btn-danger .close-btn-label { color: var(--color-error); }
  .close-btn-danger .close-btn-desc  { color: color-mix(in srgb, var(--color-error) 50%, var(--text-faint)); }

  .close-btn-label { font-size: var(--text-sm); color: var(--text-secondary); font-weight: var(--weight-medium); line-height: 1.2; }
  .close-btn-desc  { font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: 1.2; }

  .close-remember {
    display: flex; align-items: center; gap: var(--sp-2);
    width: 100%; padding: var(--sp-3) 0 0;
    border-top: 1px solid var(--border-dim);
    background: none; border-left: none; border-right: none; border-bottom: none;
    cursor: pointer; user-select: none;
    font-family: var(--font-ui);
  }
  .close-remember:hover .close-remember-label { color: var(--text-muted); }

  .close-remember-toggle {
    position: relative; flex-shrink: 0;
    width: 28px; height: 16px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-strong);
    background: var(--bg-overlay);
    transition: background var(--t-base), border-color var(--t-base);
  }
  .close-remember-toggle.on { background: var(--accent); border-color: var(--accent); }

  .close-remember-thumb {
    position: absolute; top: 1px; left: 1px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text-faint);
    transition: transform var(--t-base), background var(--t-base);
  }
  .close-remember-toggle.on .close-remember-thumb { transform: translateX(12px); background: #fff; }

  .close-remember-label { font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); transition: color var(--t-base); }
</style>
