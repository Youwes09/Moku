<script lang="ts">
  import {
    X, Check, Trash, FloppyDisk,
    Square, Rows, BookOpen, MonitorPlay,
    ArrowsLeftRight, ArrowsIn, ArrowsOut, ArrowsVertical,
    ArrowsHorizontal,
    SidebarSimple,
  } from "phosphor-svelte";
  import type { ReaderSettings, ReaderPreset, FitMode } from "@store/state.svelte";
  import { store, updateSettings } from "@store/state.svelte";
  import { readerState, PAGE_STYLES, ZOOM_MIN, ZOOM_MAX } from "../store/readerState.svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  interface Props {
    fit:                  FitMode;
    style:                string;
    rtl:                  boolean;
    zoom:                 number;
    zoomPct:              number;
    perMangaEnabled:      boolean;
    onTogglePerManga:     () => void;
    onSavePreset:         (name: string) => void;
    onApplyPreset:        (settings: ReaderSettings) => void;
    onUpdatePreset:       (id: string, patch: Partial<Pick<ReaderPreset, "name" | "settings">>) => void;
    onDeletePreset:       (id: string) => void;
    onApplySettings:      (patch: Partial<ReaderSettings>) => void;
    onCaptureZoomAnchor:  () => void;
    onRestoreZoomAnchor:  () => void;
    onClampZoom:          (z: number) => number;
    barPosition:          "top" | "left" | "right";
    onBarPositionChange:  (pos: "top" | "left" | "right") => void;
  }

  const {
    fit, style, rtl, zoom, zoomPct,
    perMangaEnabled, onTogglePerManga,
    onSavePreset, onApplyPreset, onUpdatePreset, onDeletePreset,
    onApplySettings,
    onCaptureZoomAnchor, onRestoreZoomAnchor, onClampZoom,
    barPosition, onBarPositionChange,
  }: Props = $props();

  const presets = $derived(store.settings.readerPresets ?? []);
  const effectiveSettings = $derived.by(() => {
    const mangaId  = store.activeManga?.id;
    const override = mangaId != null ? (store.settings.mangaReaderSettings ?? {})[mangaId] : undefined;
    return override ? { ...store.settings, ...override } : store.settings;
  });

  let presetSaving    = $state(false);
  let presetNameInput = $state("");
  let presetEditId    = $state<string | null>(null);
  let presetEditName  = $state("");

  function close() {
    readerState.presetOpen = false;
    presetSaving    = false;
    presetNameInput = "";
    presetEditId    = null;
  }

  function commitSavePreset() {
    if (!presetNameInput.trim()) return;
    onSavePreset(presetNameInput.trim());
    presetSaving    = false;
    presetNameInput = "";
  }

  function commitRenamePreset() {
    if (!presetEditId || !presetEditName.trim()) return;
    onUpdatePreset(presetEditId, { name: presetEditName.trim() });
    presetEditId   = null;
    presetEditName = "";
  }

  function describeSettings(s: ReaderSettings): string {
    const parts = [s.pageStyle ?? "single", s.fitMode ?? "width", (s.readingDirection ?? "ltr") === "rtl" ? "RTL" : "LTR"];
    if ((s.readerZoom ?? 1) !== 1.0) parts.push(`${Math.round((s.readerZoom ?? 1) * 100)}%`);
    if (!s.pageGap) parts.push("no gap");
    return parts.join(" · ");
  }

  function setZoom(v: number) {
    onCaptureZoomAnchor();
    onApplySettings({ readerZoom: onClampZoom(v) });
    onRestoreZoomAnchor();
  }

  const fitOptions: { value: FitMode; label: string; icon: any }[] = [
    { value: "width",    label: "Fit Width",   icon: ArrowsLeftRight },
    { value: "height",   label: "Fit Height",  icon: ArrowsVertical },
    { value: "screen",   label: "Fit Screen",  icon: ArrowsIn },
    { value: "original", label: "Original",    icon: ArrowsOut },
  ];

  const styleOptions: { value: string; label: string; icon: any }[] = [
    { value: "single",    label: "Single",     icon: Square },
    { value: "double",    label: "Double",     icon: BookOpen },
    { value: "fade",      label: "Fade",       icon: MonitorPlay },
    { value: "longstrip", label: "Long Strip", icon: Rows },
  ];

  const barOptions: { value: "top" | "left" | "right"; label: string }[] = [
    { value: "left",  label: "Left" },
    { value: "top",   label: "Top" },
    { value: "right", label: "Right" },
  ];
