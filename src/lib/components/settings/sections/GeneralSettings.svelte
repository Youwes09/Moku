<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { addToast } from '$lib/state/notifications.svelte'
  import { platformService } from '$lib/platform-service'

  import { selectPortal as _defaultPortal } from '$lib/core/ui/selectPortal'
  import type { Action } from 'svelte/action'

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

  let triggerIdleTimeout = $state<HTMLButtonElement>(null!)
  $effect(() => { if (triggerIdleTimeout) registerTrigger('idle-timeout', triggerIdleTimeout) })

  const CANONICAL_LANGS = [
    'en','ja','ko','zh','zh-hans','zh-hant','es','es-419','pt','pt-br','fr','de','it','ru',
    'id','vi','th','ar','tr','pl','nl','uk','ro','hu','cs','sv','fi','da','no','nb','el','he',
    'hi','bn','ta','te','ms','fil','tl','ca','gl','eu','af','sq','hy','az','be','bg','hr','et',
    'ka','is','kk','lv','lt','mk','mn','ne','sr','sk','sl','sw','fa','ur','km','lo','my','si',
    'am','ku','ha','ig','yo','zu','xh'
  ]

  const knownLangs = CANONICAL_LANGS

  let langDraft   = $state(settingsState.settings.preferredExtensionLang ?? '')
  let langInvalid = $state(false)

  function normLang(s: string) { return s.toLowerCase().replace(/[^a-z0-9]/g, '') }

  function levenshtein(a: string, b: string): number {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
    for (let j = 0; j <= b.length; j++) dp[0][j] = j
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
      }
    }
    return dp[a.length][b.length]
  }

  function closestLang(input: string): string | null {
    const n = normLang(input)
    if (!n || knownLangs.length === 0) return null
    let best: string | null = null
    let bestDist = Infinity
    for (const lang of knownLangs) {
      const d = levenshtein(n, normLang(lang))
      if (d < bestDist) { bestDist = d; best = lang }
    }
    return bestDist <= 2 ? best : null
  }

  function commitLangDraft() {
    const trimmed = langDraft.trim()

    if (trimmed === '') {
      langInvalid = false
      updateSettings({ preferredExtensionLang: undefined })
      return
    }

    const normed = normLang(trimmed)

    if (normed === 'en') {
      langInvalid = false
      langDraft   = 'EN'
      updateSettings({ preferredExtensionLang: undefined })
      return
    }

    const exact = knownLangs.find((l) => normLang(l) === normed)
    if (exact) {
      langInvalid = false
      langDraft   = exact.toUpperCase()
      updateSettings({ preferredExtensionLang: exact })
      return
    }

    langInvalid = true
    updateSettings({ preferredExtensionLang: undefined })
    const suggestion = closestLang(trimmed)
    addToast({
      kind:  'error',
      title: `Unknown language "${trimmed.toUpperCase()}"`,
      body:  suggestion ? `Did you mean "${suggestion.toUpperCase()}"? Defaulted to EN.` : 'Defaulted to EN.',
      duration: 4500,
    })
  }

