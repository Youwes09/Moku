<script lang="ts">
  import { X, CircleNotch, CaretUpDown, Check, CaretLeft, CaretRight } from "phosphor-svelte";
  import Thumbnail from "$lib/components/shared/manga/Thumbnail.svelte";
  import { addToast } from "$lib/state/notifications.svelte";

  interface Preference {
    type: string;
    key: string;
    CheckBoxTitle?: string;
    CheckBoxSummary?: string;
    CheckBoxDefault?: boolean;
    CheckBoxCurrentValue?: boolean;
    SwitchPreferenceTitle?: string;
    SwitchPreferenceSummary?: string;
    SwitchPreferenceDefault?: boolean;
    SwitchPreferenceCurrentValue?: boolean;
    ListPreferenceTitle?: string;
    ListPreferenceSummary?: string;
    ListPreferenceDefault?: string;
    ListPreferenceCurrentValue?: string;
    entries?: string[];
    entryValues?: string[];
    EditTextPreferenceTitle?: string;
    EditTextPreferenceSummary?: string;
    EditTextPreferenceDefault?: string;
    EditTextPreferenceCurrentValue?: string;
    dialogTitle?: string;
    dialogMessage?: string;
    MultiSelectListPreferenceTitle?: string;
    MultiSelectListPreferenceSummary?: string;
    MultiSelectListPreferenceDefault?: string[];
    MultiSelectListPreferenceCurrentValue?: string[];
  }

  export type SourceEntry = { id: string; displayName: string };

  interface Props {
    extensionName: string;
    iconUrl:       string;
    sources:       SourceEntry[];
    onClose:       () => void;
  }

  let { extensionName, iconUrl, sources, onClose }: Props = $props();

  let activeIndex = $state(sources.length === 1 ? 0 : -1);
  let prefs        = $state<Preference[]>([]);
  let loading      = $state(false);
  let saving       = $state<string | null>(null);
  let editKey      = $state<string | null>(null);
  let editValue    = $state("");
  let listOpen     = $state<string | null>(null);
  let closing      = $state(false);

  const activeSource = $derived(activeIndex >= 0 ? sources[activeIndex] : null);
  const inPicker     = $derived(sources.length > 1 && activeIndex < 0);

  $effect(() => {
    if (activeSource) loadPrefs(activeSource);
  });

  async function loadPrefs(src: SourceEntry) {
    loading  = true;
    prefs    = [];
    editKey  = null;
    listOpen = null;
    loading  = false;
  }

  async function save(position: number, changeType: string, value: unknown) {
  }

  function getTitle(p: Preference) {
    return p.CheckBoxTitle ?? p.SwitchPreferenceTitle ?? p.ListPreferenceTitle
      ?? p.EditTextPreferenceTitle ?? p.MultiSelectListPreferenceTitle ?? p.key;
  }
  function getSummary(p: Preference) {
    return p.CheckBoxSummary ?? p.SwitchPreferenceSummary ?? p.ListPreferenceSummary
      ?? p.EditTextPreferenceSummary ?? p.MultiSelectListPreferenceSummary ?? null;
  }
  function getBoolValue(p: Preference) {
    return p.type === "CheckBoxPreference"
      ? (p.CheckBoxCurrentValue ?? p.CheckBoxDefault ?? false)
      : (p.SwitchPreferenceCurrentValue ?? p.SwitchPreferenceDefault ?? false);
  }
  function getListValue(p: Preference)  { return p.ListPreferenceCurrentValue ?? p.ListPreferenceDefault ?? ""; }
  function getListLabel(p: Preference, val: string) {
    const idx = p.entryValues?.indexOf(val) ?? -1;
    return idx >= 0 ? (p.entries?.[idx] ?? val) : val;
  }
  function getMultiValue(p: Preference): string[] {
    return p.MultiSelectListPreferenceCurrentValue ?? p.MultiSelectListPreferenceDefault ?? [];
  }
  function toggleMulti(pos: number, p: Preference, val: string) {
    const curr = getMultiValue(p);
    save(pos, "multiSelectState", curr.includes(val) ? curr.filter(v => v !== val) : [...curr, val]);
  }
  function openEdit(p: Preference) {
    editKey   = p.key;
    editValue = p.EditTextPreferenceCurrentValue ?? p.EditTextPreferenceDefault ?? "";
  }
  function submitEdit(pos: number) { save(pos, "editTextState", editValue); editKey = null; }

  function langTag(name: string) {
    const m = name.match(/\(([^)]+)\)$/);
    return m ? m[1].toUpperCase() : null;
  }
  function baseName(name: string) { return name.replace(/\s*\([^)]+\)$/, ""); }

  function prevSource() { if (activeIndex > 0) activeIndex--; }
  function nextSource() { if (activeIndex < sources.length - 1) activeIndex++; }

  function dismiss() {
    closing = true;
    setTimeout(onClose, 200);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (editKey)  { editKey = null; return; }
      if (listOpen) { listOpen = null; return; }
      if (sources.length > 1 && activeIndex >= 0) { activeIndex = -1; return; }
      dismiss();
    }
  }
  function onBackdrop(e: MouseEvent) { if (e.target === e.currentTarget) dismiss(); }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" class:backdrop-out={closing} role="dialog" aria-modal="true" onmousedown={onBackdrop}>
  <aside class="panel" class:panel-out={closing}>

    <div class="panel-header">
      <div class="ext-identity">
        {#if iconUrl}
          <Thumbnail src={iconUrl} alt={extensionName} class="ext-icon"
            onerror={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        {/if}
        <div class="ext-titles">
          <span class="ext-eyebrow">Extension Settings</span>
          <span class="ext-name">{extensionName}</span>
        </div>
      </div>
      <button class="close-btn" onclick={dismiss} aria-label="Close">
        <X size={13} weight="bold" />
      </button>
    </div>

    {#if sources.length > 1}
      <div class="source-bar">
        <button class="src-arrow" onclick={prevSource}
          disabled={activeIndex <= 0} aria-label="Previous source">
          <CaretLeft size={11} weight="bold" />
        </button>
        <div class="src-label">
          {#if activeIndex >= 0}
            <span class="src-name">{baseName(sources[activeIndex].displayName)}</span>
            {#if langTag(sources[activeIndex].displayName)}
              <span class="src-lang">{langTag(sources[activeIndex].displayName)}</span>
            {/if}
          {:else}
            <span class="src-name src-dim">Choose a source</span>
          {/if}
        </div>
        <button class="src-arrow" onclick={nextSource}
          disabled={activeIndex >= sources.length - 1} aria-label="Next source">
          <CaretRight size={11} weight="bold" />
        </button>
      </div>

      {#if inPicker}
        <div class="picker">
          {#each sources as src, i}
            {@const tag = langTag(src.displayName)}
            <button class="picker-row" onclick={() => activeIndex = i}>
              <span class="picker-name">{baseName(src.displayName)}</span>
              {#if tag}<span class="src-lang">{tag}</span>{/if}
              <CaretRight size={11} weight="bold" class="picker-caret" />
            </button>
          {/each}
        </div>
      {/if}
    {/if}

    {#if !inPicker}
      <div class="prefs-body">
        {#if loading}
          <div class="center-state">
            <CircleNotch size={15} weight="light" class="anim-spin" style="color:var(--text-faint)" />
          </div>
        {:else if prefs.length === 0}
          <div class="center-state dim">No configurable settings.</div>
        {:else}
          <ul class="pref-list">
            {#each prefs as pref, i}
              {@const title    = getTitle(pref)}
              {@const summary  = getSummary(pref)}
              {@const isSaving = saving === pref.key}

              {#if pref.type === "CheckBoxPreference" || pref.type === "SwitchPreference"}
                {@const checked = getBoolValue(pref)}
                <li class="pref-row">
                  <div class="pref-text">
                    <span class="pref-title">{title}</span>
                    {#if summary}<span class="pref-summary">{summary}</span>{/if}
                  </div>
                  <button
                    class="toggle" class:toggle-on={checked}
                    disabled={isSaving}
                    role="switch" aria-checked={checked}
                    onclick={() => save(i, pref.type === "CheckBoxPreference" ? "checkBoxState" : "switchState", !checked)}
                  >
                    {#if isSaving}
                      <CircleNotch size={9} weight="light" class="anim-spin" />
                    {:else}
                      <span class="toggle-thumb"></span>
                    {/if}
                  </button>
                </li>

              {:else if pref.type === "ListPreference"}
                {@const current = getListValue(pref)}
                <li class="pref-row pref-col">
                  <div class="pref-text">
                    <span class="pref-title">{title}</span>
                    {#if summary}<span class="pref-summary">{summary}</span>{/if}
                  </div>
                  <div class="select-wrap">
                    <button
                      class="select-btn" class:select-open={listOpen === pref.key}
                      disabled={isSaving}
                      onclick={() => listOpen = listOpen === pref.key ? null : pref.key}
                    >
                      <span class="select-val">{getListLabel(pref, current)}</span>
                      {#if isSaving}
                        <CircleNotch size={10} weight="light" class="anim-spin" />
                      {:else}
                        <CaretUpDown size={10} weight="bold" />
                      {/if}
                    </button>
                    {#if listOpen === pref.key}
                      <div class="dropdown">
                        {#each (pref.entries ?? []) as entry, j}
                          {@const val = pref.entryValues?.[j] ?? entry}
                          <button
                            class="dropdown-item" class:dropdown-item-active={val === current}
                            onclick={() => { save(i, "listState", val); listOpen = null; }}
                          >
                            {entry}
                            {#if val === current}<Check size={10} weight="bold" />{/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </li>

              {:else if pref.type === "EditTextPreference"}
                {#if editKey === pref.key}
                  <li class="pref-row pref-col edit-active">
                    <div class="pref-text">
                      {#if pref.dialogTitle}<span class="pref-title">{pref.dialogTitle}</span>{/if}
                      {#if pref.dialogMessage}<span class="pref-summary">{pref.dialogMessage}</span>{/if}
                    </div>
                    <div class="edit-row">
                      <input class="edit-input" bind:value={editValue} disabled={isSaving} autofocus
                        onkeydown={(e) => { if (e.key === "Enter") submitEdit(i); if (e.key === "Escape") editKey = null; }} />
                      <button class="action-dim" onclick={() => editKey = null}>Cancel</button>
                      <button class="action-btn" onclick={() => submitEdit(i)} disabled={isSaving}>
                        {#if isSaving}<CircleNotch size={10} weight="light" class="anim-spin" />{:else}Save{/if}
                      </button>
                    </div>
                  </li>
                {:else}
                  <li>
                    <button class="pref-row pref-row-btn" onclick={() => openEdit(pref)}>
                      <div class="pref-text">
                        <span class="pref-title">{title}</span>
                        {#if summary}<span class="pref-summary">{summary}</span>{/if}
                      </div>
                      <span class="pref-value-hint">
                        {pref.EditTextPreferenceCurrentValue ?? pref.EditTextPreferenceDefault ?? "—"}
                      </span>
                    </button>
                  </li>
                {/if}

              {:else if pref.type === "MultiSelectListPreference"}
                {@const selected = getMultiValue(pref)}
                <li class="pref-row pref-col">
                  <div class="pref-text">
                    <span class="pref-title">{title}</span>
                    {#if summary}<span class="pref-summary">{summary}</span>{/if}
                  </div>
                  <div class="multi-list">
                    {#each (pref.entries ?? []) as entry, j}
                      {@const val = pref.entryValues?.[j] ?? entry}
                      {@const on  = selected.includes(val)}
                      <button class="multi-item" class:multi-item-on={on}
                        disabled={isSaving} onclick={() => toggleMulti(i, pref, val)}>
                        <span class="multi-check">{#if on}<Check size={9} weight="bold" />{/if}</span>
                        {entry}
                      </button>
                    {/each}
                  </div>
                </li>
              {/if}

            {/each}
          </ul>
        {/if}
      </div>
    {/if}

  </aside>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.28);
    backdrop-filter: blur(2px);
    z-index: var(--z-modal);
    animation: fadeIn 0.15s ease both;
  }
  .backdrop-out { animation: fadeOut 0.2s ease forwards; pointer-events: none; }

  @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
  @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }

  .panel {
    position: absolute; inset-block: 0; right: 0;
    width: 320px; max-width: 100vw;
    display: flex; flex-direction: column;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-dim);
    box-shadow: -12px 0 40px rgba(0,0,0,0.35);
    animation: slideIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
    overflow: clip;
  }
  .panel-out { animation: slideOut 0.2s cubic-bezier(0.4,0,1,1) forwards; }

  @keyframes slideIn  { from { transform: translateX(100%) } to { transform: translateX(0) } }
  @keyframes slideOut { from { transform: translateX(0) }    to { transform: translateX(100%) } }

  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-4) var(--sp-3) var(--sp-4) var(--sp-5);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .ext-identity { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
  :global(.ext-icon) {
    width: 26px; height: 26px;
    border-radius: var(--radius-md); object-fit: cover;
    flex-shrink: 0; background: var(--bg-raised);
  }
  .ext-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .ext-eyebrow {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase;
  }
  .ext-name {
    font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; flex-shrink: 0;
    border-radius: var(--radius-md); color: var(--text-faint);
    transition: color var(--t-base), background var(--t-base);
  }
  .close-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }

  .source-bar {
    display: flex; align-items: center; gap: var(--sp-1);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border-dim);
    background: var(--bg-raised);
    flex-shrink: 0;
  }
  .src-arrow {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; flex-shrink: 0;
    border-radius: var(--radius-sm); color: var(--text-faint);
    transition: color var(--t-base), background var(--t-base);
  }
  .src-arrow:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-overlay); }
  .src-arrow:disabled { opacity: 0.3; cursor: default; }
  .src-label {
    flex: 1; display: flex; align-items: center; justify-content: center;
    gap: var(--sp-2); min-width: 0;
  }
  .src-name {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-secondary); font-weight: var(--weight-medium);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .src-dim { color: var(--text-faint); font-weight: normal; }
  .src-lang {
    font-family: var(--font-ui); font-size: 10px; letter-spacing: var(--tracking-wide);
    color: var(--text-faint); background: var(--bg-overlay);
    border: 1px solid var(--border-dim); border-radius: var(--radius-sm);
    padding: 1px 5px; flex-shrink: 0;
  }

  .picker { display: flex; flex-direction: column; padding: var(--sp-1) 0; flex: 1; overflow-y: auto; min-height: 0; }
  .picker-row {
    display: flex; align-items: center; gap: var(--sp-3);
    padding: 9px var(--sp-5); text-align: left;
    transition: background var(--t-fast);
  }
  .picker-row:hover { background: var(--bg-raised); }
  .picker-name {
    flex: 1; font-size: var(--text-sm); color: var(--text-secondary);
    font-weight: var(--weight-medium);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  :global(.picker-caret) { color: var(--text-faint); flex-shrink: 0; }

  .prefs-body { flex: 1; overflow-y: auto; }
  .center-state {
    display: flex; align-items: center; justify-content: center;
    padding: var(--sp-10);
  }
  .dim { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .pref-list { list-style: none; padding: var(--sp-1) 0; margin: 0; display: flex; flex-direction: column; }

  .pref-row {
    display: flex; align-items: center; gap: var(--sp-4);
    padding: 11px var(--sp-5);
    border-bottom: 1px solid var(--border-dim);
  }
  .pref-row:last-child { border-bottom: none; }
  .pref-col { flex-direction: column; align-items: stretch; gap: var(--sp-2); }
  .pref-row-btn {
    width: 100%; text-align: left;
    display: flex; align-items: center; gap: var(--sp-4);
    padding: 11px var(--sp-5);
    border-bottom: 1px solid var(--border-dim);
    transition: background var(--t-fast);
  }
  .pref-row-btn:hover { background: var(--bg-raised); }
  .edit-active { background: var(--bg-raised); }

  .pref-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .pref-title { font-size: var(--text-sm); color: var(--text-secondary); font-weight: var(--weight-medium); }
  .pref-summary {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: 1.5;
  }
  .pref-value-hint {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted);
    letter-spacing: var(--tracking-wide); flex-shrink: 0;
    max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .toggle {
    position: relative; width: 30px; height: 17px; border-radius: 9px;
    background: var(--bg-overlay); border: 1px solid var(--border-strong);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background var(--t-base), border-color var(--t-base);
  }
  .toggle-on { background: var(--accent-muted); border-color: var(--accent-dim); }
  .toggle-thumb {
    position: absolute; left: 2px; width: 11px; height: 11px;
    border-radius: 50%; background: var(--text-faint);
    transition: left var(--t-base), background var(--t-base); pointer-events: none;
  }
  .toggle-on .toggle-thumb { left: 15px; background: var(--accent-fg); }
  .toggle:disabled { opacity: 0.4; cursor: default; }

  .select-wrap { position: relative; }
  .select-btn {
    display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2);
    width: 100%; padding: 6px var(--sp-3);
    background: var(--bg-base); border: 1px solid var(--border-strong);
    border-radius: var(--radius-md); color: var(--text-secondary); font-size: var(--text-sm);
    transition: border-color var(--t-base);
  }
  .select-btn:hover:not(:disabled) { border-color: var(--border-focus); }
  .select-btn:disabled { opacity: 0.4; cursor: default; }
  .select-open { border-color: var(--border-focus); }
  .select-val { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: var(--bg-surface); border: 1px solid var(--border-strong);
    border-radius: var(--radius-md); overflow: hidden;
    box-shadow: var(--shadow-lg); z-index: 10;
    animation: dropIn 0.1s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes dropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .dropdown-item {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; padding: 7px var(--sp-3);
    font-size: var(--text-sm); color: var(--text-secondary);
    transition: background var(--t-fast);
  }
  .dropdown-item:hover { background: var(--bg-raised); }
  .dropdown-item-active { color: var(--accent-fg); }

  .edit-row { display: flex; gap: var(--sp-2); }
  .edit-input {
    flex: 1; background: var(--bg-base); border: 1px solid var(--border-strong);
    border-radius: var(--radius-md); padding: 6px var(--sp-3);
    color: var(--text-primary); font-size: var(--text-sm);
    outline: none; transition: border-color var(--t-base);
  }
  .edit-input:focus { border-color: var(--border-focus); }
  .action-btn {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 11px; border-radius: var(--radius-md);
    background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim);
    flex-shrink: 0; display: flex; align-items: center; gap: var(--sp-1);
    transition: filter var(--t-base);
  }
  .action-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
  .action-dim {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 11px; border-radius: var(--radius-md);
    background: none; color: var(--text-faint); border: 1px solid var(--border-dim);
    flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base);
  }
  .action-dim:hover { color: var(--text-secondary); border-color: var(--border-strong); }

  .multi-list { display: flex; flex-direction: column; gap: 1px; }
  .multi-item {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: 6px var(--sp-2); border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--text-muted); border: 1px solid transparent;
    transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
  }
  .multi-item:hover:not(:disabled) { background: var(--bg-raised); color: var(--text-secondary); }
  .multi-item-on { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .multi-check {
    width: 13px; height: 13px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--bg-base);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; color: var(--accent-fg);
    transition: background var(--t-fast), border-color var(--t-fast);
  }
  .multi-item-on .multi-check { background: var(--accent-muted); border-color: var(--accent-dim); }
</style>
