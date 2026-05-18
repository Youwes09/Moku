<script lang="ts">
  import { ArrowCounterClockwise, LockSimple, Warning } from "phosphor-svelte";
  import { store, updateSettings, DEFAULT_MANGA_PREFS } from "@store/state.svelte";
  import type { MangaPrefs } from "@store/state.svelte";

  const DOWNLOAD_AHEAD_OPTIONS = [
    { value: 0,  label: "Off" },
    { value: 2,  label: "2"   },
    { value: 5,  label: "5"   },
    { value: 10, label: "10"  },
  ];

  const MAX_KEEP_OPTIONS = [
    { value: 0,  label: "Off" },
    { value: 5,  label: "5"   },
    { value: 10, label: "10"  },
    { value: 25, label: "25"  },
  ];

  const DELETE_DELAY_OPTIONS = [
    { value: 0,   label: "Now"    },
    { value: 24,  label: "1 day"  },
    { value: 168, label: "1 week" },
  ];

  const REFRESH_INTERVAL_OPTIONS = [
    { value: "daily",  label: "Daily"  },
    { value: "weekly", label: "Weekly" },
    { value: "manual", label: "Manual" },
  ];

  type GlobalDefaults = Omit<MangaPrefs, "refreshInterval"> & {
    refreshInterval: "daily" | "weekly" | "manual";
  };

  const fallback: GlobalDefaults = {
    autoDownload:     false,
    downloadAhead:    0,
    maxKeepChapters:  0,
    deleteOnRead:     false,
    deleteDelayHours: 0,
    pauseUpdates:     false,
    refreshInterval:  "weekly",
  };

  function getGlobal<K extends keyof GlobalDefaults>(key: K): GlobalDefaults[K] {
    return (store.settings.automationDefaults as GlobalDefaults | undefined)?.[key] ?? fallback[key];
  }

  function setGlobal<K extends keyof GlobalDefaults>(key: K, value: GlobalDefaults[K]) {
    updateSettings({
      automationDefaults: {
        ...(store.settings.automationDefaults ?? fallback),
        [key]: value,
      },
    });
  }

  const enforceGlobal = $derived(store.settings.automationEnforceGlobal ?? false);

  function toggleEnforce() {
    updateSettings({ automationEnforceGlobal: !enforceGlobal });
  }

  const customCount = $derived(
    Object.keys(store.mangaPrefs ?? {}).filter((id) => {
      const prefs = (store.mangaPrefs as Record<string, Partial<MangaPrefs>>)[id];
      return prefs && Object.keys(prefs).length > 0;
    }).length
  );

  let confirmReset = $state(false);

  function resetAllCustoms() {
    if (!confirmReset) { confirmReset = true; return; }
    const ids = Object.keys(store.mangaPrefs ?? {});
    const blank = { ...DEFAULT_MANGA_PREFS };
    for (const id of ids) {
      for (const key of Object.keys(blank) as (keyof MangaPrefs)[]) {
        // setPref(Number(id), key, blank[key] as any)
      }
    }
    updateSettings({ _resetMangaPrefs: Date.now() } as any);
    confirmReset = false;
  }

  function cancelReset() { confirmReset = false; }
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Behaviour</p>
    <div class="s-section-body">

      <label class="s-row">
        <div class="s-row-info">
          <span class="s-label">Enable automation</span>
          <span class="s-desc">Allow per-series and global automation rules to run</span>
        </div>
        <button
          role="switch"
          aria-checked={store.settings.automationEnabled ?? false}
          aria-label="Enable automation"
          class="s-toggle"
          class:on={store.settings.automationEnabled ?? false}
          onclick={() => updateSettings({ automationEnabled: !(store.settings.automationEnabled ?? false) })}
        ><span class="s-toggle-thumb"></span></button>
      </label>

      <label class="s-row">
        <div class="s-row-info">
          <span class="s-label">Enforce global defaults</span>
          <span class="s-desc">Ignore per-series overrides — all series use the global settings below</span>
        </div>
        <button
          role="switch"
          aria-checked={enforceGlobal}
          aria-label="Enforce global defaults"
          class="s-toggle"
          class:on={enforceGlobal}
          onclick={toggleEnforce}
        ><span class="s-toggle-thumb"></span></button>
      </label>

      {#if enforceGlobal}
        <div class="s-banner s-banner-info enforce-banner">
          <LockSimple size={12} weight="fill" />
          <span>Per-series overrides are paused. Disable enforce to allow custom rules.</span>
        </div>
      {/if}

    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Global Defaults</p>
    <div class="s-section-body">

      <p class="sub-head">Downloads</p>

      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Auto-download new chapters</span>
          <span class="s-desc">Queue new chapters when a series refreshes</span>
        </div>
        <button
          role="switch"
          aria-checked={getGlobal("autoDownload")}
          aria-label="Auto-download new chapters"
          class="s-toggle"
          class:on={getGlobal("autoDownload")}
          onclick={() => setGlobal("autoDownload", !getGlobal("autoDownload"))}
        ><span class="s-toggle-thumb"></span></button>
      </div>

      <div class="s-row chip-row">
        <div class="s-row-info">
          <span class="s-label">Download ahead</span>
          <span class="s-desc">Pre-fetch chapters while reading</span>
        </div>
        <div class="chip-group">
          {#each DOWNLOAD_AHEAD_OPTIONS as opt}
            <button
              class="s-preset"
              class:active={getGlobal("downloadAhead") === opt.value}
              onclick={() => setGlobal("downloadAhead", opt.value)}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <div class="s-row chip-row">
        <div class="s-row-info">
          <span class="s-label">Max chapters to keep</span>
          <span class="s-desc">Delete oldest downloads when limit is exceeded</span>
        </div>
        <div class="chip-group">
          {#each MAX_KEEP_OPTIONS as opt}
            <button
              class="s-preset"
              class:active={getGlobal("maxKeepChapters") === opt.value}
              onclick={() => setGlobal("maxKeepChapters", opt.value)}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <p class="sub-head sub-head-rule">On Read</p>

      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Delete after reading</span>
          <span class="s-desc">Remove download when a chapter is marked read</span>
        </div>
        <button
          role="switch"
          aria-checked={getGlobal("deleteOnRead")}
          aria-label="Delete after reading"
          class="s-toggle"
          class:on={getGlobal("deleteOnRead")}
          onclick={() => setGlobal("deleteOnRead", !getGlobal("deleteOnRead"))}
        ><span class="s-toggle-thumb"></span></button>
      </div>

      {#if getGlobal("deleteOnRead")}
        <div class="s-row chip-row sub-row">
          <span class="s-label">Delete delay</span>
          <div class="chip-group">
            {#each DELETE_DELAY_OPTIONS as opt}
              <button
                class="s-preset"
                class:active={getGlobal("deleteDelayHours") === opt.value}
                onclick={() => setGlobal("deleteDelayHours", opt.value)}
              >{opt.label}</button>
            {/each}
          </div>
        </div>
      {/if}

      <p class="sub-head sub-head-rule">Updates</p>

      <div class="s-row chip-row">
        <div class="s-row-info">
          <span class="s-label">Default refresh interval</span>
          <span class="s-desc">How often series check for new chapters by default</span>
        </div>
        <div class="chip-group">
          {#each REFRESH_INTERVAL_OPTIONS as opt}
            <button
              class="s-preset"
              class:active={getGlobal("refreshInterval") === opt.value}
              onclick={() => setGlobal("refreshInterval", opt.value as GlobalDefaults["refreshInterval"])}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Custom Overrides</p>
    <div class="s-section-body">

      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Series with custom rules</span>
          <span class="s-desc">Per-series settings set via the series automation panel</span>
        </div>
        <span class="s-pill" class:on={customCount > 0}>{customCount}</span>
      </div>

      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Reset all custom rules</span>
          <span class="s-desc">Revert every series to the global defaults above</span>
        </div>
        {#if confirmReset}
          <div class="s-btn-row">
            <button class="s-btn s-btn-danger" onclick={resetAllCustoms}>
              <Warning size={11} weight="fill" /> Confirm reset
            </button>
            <button class="s-btn" onclick={cancelReset}>Cancel</button>
          </div>
        {:else}
          <button class="s-btn" disabled={customCount === 0} onclick={resetAllCustoms}>
            <ArrowCounterClockwise size={11} weight="regular" /> Reset
          </button>
        {/if}
      </div>

    </div>
  </div>

</div>

<style>
  .enforce-banner {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .sub-head {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 0;
    padding: var(--sp-2) var(--sp-4) 0;
  }

  .sub-head-rule {
    border-top: 1px solid var(--border-dim);
    padding-top: var(--sp-3);
    margin-top: var(--sp-1);
  }

  .chip-row {
    align-items: flex-start;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .chip-group {
    display: flex;
    flex-direction: row;
    gap: 4px;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .sub-row {
    padding-left: calc(var(--sp-4) + var(--sp-2));
    border-left: 2px solid var(--border-dim);
  }
</style>