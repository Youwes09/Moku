<script lang="ts">
  import { store, updateSettings } from "@store/state.svelte";
  import { selectPortal } from "@core/actions/selectPortal";

  interface Props {
    selectOpen: string | null;
    closingSelect: string | null;
    toggleSelect: (id: string) => void;
    anims: boolean;
  }

  let { selectOpen, closingSelect, toggleSelect, anims }: Props = $props();

  let triggerIdleTimeout = $state<HTMLButtonElement>(null!);
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Interface Scale</p>
    <div class="s-section-body">
      <div class="s-slider-row">
        <input type="range" min={50} max={200} step={5}
          value={Math.round((store.settings.uiZoom ?? 1.0) * 100)}
          oninput={(e) => updateSettings({ uiZoom: Number(e.currentTarget.value) / 100 })}
          class="s-slider" />
        <input type="number" min={50} max={200} step={1} class="s-slider-val"
          value={Math.round((store.settings.uiZoom ?? 1.0) * 100)}
          oninput={(e) => { const n = parseInt(e.currentTarget.value, 10); if (!isNaN(n) && n >= 50 && n <= 200) updateSettings({ uiZoom: n / 100 }); }}
          onblur={(e) => { const n = parseInt(e.currentTarget.value, 10); if (isNaN(n) || n < 50) { updateSettings({ uiZoom: 0.5 }); e.currentTarget.value = "50"; } else if (n > 200) { updateSettings({ uiZoom: 2.0 }); e.currentTarget.value = "200"; } }}
        />
        <span class="s-slider-unit">%</span>
        <button class="s-btn-icon" onclick={() => updateSettings({ uiZoom: 1.0 })} disabled={(store.settings.uiZoom ?? 1.0) === 1.0} title="Reset to 100%">↺</button>
      </div>
      <div class="s-presets">
        {#each [50,60,70,80,90,100,110,125,150,175,200] as v}
          <button class="s-preset" class:active={Math.round((store.settings.uiZoom ?? 1.0) * 100) === v} onclick={() => updateSettings({ uiZoom: v / 100 })}>{v}%</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Server</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Server URL</span><span class="s-desc">Base URL of your Suwayomi instance</span></div>
        <input class="s-input" value={store.settings.serverUrl ?? "http://localhost:4567"} oninput={(e) => updateSettings({ serverUrl: e.currentTarget.value })} placeholder="http://localhost:4567" spellcheck="false" />
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-start server</span><span class="s-desc">Launch tachidesk-server when Moku opens</span></div>
        <button role="switch" aria-checked={store.settings.autoStartServer} aria-label="Auto-start server" class="s-toggle" class:on={store.settings.autoStartServer} onclick={() => updateSettings({ autoStartServer: !store.settings.autoStartServer })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Suwayomi Web UI</span><span class="s-desc">Enable the built-in Suwayomi web interface alongside Moku</span></div>
        <button role="switch" aria-checked={store.settings.suwayomiWebUI ?? false} aria-label="Suwayomi Web UI" class="s-toggle" class:on={store.settings.suwayomiWebUI ?? false} onclick={() => updateSettings({ suwayomiWebUI: !(store.settings.suwayomiWebUI ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Inactivity</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Idle screen timeout</span><span class="s-desc">Show the Moku idle splash after this much inactivity</span></div>
        <div class="s-select">
          <button bind:this={triggerIdleTimeout} class="s-select-btn" onclick={() => toggleSelect("idle-timeout")}>
            <span>{{ "0":"Never","1":"1 minute","2":"2 minutes","5":"5 minutes","10":"10 minutes","15":"15 minutes","30":"30 minutes" }[String(store.settings.idleTimeoutMin ?? 5)] ?? `${store.settings.idleTimeoutMin} min`}</span>
            <svg class="s-select-caret" class:open={selectOpen === "idle-timeout"} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === "idle-timeout" || closingSelect === "idle-timeout"}
            <div class="s-select-menu" class:anims class:closing={closingSelect === "idle-timeout"} {@attach selectPortal(triggerIdleTimeout)}>
              {#each [["0","Never"],["1","1 minute"],["2","2 minutes"],["5","5 minutes"],["10","10 minutes"],["15","15 minutes"],["30","30 minutes"]] as [v, l]}
                <button class="s-select-option" class:active={String(store.settings.idleTimeoutMin ?? 5) === v} onclick={() => { updateSettings({ idleTimeoutMin: Number(v) }); toggleSelect("idle-timeout"); }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Window</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Close button behavior</span><span class="s-desc">What happens when you click the X button</span></div>
        <div class="s-seg">
          {#each [["ask","Ask"],["tray","Tray"],["quit","Quit"]] as [v, l]}
            <button class="s-seg-btn" class:active={( store.settings.closeAction ?? "ask") === v} onclick={() => updateSettings({ closeAction: v as "ask" | "tray" | "quit" })}>{l}</button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Integrations</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Discord Rich Presence</span><span class="s-desc">Show what you're reading in your Discord status</span></div>
        <button role="switch" aria-checked={store.settings.discordRpc} aria-label="Discord Rich Presence" class="s-toggle" class:on={store.settings.discordRpc} onclick={() => updateSettings({ discordRpc: !store.settings.discordRpc })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Animations</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">QOL Animations</span><span class="s-desc">Hover lifts, active-tab transitions, and icon micro-animations</span></div>
        <button role="switch" aria-checked={store.settings.qolAnimations ?? true} aria-label="QOL Animations" class="s-toggle" class:on={store.settings.qolAnimations ?? true} onclick={() => updateSettings({ qolAnimations: !(store.settings.qolAnimations ?? true) })}><span class="s-toggle-thumb"></span></button>
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
        <input class="s-input" style="width:72px;text-align:center;text-transform:uppercase"
          value={store.settings.preferredExtensionLang ?? ""}
          oninput={(e) => updateSettings({ preferredExtensionLang: e.currentTarget.value.trim().toLowerCase() })}
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
</style>