</script>

<div class="backdrop" role="button" tabindex="-1" aria-label="Close settings" onclick={close} onkeydown={(e) => e.key === 'Escape' && close()} transition:fade={{ duration: 150 }}></div>

<div
  class="panel"
  role="dialog"
  aria-label="Reader settings & presets"
  transition:fly={{ x: 320, duration: 220, easing: cubicOut }}
>
  <div class="panel-header">
    <span class="panel-title">Reader Settings</span>
    {#if store.activeManga}
      <span class="panel-manga">{store.activeManga.title}</span>
    {/if}
    <button class="close-btn" onclick={close}><X size={14} weight="light" /></button>
  </div>

  <div class="panel-body">

    <section class="section">
      <p class="section-label">Page Style</p>
      <div class="option-grid">
        {#each styleOptions as o}
          {@const Icon = o.icon}
          <button
            class="option-tile"
            class:active={style === o.value}
            onclick={() => onApplySettings({ pageStyle: o.value as typeof PAGE_STYLES[number] })}
          >
            <div class="tile-icon"><Icon size={18} weight={style === o.value ? "fill" : "light"} /></div>
            <span class="tile-label">{o.label}</span>
          </button>
        {/each}
      </div>

      {#if style === "double"}
        <label class="toggle-row">
          <span class="toggle-label">Offset double spreads</span>
          <button
            class="toggle"
            class:on={effectiveSettings.offsetDoubleSpreads}
            onclick={() => onApplySettings({ offsetDoubleSpreads: !effectiveSettings.offsetDoubleSpreads })}
            role="switch"
            aria-label="Offset double spreads"
            aria-checked={effectiveSettings.offsetDoubleSpreads}
          ><span class="toggle-knob"></span></button>
        </label>
      {/if}
      {#if style === "longstrip"}
        <label class="toggle-row">
          <span class="toggle-label">Gap between pages</span>
          <button
            class="toggle"
            class:on={effectiveSettings.pageGap ?? true}
            onclick={() => onApplySettings({ pageGap: !(effectiveSettings.pageGap ?? true) })}
            role="switch"
            aria-label="Gap between pages"
            aria-checked={effectiveSettings.pageGap ?? true}
          ><span class="toggle-knob"></span></button>
        </label>
        <label class="toggle-row">
          <span class="toggle-label">Auto next chapter</span>
          <button
            class="toggle"
            class:on={store.settings.autoNextChapter ?? false}
            onclick={() => updateSettings({ autoNextChapter: !(store.settings.autoNextChapter ?? false) })}
            role="switch"
            aria-label="Auto next chapter"
            aria-checked={store.settings.autoNextChapter ?? false}
          ><span class="toggle-knob"></span></button>
        </label>
        <label class="toggle-row">
          <span class="toggle-label">Auto scroll</span>
          <button
            class="toggle"
            class:on={store.settings.autoScroll ?? false}
            onclick={() => updateSettings({ autoScroll: !(store.settings.autoScroll ?? false) })}
            role="switch"
            aria-label="Auto scroll"
            aria-checked={store.settings.autoScroll ?? false}
          ><span class="toggle-knob"></span></button>
        </label>
        {#if store.settings.autoScroll}
          <div class="speed-row">
            <span class="speed-label">Speed</span>
            <input
              type="range"
              class="zoom-slider"
              min={1}
              max={30}
              step={1}
              value={store.settings.autoScrollSpeed ?? 5}
              oninput={(e) => updateSettings({ autoScrollSpeed: Number(e.currentTarget.value) })}
            />
            <span class="speed-val">{store.settings.autoScrollSpeed ?? 5}</span>
          </div>
        {/if}
      {/if}
    </section>

    <section class="section">
      <p class="section-label">Fit Mode</p>
      <div class="option-grid">
        {#each fitOptions as o}
          {@const Icon = o.icon}
          <button
            class="option-tile"
            class:active={fit === o.value}
            onclick={() => onApplySettings({ fitMode: o.value })}
          >
            <div class="tile-icon"><Icon size={18} weight={fit === o.value ? "fill" : "light"} /></div>
            <span class="tile-label">{o.label}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <p class="section-label">Reading Direction</p>
      <div class="dir-row">
        <button
          class="dir-btn"
          class:active={!rtl}
          onclick={() => onApplySettings({ readingDirection: "ltr" })}
        >
          <ArrowsHorizontal size={14} weight="light" />
          <span>Left to Right</span>
        </button>
        <button
          class="dir-btn"
          class:active={rtl}
          onclick={() => onApplySettings({ readingDirection: "rtl" })}
        >
          <ArrowsHorizontal size={14} weight="light" style="transform:scaleX(-1)" />
          <span>Right to Left</span>
        </button>
      </div>
    </section>

    <section class="section">
      <p class="section-label">Bar Position</p>
      <div class="bar-grid">
        {#each barOptions as o}
          <button
            class="bar-tile"
            class:active={barPosition === o.value}
            onclick={() => onBarPositionChange(o.value)}
          >
            <div class="bar-tile-preview bar-preview-{o.value}">
              <div class="bar-preview-strip"></div>
              <div class="bar-preview-content"></div>
            </div>
            <span class="tile-label">{o.label}</span>
          </button>
        {/each}
      </div>
    </section>

    <section class="section">
      <div class="section-header-row">
        <p class="section-label" style="margin:0">Zoom</p>
        <span class="zoom-readout">{zoomPct}%</span>
      </div>
      <div class="zoom-row">
        <button class="zoom-step" aria-label="Zoom out" onclick={() => setZoom(zoom - 0.1)} disabled={zoom <= ZOOM_MIN}>−</button>
        <input
          type="range"
          class="zoom-slider"
          min={Math.round(ZOOM_MIN * 100)}
          max={Math.round(ZOOM_MAX * 100)}
          step={5}
          value={zoomPct}
          oninput={(e) => setZoom(Number(e.currentTarget.value) / 100)}
        />
        <button class="zoom-step" aria-label="Zoom in" onclick={() => setZoom(zoom + 0.1)} disabled={zoom >= ZOOM_MAX}>+</button>
      </div>
    </section>

    <section class="section">
      <p class="section-label">Image</p>
      <label class="toggle-row">
        <span class="toggle-label">Optimize contrast</span>
        <button
          class="toggle"
          class:on={effectiveSettings.optimizeContrast}
          onclick={() => onApplySettings({ optimizeContrast: !effectiveSettings.optimizeContrast })}
          role="switch"
          aria-label="Optimize contrast"
          aria-checked={effectiveSettings.optimizeContrast}
        ><span class="toggle-knob"></span></button>
      </label>
      <label class="toggle-row">
        <span class="toggle-label">Pinch to zoom <span class="toggle-badge">experimental</span></span>
        <button
          class="toggle"
          class:on={store.settings.pinchZoom ?? false}
          onclick={() => updateSettings({ pinchZoom: !(store.settings.pinchZoom ?? false) })}
          role="switch"
          aria-label="Pinch to zoom"
          aria-checked={store.settings.pinchZoom ?? false}
        ><span class="toggle-knob"></span></button>
      </label>
      <label class="toggle-row">
        <span class="toggle-label">Mark read on chapter advance</span>
        <button
          class="toggle"
          class:on={store.settings.markReadOnNext ?? true}
          onclick={() => updateSettings({ markReadOnNext: !(store.settings.markReadOnNext ?? true) })}
          role="switch"
          aria-label="Mark read on chapter advance"
          aria-checked={store.settings.markReadOnNext ?? true}
        ><span class="toggle-knob"></span></button>
      </label>
    </section>

    {#if store.activeManga}
      <section class="section">
        <label class="toggle-row">
          <span class="toggle-label">Per-manga settings</span>
          <button
            class="toggle"
            class:on={perMangaEnabled}
            onclick={onTogglePerManga}
            role="switch"
            aria-label="Per-manga settings"
            aria-checked={perMangaEnabled}
          ><span class="toggle-knob"></span></button>
        </label>
      </section>
    {/if}

    <section class="section">
      <div class="section-header-row">
        <p class="section-label" style="margin:0">Saved Presets</p>
        {#if !presetSaving}
          <button class="new-preset-btn" onclick={() => { presetSaving = true; presetNameInput = ""; }}>+ New</button>
        {/if}
      </div>

      {#if presetSaving}
        <div class="preset-name-row">
          <input
            class="preset-name-input"
            placeholder="Preset name…"
            bind:value={presetNameInput}
            onkeydown={(e) => { if (e.key === "Enter") commitSavePreset(); if (e.key === "Escape") presetSaving = false; }}
          />
          <button class="small-btn" aria-label="Confirm" disabled={!presetNameInput.trim()} onclick={commitSavePreset}><Check size={12} weight="bold" /></button>
          <button class="small-btn" aria-label="Cancel" onclick={() => presetSaving = false}><X size={12} weight="light" /></button>
        </div>
      {/if}

      {#if presets.length === 0 && !presetSaving}
        <p class="empty-hint">No presets saved yet. Save the current settings to create one.</p>
      {:else}
        <div class="preset-list">
          {#each presets as p (p.id)}
            {#if presetEditId === p.id}
              <div class="preset-name-row">
                <input
                  class="preset-name-input"
                  bind:value={presetEditName}
                  onkeydown={(e) => { if (e.key === "Enter") commitRenamePreset(); if (e.key === "Escape") presetEditId = null; }}
                />
                <button class="small-btn" aria-label="Confirm" disabled={!presetEditName.trim()} onclick={commitRenamePreset}><Check size={12} weight="bold" /></button>
                <button class="small-btn" aria-label="Cancel" onclick={() => presetEditId = null}><X size={12} weight="light" /></button>
              </div>
            {:else}
              <div class="preset-row">
                <button class="preset-apply" onclick={() => { onApplyPreset(p.settings); close(); }}>
                  <span class="preset-name">{p.name}</span>
                  <span class="preset-desc">{describeSettings(p.settings)}</span>
                </button>
                <button class="small-btn" title="Rename" onclick={() => { presetEditId = p.id; presetEditName = p.name; }}>
                  <FloppyDisk size={12} weight="regular" />
                </button>
                <button class="small-btn danger" title="Delete" onclick={() => onDeletePreset(p.id)}>
                  <Trash size={12} weight="regular" />
                </button>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </section>

  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-reader) + 20);
    background: rgba(0, 0, 0, 0.35);
  }

  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 320px;
    z-index: calc(var(--z-reader) + 21);
    background: var(--bg-surface);
    border-left: 1px solid var(--border-base);
    display: flex;
    flex-direction: column;
    box-shadow: -12px 0 40px rgba(0, 0, 0, 0.5);
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-4);
    height: 48px;
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }

  .panel-title {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-primary);
    letter-spacing: var(--tracking-tight);
  }

  .panel-manga {
    flex: 1;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    flex-shrink: 0;
    transition: color var(--t-base), background var(--t-base);
  }
  .close-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-3) var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    scrollbar-width: thin;
    scrollbar-color: var(--border-dim) transparent;
  }

  .section { display: flex; flex-direction: column; gap: var(--sp-2); }

  .section-label {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    margin: 0 0 var(--sp-1);
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--sp-1);
  }

  .option-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--sp-1);
  }

  .option-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: var(--sp-2) var(--sp-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
    color: var(--text-muted);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast);
  }
  .option-tile:hover { color: var(--text-primary); background: var(--bg-raised); border-color: var(--border-strong); }
  .option-tile.active { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }

  .tile-icon { display: flex; align-items: center; justify-content: center; }
  .tile-label { font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide); text-transform: capitalize; line-height: 1; }

  .bar-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-1);
  }

  .bar-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: var(--sp-2) var(--sp-1);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
    color: var(--text-muted);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast);
  }
  .bar-tile:hover { color: var(--text-primary); background: var(--bg-raised); border-color: var(--border-strong); }
  .bar-tile.active { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }

  .bar-tile-preview {
    width: 32px;
    height: 22px;
    border-radius: 3px;
    border: 1px solid currentColor;
    position: relative;
    overflow: hidden;
    opacity: 0.7;
    display: flex;
  }
  .bar-tile.active .bar-tile-preview { opacity: 1; }

  .bar-preview-strip {
    background: currentColor;
    opacity: 0.5;
    flex-shrink: 0;
  }
  .bar-preview-content {
    flex: 1;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .bar-preview-top    { flex-direction: column; }
  .bar-preview-left   { flex-direction: row; }
  .bar-preview-right  { flex-direction: row-reverse; }

  .bar-preview-top .bar-preview-strip    { height: 5px; width: 100%; }
  .bar-preview-left .bar-preview-strip   { width: 5px; height: 100%; }
  .bar-preview-right .bar-preview-strip  { width: 5px; height: 100%; }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-1) 0;
  }

  .toggle-label {
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .toggle-badge {
    font-family: var(--font-ui);
    font-size: 9px;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--text-faint);
    border: 1px solid var(--border-dim);
    border-radius: 3px;
    padding: 1px 4px;
    margin-left: var(--sp-1);
    vertical-align: middle;
  }

  .toggle {
    position: relative;
    width: 32px;
    height: 18px;
    border-radius: 9px;
    background: var(--border-strong);
    border: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--t-base);
  }
  .toggle.on { background: var(--accent-fg); }
  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: left var(--t-base);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
  .toggle.on .toggle-knob { left: 16px; }

  .dir-row { display: flex; gap: var(--sp-2); }

  .dir-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast);
  }
  .dir-btn:hover { color: var(--text-primary); background: var(--bg-raised); border-color: var(--border-strong); }
  .dir-btn.active { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }

  .zoom-readout {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    letter-spacing: var(--tracking-wide);
  }

  .zoom-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .zoom-step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
    color: var(--text-muted);
    font-size: var(--text-base);
    line-height: 1;
    flex-shrink: 0;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .zoom-step:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .zoom-step:disabled { opacity: 0.25; cursor: default; }

  .zoom-slider {
    flex: 1;
    height: 3px;
    appearance: none;
    -webkit-appearance: none;
    background: var(--border-strong);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  .zoom-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent-fg);
    cursor: pointer;
    box-shadow: 0 0 0 2px rgba(0,0,0,0.3);
  }

  .new-preset-btn {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--accent-fg);
    letter-spacing: var(--tracking-wide);
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px var(--sp-1);
    border-radius: var(--radius-sm);
    transition: background var(--t-fast);
  }
  .new-preset-btn:hover { background: var(--accent-muted); }

  .preset-name-row { display: flex; align-items: center; gap: var(--sp-1); }

  .preset-name-input {
    flex: 1;
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 5px 8px;
    font-size: var(--text-xs);
    color: var(--text-primary);
    outline: none;
    font-family: inherit;
    transition: border-color var(--t-base);
  }
  .preset-name-input:focus { border-color: var(--accent-dim); }

  .preset-list { display: flex; flex-direction: column; gap: 2px; }

  .preset-row { display: flex; align-items: center; gap: var(--sp-1); }

  .preset-apply {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 7px var(--sp-2);
    border-radius: var(--radius-md);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background var(--t-fast);
    min-width: 0;
  }
  .preset-apply:hover { background: var(--bg-overlay); }

  .preset-name {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .preset-desc {
    font-family: var(--font-ui);
    font-size: 10px;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .small-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    color: var(--text-faint);
    cursor: pointer;
    flex-shrink: 0;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .small-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-overlay); }
  .small-btn:disabled { opacity: 0.25; cursor: default; }
  .small-btn.danger:hover { color: var(--color-error); background: var(--color-error-bg); }

  .empty-hint {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-faint);
    margin: 0;
    padding: var(--sp-2) 0;
    text-align: center;
  }

  .speed-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) 0;
  }

  .speed-label {
    font-size: var(--text-xs);
    color: var(--text-faint);
    flex-shrink: 0;
    min-width: 40px;
  }

  .speed-val {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    letter-spacing: var(--tracking-wide);
    min-width: 1.5ch;
    text-align: right;
    flex-shrink: 0;
  }
</style>