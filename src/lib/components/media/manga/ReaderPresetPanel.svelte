<script lang="ts">
  import {
    X, Check, Trash, PencilSimple,
    Square, Rows, BookOpen, MonitorPlay,
    ArrowsLeftRight, ArrowsIn, ArrowsOut, ArrowsVertical, ArrowsHorizontal,
  } from "phosphor-svelte";
  import type { ReaderSettings, ReaderPreset } from "$lib/state/mangaReader.svelte";
  import type { FitMode }                      from "$lib/types/settings";
  import { settingsState, updateSettings }     from "$lib/state/settings.svelte";
  import { readerState, PAGE_STYLES, ZOOM_MIN, ZOOM_MAX } from "$lib/state/mangaReader.svelte";
  import MediaSettingsPanel from "$lib/components/media/shared/MediaSettingsPanel.svelte";

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
  }

  const {
    fit, style, rtl, zoom, zoomPct,
    perMangaEnabled, onTogglePerManga,
    onSavePreset, onApplyPreset, onUpdatePreset, onDeletePreset,
    onApplySettings,
    onCaptureZoomAnchor, onRestoreZoomAnchor, onClampZoom,
    barPosition,
  }: Props = $props();

  const presets = $derived(settingsState.settings.readerPresets ?? []);
  const effectiveSettings = $derived.by(() => {
    const mangaId  = readerState.activeManga?.id;
    const override = mangaId != null ? (settingsState.settings.mangaReaderSettings ?? {})[mangaId] : undefined;
    return override ? { ...settingsState.settings, ...override } : settingsState.settings;
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
    { value: "width",    label: "Width",   icon: ArrowsLeftRight },
    { value: "height",   label: "Height",  icon: ArrowsVertical },
    { value: "screen",   label: "Screen",  icon: ArrowsIn },
    { value: "original", label: "1:1",     icon: ArrowsOut },
  ];

  const styleOptions: { value: string; label: string; icon: any }[] = [
    { value: "single",    label: "Single",  icon: Square },
    { value: "double",    label: "Double",  icon: BookOpen },
    { value: "fade",      label: "Fade",    icon: MonitorPlay },
    { value: "longstrip", label: "Strip",   icon: Rows },
  ];

  const autoScroll = $derived(settingsState.settings.autoScroll ?? false);
</script>

<MediaSettingsPanel
  title="Manga Settings"
  subtitle={readerState.activeManga?.title}
  {barPosition}
  onClose={close}
>
  <div class="msp-group">
    <p class="msp-label">Layout</p>
    <div class="msp-tiles">
      {#each styleOptions as o}
        {@const Icon = o.icon}
        <button class="msp-tile" class:on={style === o.value}
          onclick={() => onApplySettings({ pageStyle: o.value as typeof PAGE_STYLES[number] })}>
          <Icon size={17} weight={style === o.value ? "fill" : "light"} />
          <span class="msp-tile-label">{o.label}</span>
        </button>
      {/each}
    </div>

    {#if style === "double"}
      <div class="msp-row">
        <span>Offset spreads</span>
        <button class="msp-toggle" class:on={effectiveSettings.offsetDoubleSpreads}
          role="switch" aria-checked={effectiveSettings.offsetDoubleSpreads} aria-label="Offset double spreads"
          onclick={() => onApplySettings({ offsetDoubleSpreads: !effectiveSettings.offsetDoubleSpreads })}
        ><span class="msp-toggle-knob"></span></button>
      </div>
    {/if}
    {#if style === "longstrip"}
      <div class="msp-row">
        <span>Page gap</span>
        <button class="msp-toggle" class:on={effectiveSettings.pageGap ?? true}
          role="switch" aria-checked={effectiveSettings.pageGap ?? true} aria-label="Gap between pages"
          onclick={() => onApplySettings({ pageGap: !(effectiveSettings.pageGap ?? true) })}
        ><span class="msp-toggle-knob"></span></button>
      </div>
      <div class="msp-row">
        <span>Auto next chapter</span>
        <button class="msp-toggle" class:on={settingsState.settings.autoNextChapter ?? false}
          role="switch" aria-checked={settingsState.settings.autoNextChapter ?? false} aria-label="Auto next chapter"
          onclick={() => updateSettings({ autoNextChapter: !(settingsState.settings.autoNextChapter ?? false) })}
        ><span class="msp-toggle-knob"></span></button>
      </div>
      <div class="msp-row">
        <span>Auto scroll</span>
        <button class="msp-toggle" class:on={autoScroll}
          role="switch" aria-checked={autoScroll} aria-label="Auto scroll"
          onclick={() => updateSettings({ autoScroll: !autoScroll })}
        ><span class="msp-toggle-knob"></span></button>
      </div>
      {#if autoScroll}
        <div class="msp-row">
          <span>Scroll speed</span>
          <input class="msp-slider" type="range" min={1} max={30} step={1}
            value={settingsState.settings.autoScrollSpeed ?? 5}
            oninput={(e) => updateSettings({ autoScrollSpeed: Number(e.currentTarget.value) })} />
          <span class="msp-readout">{settingsState.settings.autoScrollSpeed ?? 5}</span>
        </div>
      {/if}
    {/if}
  </div>

  <div class="msp-group">
    <p class="msp-label">Fit</p>
    <div class="msp-tiles">
      {#each fitOptions as o}
        {@const Icon = o.icon}
        <button class="msp-tile" class:on={fit === o.value}
          onclick={() => onApplySettings({ fitMode: o.value })}>
          <Icon size={17} weight={fit === o.value ? "fill" : "light"} />
          <span class="msp-tile-label">{o.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">Direction</p>
    <div class="msp-seg">
      <button class="msp-seg-btn" class:on={!rtl} onclick={() => onApplySettings({ readingDirection: "ltr" })}>
        <ArrowsHorizontal size={13} weight="light" /> Left to right
      </button>
      <button class="msp-seg-btn" class:on={rtl} onclick={() => onApplySettings({ readingDirection: "rtl" })}>
        <ArrowsHorizontal size={13} weight="light" style="transform:scaleX(-1)" /> Right to left
      </button>
    </div>
  </div>

  <div class="msp-group">
    <div class="msp-row">
      <p class="msp-label">Zoom</p>
      <span class="msp-readout">{zoomPct}%</span>
    </div>
    <div class="msp-row">
      <div class="msp-stepper">
        <button aria-label="Zoom out" onclick={() => setZoom(zoom - 0.1)} disabled={zoom <= ZOOM_MIN}>−</button>
      </div>
      <input class="msp-slider" type="range"
        min={Math.round(ZOOM_MIN * 100)} max={Math.round(ZOOM_MAX * 100)} step={5}
        value={zoomPct} oninput={(e) => setZoom(Number(e.currentTarget.value) / 100)} />
      <div class="msp-stepper">
        <button aria-label="Zoom in" onclick={() => setZoom(zoom + 0.1)} disabled={zoom >= ZOOM_MAX}>+</button>
      </div>
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">Image</p>
    <div class="msp-row">
      <span>Optimize contrast</span>
      <button class="msp-toggle" class:on={effectiveSettings.optimizeContrast}
        role="switch" aria-checked={effectiveSettings.optimizeContrast} aria-label="Optimize contrast"
        onclick={() => onApplySettings({ optimizeContrast: !effectiveSettings.optimizeContrast })}
      ><span class="msp-toggle-knob"></span></button>
    </div>
    <div class="msp-row">
      <span>Pinch to zoom<span class="msp-badge">beta</span></span>
      <button class="msp-toggle" class:on={settingsState.settings.pinchZoom ?? false}
        role="switch" aria-checked={settingsState.settings.pinchZoom ?? false} aria-label="Pinch to zoom"
        onclick={() => updateSettings({ pinchZoom: !(settingsState.settings.pinchZoom ?? false) })}
      ><span class="msp-toggle-knob"></span></button>
    </div>
    <div class="msp-row">
      <span>Mark read on advance</span>
      <button class="msp-toggle" class:on={settingsState.settings.markReadOnNext ?? true}
        role="switch" aria-checked={settingsState.settings.markReadOnNext ?? true} aria-label="Mark read on chapter advance"
        onclick={() => updateSettings({ markReadOnNext: !(settingsState.settings.markReadOnNext ?? true) })}
      ><span class="msp-toggle-knob"></span></button>
    </div>
  </div>

  {#if readerState.activeManga}
    <div class="msp-group">
      <div class="msp-row">
        <span>Per-manga settings</span>
        <button class="msp-toggle" class:on={perMangaEnabled}
          role="switch" aria-checked={perMangaEnabled} aria-label="Per-manga settings"
          onclick={onTogglePerManga}
        ><span class="msp-toggle-knob"></span></button>
      </div>
    </div>
  {/if}

  <div class="msp-hr"></div>

  <div class="msp-group">
    <div class="msp-row">
      <p class="msp-label">Presets</p>
      {#if !presetSaving}
        <button class="rp-new" onclick={() => { presetSaving = true; presetNameInput = ""; }}>+ Save current</button>
      {/if}
    </div>

    {#if presetSaving}
      <div class="rp-name">
        <input class="rp-input" placeholder="Preset name…" bind:value={presetNameInput}
          onkeydown={(e) => { if (e.key === "Enter") commitSavePreset(); if (e.key === "Escape") presetSaving = false; }} />
        <button class="rp-icon" aria-label="Confirm" disabled={!presetNameInput.trim()} onclick={commitSavePreset}><Check size={12} weight="bold" /></button>
        <button class="rp-icon" aria-label="Cancel" onclick={() => (presetSaving = false)}><X size={12} weight="light" /></button>
      </div>
    {/if}

    {#if presets.length === 0 && !presetSaving}
      <p class="rp-empty">No presets yet — save the current settings to make one.</p>
    {:else}
      <div class="rp-list">
        {#each presets as p (p.id)}
          {#if presetEditId === p.id}
            <div class="rp-name">
              <input class="rp-input" bind:value={presetEditName}
                onkeydown={(e) => { if (e.key === "Enter") commitRenamePreset(); if (e.key === "Escape") presetEditId = null; }} />
              <button class="rp-icon" aria-label="Confirm" disabled={!presetEditName.trim()} onclick={commitRenamePreset}><Check size={12} weight="bold" /></button>
              <button class="rp-icon" aria-label="Cancel" onclick={() => (presetEditId = null)}><X size={12} weight="light" /></button>
            </div>
          {:else}
            <div class="rp-row">
              <button class="rp-apply" onclick={() => { onApplyPreset(p.settings); close(); }}>
                <span class="rp-name-txt">{p.name}</span>
                <span class="rp-desc">{describeSettings(p.settings)}</span>
              </button>
              <button class="rp-icon" title="Rename" onclick={() => { presetEditId = p.id; presetEditName = p.name; }}><PencilSimple size={12} weight="regular" /></button>
              <button class="rp-icon danger" title="Delete" onclick={() => onDeletePreset(p.id)}><Trash size={12} weight="regular" /></button>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</MediaSettingsPanel>

<style>
  .msp-seg-btn { display: flex; align-items: center; justify-content: center; gap: 5px; }

  .rp-new {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--accent-fg); letter-spacing: var(--tracking-wide);
    background: none; border: none; cursor: pointer;
    padding: 2px 6px; border-radius: var(--radius-sm);
    transition: background var(--t-fast);
  }
  .rp-new:hover { background: var(--accent-muted); }

  .rp-name { display: flex; align-items: center; gap: 4px; }
  .rp-input {
    flex: 1; min-width: 0;
    background: color-mix(in srgb, var(--bg-void) 45%, transparent);
    border: 1px solid var(--frost-border); border-radius: var(--radius-sm);
    padding: 5px 8px; font-family: inherit; font-size: var(--text-xs);
    color: var(--text-primary); outline: none;
    transition: border-color var(--t-base);
  }
  .rp-input:focus { border-color: var(--accent-dim); }

  .rp-list { display: flex; flex-direction: column; gap: 2px; }
  .rp-row { display: flex; align-items: center; gap: 2px; }
  .rp-apply {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
    padding: 6px var(--sp-2); border-radius: var(--radius-md);
    background: none; border: none; cursor: pointer; text-align: left;
    transition: background var(--t-fast);
  }
  .rp-apply:hover { background: color-mix(in srgb, #fff 6%, transparent); }
  .rp-name-txt {
    font-size: var(--text-xs); color: var(--text-secondary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 210px;
  }
  .rp-desc {
    font-family: var(--font-ui); font-size: 10px; color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 210px;
  }
  .rp-icon {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-faint); cursor: pointer; flex-shrink: 0;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .rp-icon:hover:not(:disabled) { color: var(--text-primary); background: color-mix(in srgb, #fff 8%, transparent); }
  .rp-icon:disabled { opacity: 0.3; cursor: default; }
  .rp-icon.danger:hover { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 12%, transparent); }

  .rp-empty {
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint);
    margin: 0; padding: var(--sp-1) 0; text-align: center;
  }
</style>
