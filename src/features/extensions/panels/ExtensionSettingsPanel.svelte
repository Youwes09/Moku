<script lang="ts">
  import { X, CircleNotch, CaretUpDown, Check, CaretLeft } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import { gql } from "@api/client";
  import { addToast } from "@store/state.svelte";
  import { GET_SOURCE_SETTINGS } from "@api/queries";
  import { UPDATE_SOURCE_PREFERENCE } from "@api/mutations";

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
    sources: SourceEntry[];
    onClose: () => void;
  }

  let { extensionName, iconUrl, sources, onClose }: Props = $props();

  let phase        = $state<"pick" | "settings">("pick");
  let activeSource = $state<SourceEntry | null>(null);
  let prefs        = $state<Preference[]>([]);
  let loading      = $state(false);
  let saving       = $state<string | null>(null);
  let editKey      = $state<string | null>(null);
  let editValue    = $state("");
  let listOpen     = $state<string | null>(null);

  $effect(() => {
    if (sources.length === 1) openSource(sources[0]);
  });

  async function openSource(src: SourceEntry) {
    activeSource = src;
    phase        = "settings";
    loading      = true;
    prefs        = [];
    editKey      = null;
    listOpen     = null;
    try {
      const d = await gql<{ source: { preferences: Preference[] } }>(
        GET_SOURCE_SETTINGS,
        { id: String(src.id) },
      );
      prefs = d.source.preferences ?? [];
    } catch (e: any) {
      addToast({ kind: "error", title: "Failed to load settings", body: e?.message ?? "" });
    } finally {
      loading = false;
    }
  }

  function backToPicker() {
    phase        = "pick";
    activeSource = null;
    prefs        = [];
    editKey      = null;
    listOpen     = null;
  }

  async function save(position: number, changeType: string, value: unknown) {
    if (!activeSource) return;
    const pref = prefs[position];
    saving = pref.key;
    try {
      await gql(UPDATE_SOURCE_PREFERENCE, {
        source: String(activeSource.id),
        change: { position, [changeType]: value },
      });
      const d = await gql<{ source: { preferences: Preference[] } }>(
        GET_SOURCE_SETTINGS,
        { id: String(activeSource.id) },
      );
      prefs = d.source.preferences ?? [];
    } catch (e: any) {
      addToast({ kind: "error", title: "Failed to save", body: e?.message ?? "" });
    } finally {
      saving = null;
    }
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
    if (p.type === "CheckBoxPreference")
      return p.CheckBoxCurrentValue ?? p.CheckBoxDefault ?? false;
    return p.SwitchPreferenceCurrentValue ?? p.SwitchPreferenceDefault ?? false;
  }
  function getListValue(p: Preference) {
    return p.ListPreferenceCurrentValue ?? p.ListPreferenceDefault ?? "";
  }
  function getListLabel(p: Preference, val: string) {
    const idx = p.entryValues?.indexOf(val) ?? -1;
    return idx >= 0 ? (p.entries?.[idx] ?? val) : val;
  }
  function getMultiValue(p: Preference): string[] {
    return p.MultiSelectListPreferenceCurrentValue ?? p.MultiSelectListPreferenceDefault ?? [];
  }
  function toggleMulti(position: number, p: Preference, val: string) {
    const current = getMultiValue(p);
    const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
    save(position, "multiSelectState", next);
  }
  function submitEdit(position: number) {
    save(position, "editTextState", editValue);
    editKey = null;
  }
  function openEdit(p: Preference) {
    editKey   = p.key;
    editValue = p.EditTextPreferenceCurrentValue ?? p.EditTextPreferenceDefault ?? "";
  }

  function langTag(displayName: string) {
    const m = displayName.match(/\(([^)]+)\)$/);
    return m ? m[1].toUpperCase() : null;
  }

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (editKey)  { editKey = null; return; }
      if (listOpen) { listOpen = null; return; }
      if (phase === "settings" && sources.length > 1) { backToPicker(); return; }
      onClose();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop" role="dialog" aria-modal="true" onmousedown={onBackdrop}>
  <div class="modal">

    <div class="modal-header">
      <div class="modal-title-wrap">
        {#if phase === "settings" && sources.length > 1}
          <button class="icon-btn" onclick={backToPicker} title="Back">
            <CaretLeft size={13} weight="bold" />
          </button>
        {/if}
        {#if iconUrl}
          <Thumbnail src={iconUrl} alt={extensionName} class="modal-ext-icon" onerror={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
        {/if}
        <div class="modal-titles">
          <span class="modal-eyebrow">Extension Settings</span>
          <span class="modal-title">
            {phase === "pick" ? extensionName : (activeSource?.displayName ?? extensionName)}
          </span>
        </div>
      </div>
      <button class="icon-btn" onclick={onClose}>
        <X size={14} weight="bold" />
      </button>
    </div>

    <div class="modal-body">

      {#if phase === "pick"}
        <div class="source-list">
          {#each sources as src}
            {@const tag = langTag(src.displayName)}
            {@const baseName = src.displayName.replace(/\s*\([^)]+\)$/, "")}
            <button class="source-row" onclick={() => openSource(src)}>
              <span class="source-name">{baseName}</span>
              {#if tag}<span class="lang-badge">{tag}</span>{/if}
            </button>
          {/each}
        </div>

      {:else}
        {#if loading}
          <div class="center-state">
            <CircleNotch size={16} weight="light" class="anim-spin" style="color:var(--text-faint)" />
          </div>
        {:else if prefs.length === 0}
          <div class="center-state empty-state">No configurable settings.</div>
        {:else}
          <div class="pref-list">
            {#each prefs as pref, i}
              {@const title   = getTitle(pref)}
              {@const summary = getSummary(pref)}
              {@const isSaving = saving === pref.key}

              {#if pref.type === "CheckBoxPreference" || pref.type === "SwitchPreference"}
                {@const checked = getBoolValue(pref)}
                <div class="pref-row">
                  <div class="pref-text">
                    <span class="pref-title">{title}</span>
                    {#if summary}<span class="pref-summary">{summary}</span>{/if}
                  </div>
                  <button
                    class="toggle" class:toggle-on={checked}
                    disabled={isSaving}
                    onclick={() => save(i, pref.type === "CheckBoxPreference" ? "checkBoxState" : "switchState", !checked)}
                  >
                    {#if isSaving}
                      <CircleNotch size={10} weight="light" class="anim-spin" />
                    {:else}
                      <span class="toggle-thumb"></span>
                    {/if}
                  </button>
                </div>

              {:else if pref.type === "ListPreference"}
                {@const current = getListValue(pref)}
                <div class="pref-row pref-row-col">
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
                        <CircleNotch size={11} weight="light" class="anim-spin" />
                      {:else}
                        <CaretUpDown size={11} weight="bold" />
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
                            {#if val === current}<Check size={11} weight="bold" />{/if}
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>

              {:else if pref.type === "EditTextPreference"}
                {#if editKey === pref.key}
                  <div class="pref-row pref-row-col edit-active">
                    <div class="pref-text">
                      {#if pref.dialogTitle}<span class="pref-title">{pref.dialogTitle}</span>{/if}
                      {#if pref.dialogMessage}<span class="pref-summary">{pref.dialogMessage}</span>{/if}
                    </div>
                    <div class="edit-row">
                      <input
                        class="edit-input"
                        bind:value={editValue}
                        disabled={isSaving}
                        onkeydown={(e) => { if (e.key === "Enter") submitEdit(i); if (e.key === "Escape") editKey = null; }}
                        autofocus
                      />
                      <button class="action-btn-dim" onclick={() => editKey = null}>Cancel</button>
                      <button class="action-btn" onclick={() => submitEdit(i)} disabled={isSaving}>
                        {#if isSaving}<CircleNotch size={11} weight="light" class="anim-spin" />{:else}Save{/if}
                      </button>
                    </div>
                  </div>
                {:else}
                  <button class="pref-row pref-row-btn" onclick={() => openEdit(pref)}>
                    <div class="pref-text">
                      <span class="pref-title">{title}</span>
                      {#if summary}<span class="pref-summary">{summary}</span>{/if}
                    </div>
                    <span class="pref-value-hint">
                      {pref.EditTextPreferenceCurrentValue ?? pref.EditTextPreferenceDefault ?? "—"}
                    </span>
                  </button>
                {/if}

              {:else if pref.type === "MultiSelectListPreference"}
                {@const selected = getMultiValue(pref)}
                <div class="pref-row pref-row-col">
                  <div class="pref-text">
                    <span class="pref-title">{title}</span>
                    {#if summary}<span class="pref-summary">{summary}</span>{/if}
                  </div>
                  <div class="multi-list">
                    {#each (pref.entries ?? []) as entry, j}
                      {@const val = pref.entryValues?.[j] ?? entry}
                      {@const on  = selected.includes(val)}
                      <button
                        class="multi-item" class:multi-item-on={on}
                        disabled={isSaving}
                        onclick={() => toggleMulti(i, pref, val)}
                      >
                        <span class="multi-check">{#if on}<Check size={10} weight="bold" />{/if}</span>
                        {entry}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}

    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.45);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: var(--z-modal);
    animation: fadeIn 0.15s ease both;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    display: flex; flex-direction: column;
    width: 400px; max-width: calc(100vw - 32px); max-height: 78vh;
    background: var(--bg-surface);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-lg);
    overflow: hidden;
    animation: slideUp 0.18s cubic-bezier(0.16,1,0.3,1) both;
    box-shadow: var(--shadow-lg);
  }
  @keyframes slideUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .modal-title-wrap { display: flex; align-items: center; gap: var(--sp-2); }
  :global(.modal-ext-icon) { width: 22px; height: 22px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; background: var(--bg-raised); }
  .modal-titles { display: flex; flex-direction: column; gap: 1px; }
  .modal-eyebrow {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase;
  }
  .modal-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px;
    border-radius: var(--radius-md);
    color: var(--text-faint); flex-shrink: 0;
    transition: color var(--t-base), background var(--t-base);
  }
  .icon-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }

  .modal-body { overflow-y: auto; flex: 1; }

  .source-list { display: flex; flex-direction: column; padding: var(--sp-2) 0; }
  .source-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px var(--sp-4);
    text-align: left;
    transition: background var(--t-fast);
    gap: var(--sp-3);
  }
  .source-row:hover { background: var(--bg-raised); }
  .source-name { flex: 1; font-size: var(--text-sm); color: var(--text-secondary); font-weight: var(--weight-medium); }
  .lang-badge {
    font-family: var(--font-ui); font-size: 10px; letter-spacing: var(--tracking-wide);
    color: var(--text-faint); background: var(--bg-overlay);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-sm);
    padding: 1px 6px; flex-shrink: 0;
  }

  .center-state { display: flex; align-items: center; justify-content: center; padding: var(--sp-8); }
  .empty-state { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .pref-list { display: flex; flex-direction: column; padding: var(--sp-2) 0; }
  .pref-row {
    display: flex; align-items: center; gap: var(--sp-3);
    padding: 10px var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
  }
  .pref-row:last-child { border-bottom: none; }
  .pref-row-col { flex-direction: column; align-items: stretch; gap: var(--sp-2); }
  .pref-row-btn { width: 100%; text-align: left; transition: background var(--t-fast); }
  .pref-row-btn:hover { background: var(--bg-raised); }
  .edit-active { background: var(--bg-raised); }

  .pref-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .pref-title { font-size: var(--text-sm); color: var(--text-secondary); font-weight: var(--weight-medium); }
  .pref-summary {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: 1.5;
  }
  .pref-value-hint {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-muted); letter-spacing: var(--tracking-wide);
    flex-shrink: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .toggle {
    position: relative; width: 32px; height: 18px; border-radius: 9px;
    background: var(--bg-overlay); border: 1px solid var(--border-strong);
    flex-shrink: 0; transition: background var(--t-base), border-color var(--t-base);
    display: flex; align-items: center; justify-content: center;
  }
  .toggle-on { background: var(--accent-muted); border-color: var(--accent-dim); }
  .toggle-thumb {
    position: absolute; left: 2px; width: 12px; height: 12px;
    border-radius: 50%; background: var(--text-faint);
    transition: left var(--t-base), background var(--t-base); pointer-events: none;
  }
  .toggle-on .toggle-thumb { left: 16px; background: var(--accent-fg); }
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
    animation: dropIn 0.12s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes dropIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
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
    padding: 5px 12px; border-radius: var(--radius-md);
    background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim);
    flex-shrink: 0; display: flex; align-items: center; gap: var(--sp-1);
    transition: filter var(--t-base);
  }
  .action-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .action-btn:disabled { opacity: 0.4; cursor: default; }

  .action-btn-dim {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 12px; border-radius: var(--radius-md);
    background: none; color: var(--text-faint); border: 1px solid var(--border-dim);
    flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base);
  }
  .action-btn-dim:hover { color: var(--text-secondary); border-color: var(--border-strong); }

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
    width: 14px; height: 14px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--bg-base);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; color: var(--accent-fg);
    transition: background var(--t-fast), border-color var(--t-fast);
  }
  .multi-item-on .multi-check { background: var(--accent-muted); border-color: var(--accent-dim); }
</style>