</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Interface scale</p>
    <div class="s-section-body">
      <p class="s-desc" style="padding:var(--sp-2) var(--sp-4) 0">Fits your screen automatically. 100% is the default; adjust to taste. The reader has its own zoom.</p>
      <div class="s-slider-row">
        <input type="range" min={50} max={200} step={5}
          value={Math.round((settingsState.settings.uiZoom ?? 1.0) * 100)}
          oninput={(e) => updateSettings({ uiZoom: Number(e.currentTarget.value) / 100 })}
          class="s-slider" />
        <input type="number" min={50} max={200} step={1} class="s-slider-val"
          value={Math.round((settingsState.settings.uiZoom ?? 1.0) * 100)}
          oninput={(e) => { const n = parseInt(e.currentTarget.value, 10); if (!isNaN(n) && n >= 50 && n <= 200) updateSettings({ uiZoom: n / 100 }) }}
          onblur={(e) => { const n = parseInt(e.currentTarget.value, 10); if (isNaN(n) || n < 50) { updateSettings({ uiZoom: 0.5 }); e.currentTarget.value = '50' } else if (n > 200) { updateSettings({ uiZoom: 2.0 }); e.currentTarget.value = '200' } }}
        />
        <span class="s-slider-unit">%</span>
        <button class="s-btn-icon" onclick={() => updateSettings({ uiZoom: 1.0 })} disabled={(settingsState.settings.uiZoom ?? 1.0) === 1.0} title="Reset to 100%">↺</button>
      </div>
      <div class="s-presets">
        {#each [50,60,70,80,90,100,110,125,150,175,200] as v}
          <button class="s-preset" class:active={Math.round((settingsState.settings.uiZoom ?? 1.0) * 100) === v} onclick={() => updateSettings({ uiZoom: v / 100 })}>{v}%</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Server</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Server URL</span>
          <span class="s-desc">Base URL of your Tsunagu instance</span>
        </div>
        <input class="s-input" value={settingsState.settings.serverUrl ?? 'http://localhost:6007'}
          oninput={(e) => updateSettings({ serverUrl: e.currentTarget.value })}
          placeholder="http://localhost:6007" spellcheck="false" />
      </div>

    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Window</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Close button behavior</span><span class="s-desc">What happens when you click the X button</span></div>
        <div class="s-seg">
          {#each [['ask','Ask'],['tray','Tray'],['quit','Quit']] as [v, l]}
            <button class="s-seg-btn" class:active={(settingsState.settings.closeAction ?? 'ask') === v} onclick={() => updateSettings({ closeAction: v as 'ask' | 'tray' | 'quit' })}>{l}</button>
          {/each}
        </div>
      </div>

      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Window controls</span><span class="s-desc">Show Moku's title bar with minimize/maximize/close</span></div>
        <button role="switch" aria-checked={settingsState.settings.windowControls ?? true} aria-label="Window controls"
          class="s-toggle" class:on={settingsState.settings.windowControls ?? true}
          onclick={() => updateSettings({ windowControls: !(settingsState.settings.windowControls ?? true) })}>
          <span class="s-toggle-thumb"></span>
        </button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Inactivity</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Idle screen timeout</span><span class="s-desc">Show the Moku idle splash after this much inactivity</span></div>
        <div class="s-select">
          <button bind:this={triggerIdleTimeout} class="s-select-btn" onclick={() => toggleSelect('idle-timeout')}>
            <span>{{ '0':'Never','1':'1 minute','2':'2 minutes','5':'5 minutes','10':'10 minutes','15':'15 minutes','30':'30 minutes' }[String(settingsState.settings.idleTimeoutMin ?? 5)] ?? `${settingsState.settings.idleTimeoutMin} min`}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'idle-timeout'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'idle-timeout' || closingSelect === 'idle-timeout'}
            <div use:selectPortal={getTrigger('idle-timeout')} class="s-select-menu" class:anims class:closing={closingSelect === 'idle-timeout'}>
              {#each [['0','Never'],['1','1 minute'],['2','2 minutes'],['5','5 minutes'],['10','10 minutes'],['15','15 minutes'],['30','30 minutes']] as [v, l]}
                <button class="s-select-option" class:active={String(settingsState.settings.idleTimeoutMin ?? 5) === v} onclick={() => { updateSettings({ idleTimeoutMin: Number(v) }); toggleSelect('idle-timeout') }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Integrations</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Discord Rich Presence</span><span class="s-desc">Show what you're reading in your Discord status</span></div>
        <button role="switch" aria-checked={settingsState.settings.discordRpc} aria-label="Discord Rich Presence" class="s-toggle" class:on={settingsState.settings.discordRpc} onclick={() => updateSettings({ discordRpc: !settingsState.settings.discordRpc })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Animations</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">QOL Animations</span><span class="s-desc">Hover lifts, active-tab transitions, and icon micro-animations</span></div>
        <button role="switch" aria-checked={settingsState.settings.qolAnimations ?? true} aria-label="QOL Animations" class="s-toggle" class:on={settingsState.settings.qolAnimations ?? true} onclick={() => updateSettings({ qolAnimations: !(settingsState.settings.qolAnimations ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Language</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Preferred source language</span>
          <span class="s-desc">Used to pre-select languages in Search and deduplicate sources</span>
        </div>
        <input class="s-input" class:s-input-invalid={langInvalid}
          style="width:72px;text-align:center;text-transform:uppercase"
          value={langDraft}
          oninput={(e) => { langDraft = e.currentTarget.value; langInvalid = false }}
          onblur={commitLangDraft}
          onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="en" spellcheck="false" />
      </div>
    </div>
  </div>

</div>

<style>
  .s-seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius-md); overflow: hidden; }
  .s-seg-btn { flex: 1; padding: var(--sp-1) var(--sp-3); font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-faint); background: transparent; cursor: pointer; transition: background var(--t-base), color var(--t-base); border: none; }
  .s-seg-btn:not(:last-child) { border-right: 1px solid var(--border-strong); }
  .s-seg-btn.active { background: var(--accent-muted); color: var(--accent-fg); }
  .s-seg-btn:not(.active):hover { background: var(--bg-raised); color: var(--text-secondary); }
  .s-input-invalid { border-color: var(--color-error, #c47a7a) !important; color: var(--color-error, #c47a7a); }
</style>
