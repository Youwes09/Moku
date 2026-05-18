<script lang="ts">
  import { X } from "phosphor-svelte";
  import { setPref }             from "@features/series/lib/mangaPrefs";
  import { store, DEFAULT_MANGA_PREFS } from "@store/state.svelte";
  import { resolvedCover }       from "@core/cover/coverResolver";
  import type { MangaPrefs }     from "@store/state.svelte";

  let { ids, onClose }: {
    ids:     Set<number>;
    onClose: () => void;
  } = $props();

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
    { value: "global", label: "Default" },
    { value: "daily",  label: "Daily"   },
    { value: "weekly", label: "Weekly"  },
    { value: "manual", label: "Manual"  },
  ];

  let draft: MangaPrefs = $state({ ...DEFAULT_MANGA_PREFS });

  const get = <K extends keyof MangaPrefs>(key: K): MangaPrefs[K] => draft[key];
  const set = <K extends keyof MangaPrefs>(key: K, value: MangaPrefs[K]) => { draft = { ...draft, [key]: value }; };

  const mosaicCovers = $derived.by(() => {
    const idArr = [...ids].slice(0, 9);
    return idArr
      .map(id => store.library?.find(m => m.id === id))
      .filter(Boolean)
      .map(m => resolvedCover(m!.id, m!.thumbnailUrl));
  });

  function apply() {
    for (const id of ids) {
      for (const key of Object.keys(draft) as (keyof MangaPrefs)[]) {
        setPref(id, key, draft[key] as any);
      }
    }
    onClose();
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<div class="backdrop" role="presentation" tabindex="-1" onmousedown={onBackdrop}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Bulk Automation">

    <div class="modal-header">
      <div class="header-inner">
        <div class="header-left">
          {#if mosaicCovers.length > 0}
            <div class="mosaic" aria-hidden="true">
              {#each mosaicCovers.slice(0, 5) as src}
                <img class="mosaic-tile" {src} alt="" />
              {/each}
              {#if ids.size > 5}
                <span class="mosaic-overflow">+{ids.size - 5}</span>
              {/if}
            </div>
          {/if}
          <div class="header-text">
            <span class="modal-title">Automation</span>
            <span class="modal-subtitle">{ids.size} series selected</span>
          </div>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Close"><X size={16} weight="light" /></button>
      </div>
    </div>

    <div class="modal-body">

      <p class="section-label">Downloads</p>

      <div class="auto-row">
        <div class="auto-info">
          <span class="auto-label">Auto-download new chapters</span>
          <span class="auto-desc">Queue new chapters when this series refreshes</span>
        </div>
        <button
          role="switch"
          aria-checked={get("autoDownload")}
          aria-label="Auto-download new chapters"
          class="auto-toggle"
          class:auto-toggle-on={get("autoDownload")}
          onclick={() => set("autoDownload", !get("autoDownload"))}
        ><span class="auto-toggle-thumb"></span></button>
      </div>

      <div class="auto-row">
        <div class="auto-info">
          <span class="auto-label">Download ahead</span>
          <span class="auto-desc">Pre-fetch chapters while reading</span>
        </div>
        <div class="auto-chip-group">
          {#each DOWNLOAD_AHEAD_OPTIONS as opt}
            <button
              class="auto-chip"
              class:auto-chip-on={get("downloadAhead") === opt.value}
              onclick={() => set("downloadAhead", opt.value)}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <div class="auto-row">
        <div class="auto-info">
          <span class="auto-label">Max chapters to keep</span>
          <span class="auto-desc">Delete oldest downloads when limit is exceeded</span>
        </div>
        <div class="auto-chip-group">
          {#each MAX_KEEP_OPTIONS as opt}
            <button
              class="auto-chip"
              class:auto-chip-on={get("maxKeepChapters") === opt.value}
              onclick={() => set("maxKeepChapters", opt.value)}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

      <div class="divider"></div>

      <p class="section-label">On Read</p>

      <div class="auto-row">
        <div class="auto-info">
          <span class="auto-label">Delete after reading</span>
          <span class="auto-desc">Remove download when chapter is marked read</span>
        </div>
        <button
          role="switch"
          aria-checked={get("deleteOnRead")}
          aria-label="Delete after reading"
          class="auto-toggle"
          class:auto-toggle-on={get("deleteOnRead")}
          onclick={() => set("deleteOnRead", !get("deleteOnRead"))}
        ><span class="auto-toggle-thumb"></span></button>
      </div>

      {#if get("deleteOnRead")}
        <div class="auto-row auto-row-sub">
          <span class="auto-label">Delete delay</span>
          <div class="auto-chip-group">
            {#each DELETE_DELAY_OPTIONS as opt}
              <button
                class="auto-chip"
                class:auto-chip-on={get("deleteDelayHours") === opt.value}
                onclick={() => set("deleteDelayHours", opt.value)}
              >{opt.label}</button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="divider"></div>

      <p class="section-label">Updates</p>

      <div class="auto-row">
        <div class="auto-info">
          <span class="auto-label">Pause updates</span>
          <span class="auto-desc">Skip this series during global refresh</span>
        </div>
        <button
          role="switch"
          aria-checked={get("pauseUpdates")}
          aria-label="Pause updates"
          class="auto-toggle"
          class:auto-toggle-on={get("pauseUpdates")}
          onclick={() => set("pauseUpdates", !get("pauseUpdates"))}
        ><span class="auto-toggle-thumb"></span></button>
      </div>

      <div class="auto-row">
        <div class="auto-info">
          <span class="auto-label">Refresh interval</span>
          <span class="auto-desc">How often to check for new chapters</span>
        </div>
        <div class="auto-chip-group">
          {#each REFRESH_INTERVAL_OPTIONS as opt}
            <button
              class="auto-chip"
              class:auto-chip-on={get("refreshInterval") === opt.value}
              onclick={() => set("refreshInterval", opt.value as MangaPrefs["refreshInterval"])}
            >{opt.label}</button>
          {/each}
        </div>
      </div>

    </div>

    <div class="modal-footer">
      <button class="apply-btn" onclick={apply}>Apply to {ids.size} series</button>
    </div>

  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.1s ease both;
  }

  .modal {
    width: 420px; max-width: calc(100vw - var(--sp-6));
    max-height: 80vh;
    display: flex; flex-direction: column;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-xl); overflow: hidden;
    box-shadow: 0 0 0 1px var(--border-dim), 0 24px 64px rgba(0,0,0,0.6);
    animation: scaleIn 0.15s ease both;
  }

  .modal-header { border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }

  .header-inner {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-4) var(--sp-5); gap: var(--sp-3);
  }

  .header-left { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }

  .mosaic {
    display: flex; align-items: center; flex-shrink: 0;
  }

  .mosaic-tile {
    width: 28px; height: 38px;
    object-fit: cover; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim);
    margin-left: -6px; box-shadow: -1px 0 0 var(--bg-surface);
  }
  .mosaic-tile:first-child { margin-left: 0; }

  .mosaic-overflow {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide);
    margin-left: var(--sp-1); flex-shrink: 0;
  }

  .header-text { display: flex; flex-direction: column; gap: 2px; }
  .modal-title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); }
  .modal-subtitle { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .close-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; transition: color var(--t-base), background var(--t-base); flex-shrink: 0; }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .modal-body {
    flex: 1; overflow-y: auto; scrollbar-width: none;
    display: flex; flex-direction: column; gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-5);
  }
  .modal-body::-webkit-scrollbar { display: none; }

  .modal-footer {
    padding: var(--sp-3) var(--sp-5); border-top: 1px solid var(--border-dim); flex-shrink: 0;
  }
  .apply-btn {
    width: 100%; padding: 8px; border-radius: var(--radius-md);
    border: 1px solid var(--accent-dim); background: var(--accent-muted);
    color: var(--accent-fg); font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide); cursor: pointer;
    transition: background var(--t-base), border-color var(--t-base);
  }
  .apply-btn:hover { background: var(--accent-dim); border-color: var(--accent); }

  .section-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest); color: var(--text-faint);
    text-transform: uppercase; margin: 0;
  }

  .divider { height: 1px; background: var(--border-dim); margin: var(--sp-1) 0; }

  .auto-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
  .auto-row-sub { padding-left: var(--sp-3); border-left: 2px solid var(--border-dim); }
  .auto-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .auto-label { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); }
  .auto-desc  { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: var(--leading-snug); }

  .auto-toggle { width: 28px; height: 16px; border-radius: var(--radius-full); border: 1px solid var(--border-strong); background: var(--bg-overlay); cursor: pointer; padding: 0; flex-shrink: 0; position: relative; transition: background var(--t-base), border-color var(--t-base); }
  .auto-toggle-on { background: var(--accent); border-color: var(--accent); }
  .auto-toggle-thumb { position: absolute; top: 1px; left: 1px; width: 12px; height: 12px; border-radius: 50%; background: var(--text-faint); transition: transform var(--t-base), background var(--t-base); }
  .auto-toggle-on .auto-toggle-thumb { transform: translateX(12px); background: var(--bg-base); }

  .auto-chip-group { display: flex; flex-direction: row; gap: 4px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .auto-chip { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 2px 7px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; white-space: nowrap; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .auto-chip:hover { color: var(--text-muted); border-color: var(--border-strong); background: var(--bg-raised); }
  .auto-chip-on { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  @keyframes fadeIn  { from { opacity: 0 }                         to { opacity: 1 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>