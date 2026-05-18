<script lang="ts">
  import { X, FloppyDisk, UploadSimple, DownloadSimple, ArrowLeft, Trash } from "phosphor-svelte";
  import {
    store, updateSettings, saveCustomTheme, deleteCustomTheme,
    type CustomTheme, type ThemeTokens, DEFAULT_THEME_TOKENS,
  } from "@store/state.svelte";

  interface Props {
    editingId?: string | null;
    onClose: () => void;
  }

  let { editingId = $bindable(null), onClose }: Props = $props();

  const TOKEN_GROUPS: { label: string; tokens: (keyof ThemeTokens)[] }[] = [
    { label: "Backgrounds", tokens: ["bg-void", "bg-base", "bg-surface", "bg-raised", "bg-overlay", "bg-subtle"] },
    { label: "Borders",     tokens: ["border-dim", "border-base", "border-strong", "border-focus"] },
    { label: "Text",        tokens: ["text-primary", "text-secondary", "text-muted", "text-faint", "text-disabled"] },
    { label: "Accent",      tokens: ["accent", "accent-dim", "accent-muted", "accent-fg", "accent-bright"] },
    { label: "Semantic",    tokens: ["color-error", "color-error-bg", "color-success", "color-info", "color-info-bg"] },
  ];

  const TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
    "bg-void":    "Void (deepest bg)",
    "bg-base":    "Base",
    "bg-surface": "Surface",
    "bg-raised":  "Raised",
    "bg-overlay": "Overlay",
    "bg-subtle":  "Subtle",
    "border-dim":    "Dim border",
    "border-base":   "Base border",
    "border-strong": "Strong border",
    "border-focus":  "Focus ring",
    "text-primary":   "Primary text",
    "text-secondary": "Secondary text",
    "text-muted":     "Muted text",
    "text-faint":     "Faint text",
    "text-disabled":  "Disabled text",
    "accent":        "Accent",
    "accent-dim":    "Accent dim",
    "accent-muted":  "Accent muted",
    "accent-fg":     "Accent foreground",
    "accent-bright": "Accent bright",
    "color-error":    "Error",
    "color-error-bg": "Error background",
    "color-success":  "Success",
    "color-info":     "Info",
    "color-info-bg":  "Info background",
  };

  function loadInitial(): { name: string; tokens: ThemeTokens } {
    if (editingId) {
      const existing = store.settings.customThemes.find(t => t.id === editingId);
      if (existing) return { name: existing.name, tokens: { ...existing.tokens } };
    }
    return { name: "My Theme", tokens: { ...DEFAULT_THEME_TOKENS } };
  }

  const initial = loadInitial();
  let themeName: string   = $state(initial.name);
  let tokens: ThemeTokens = $state(initial.tokens);
  let saveStatus: "idle" | "saved" = $state("idle");
  let importError: string | null   = $state(null);

  function toCssVars(t: ThemeTokens): string {
    return Object.entries(t).map(([k, v]) => `--${k}: ${v};`).join(" ");
  }

  function handleSave() {
    const name  = themeName.trim() || "Untitled Theme";
    const id    = editingId ?? `custom:${Math.random().toString(36).slice(2, 10)}`;
    const theme: CustomTheme = { id, name, tokens: { ...tokens } };
    saveCustomTheme(theme);
    updateSettings({ theme: id });
    editingId  = id;
    saveStatus = "saved";
    setTimeout(() => (saveStatus = "idle"), 1800);
  }

  function handleDelete() {
    if (!editingId) { onClose(); return; }
    if (!confirm(`Delete theme "${themeName}"? This cannot be undone.`)) return;
    deleteCustomTheme(editingId);
    onClose();
  }

  async function handleExport() {
    const data: CustomTheme = {
      id:     editingId ?? "custom:export",
      name:   themeName.trim() || "Untitled Theme",
      tokens: { ...tokens },
    };
    const filename = `${data.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-theme.json`;
    const json     = JSON.stringify(data, null, 2);
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "Theme JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }
  }

  function handleImport() {
    const inp    = document.createElement("input");
    inp.type     = "file";
    inp.accept   = ".json";
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.tokens || typeof data.tokens !== "object") throw new Error("Invalid theme file — missing tokens");
        if (typeof data.name === "string") themeName = data.name;
        tokens      = { ...DEFAULT_THEME_TOKENS, ...data.tokens };
        importError = null;
      } catch (e: any) {
        importError = e.message ?? "Could not parse theme file";
        setTimeout(() => (importError = null), 3000);
      }
    };
    inp.click();
  }

  function resetToDefaults() { tokens = { ...DEFAULT_THEME_TOKENS }; }

  function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop" role="button" tabindex="-1" aria-label="Close theme editor" onclick={onClose} onkeydown={(e) => e.key === "Escape" && onClose()}>
  <div class="shell" role="dialog" aria-label="Theme editor" tabindex="0" style={toCssVars(tokens)} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>

    <header class="header">
      <div class="header-left">
        <button class="icon-btn" onclick={onClose} title="Close editor">
          <ArrowLeft size={14} weight="bold" />
        </button>
        <input bind:value={themeName} class="name-input" placeholder="Theme name" maxlength={40} spellcheck={false} />
      </div>
      <div class="header-actions">
        {#if importError}
          <span class="import-err">{importError}</span>
        {/if}
        <button class="action-btn" onclick={handleImport} title="Import from JSON">
          <UploadSimple size={13} /><span>Import</span>
        </button>
        <button class="action-btn" onclick={handleExport} title="Export as JSON">
          <DownloadSimple size={13} /><span>Export</span>
        </button>
        <button class="action-btn ghost" onclick={resetToDefaults} title="Reset all to dark defaults">Reset</button>
        {#if editingId}
          <button class="action-btn danger" onclick={handleDelete} title="Delete theme">
            <Trash size={13} />
          </button>
        {/if}
        <button class="save-btn" class:saved={saveStatus === "saved"} onclick={handleSave}>
          <FloppyDisk size={13} /><span>{saveStatus === "saved" ? "Saved!" : "Save Theme"}</span>
        </button>
        <button class="icon-btn" onclick={onClose} title="Close">
          <X size={14} weight="bold" />
        </button>
      </div>
    </header>

    <div class="body">
      <aside class="preview-pane">
        <div class="pane-label">Live Preview</div>
        <div class="preview-ui" style={toCssVars(tokens)}>
          <div class="prv-sidebar">
            {#each [true, false, false, false] as active}
              <div class="prv-sb-dot" class:active></div>
            {/each}
          </div>
          <div class="prv-main">
            <div class="prv-titlebar">
              <div class="prv-win-dots"><span></span><span></span><span></span></div>
              <div class="prv-win-title">Moku</div>
            </div>
            <div class="prv-content">
              <div class="prv-row">
                <div class="prv-bar" style="width:52px;background:var(--text-secondary);opacity:0.45"></div>
                <div class="prv-bar" style="width:18px;background:var(--accent)"></div>
              </div>
              <div class="prv-grid">
                {#each Array(6) as _, i}
                  <div class="prv-card" class:active-card={i === 0}>
                    <div class="prv-cover"></div>
                    <div class="prv-card-line"></div>
                  </div>
                {/each}
              </div>
              <div class="prv-reader"><div class="prv-page"></div></div>
              <div class="prv-toast">
                <div class="prv-toast-dot"></div>
                <div class="prv-toast-lines">
                  <div class="prv-bar" style="width:80%;background:var(--text-secondary)"></div>
                  <div class="prv-bar" style="width:55%;background:var(--text-faint);margin-top:3px"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="swatches" style={toCssVars(tokens)}>
          {#each ["bg-base","bg-surface","accent","accent-fg","text-primary","text-muted","color-error"] as v}
            <div class="swatch" style="background:var(--{v})" title={v}></div>
          {/each}
        </div>
      </aside>

      <div class="editor-pane">
        {#each TOKEN_GROUPS as group}
          <div class="group">
            <div class="group-label">{group.label}</div>
            <div class="token-list">
              {#each group.tokens as token}
                <div class="token-row">
                  <label class="color-swatch" style="background:{tokens[token]}" title="Pick colour">
                    <input
                      type="color"
                      class="color-picker"
                      value={tokens[token].length === 7 ? tokens[token] : tokens[token].slice(0, 7)}
                      oninput={(e) => { tokens = { ...tokens, [token]: (e.target as HTMLInputElement).value }; }}
                    />
                  </label>
                  <span class="token-name">{TOKEN_LABELS[token]}</span>
                  <span class="token-key">{token}</span>
                  <input
                    type="text"
                    class="hex-input"
                    value={tokens[token]}
                    spellcheck={false}
                    oninput={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (/^#[0-9a-fA-F]{3,8}$/.test(v)) tokens = { ...tokens, [token]: v };
                    }}
                    onblur={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (!/^#[0-9a-fA-F]{3,8}$/.test(v)) (e.target as HTMLInputElement).value = tokens[token];
                    }}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: 200;
    display: flex; align-items: center; justify-content: center;
    animation: backdropIn 0.14s ease both;
  }
  @keyframes backdropIn { from { opacity: 0 } to { opacity: 1 } }

  .shell {
    width: calc(100% - var(--sp-12)); max-width: 1100px;
    height: calc(100% - var(--sp-12)); max-height: 760px;
    display: flex; flex-direction: column;
    background: var(--bg-base);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-xl);
    overflow: hidden;
    animation: shellIn 0.2s cubic-bezier(0.22,1,0.36,1) both;
  }
  @keyframes shellIn {
    from { transform: translateY(10px) scale(0.99); opacity: 0 }
    to   { transform: translateY(0)    scale(1);    opacity: 1 }
  }

  .header {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--sp-3); padding: 0 var(--sp-4); height: 46px;
    border-bottom: 1px solid var(--border-dim);
    background: var(--bg-surface);
    flex-shrink: 0;
  }
  .header-left    { display: flex; align-items: center; gap: var(--sp-2); flex: 1; min-width: 0; }
  .header-actions { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    transition: color var(--t-base), background var(--t-base);
    flex-shrink: 0;
  }
  .icon-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }

  .name-input {
    flex: 1; min-width: 0;
    background: none; border: none; outline: none;
    font-family: var(--font-sans); font-size: var(--text-sm); font-weight: var(--weight-medium);
    color: var(--text-primary);
    border-bottom: 1px solid transparent;
    padding: 3px 0;
    transition: border-color var(--t-base);
  }
  .name-input:focus       { border-color: var(--border-focus); }
  .name-input::placeholder { color: var(--text-faint); }

  .import-err {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    color: var(--color-error); flex-shrink: 0;
  }

  .action-btn {
    display: flex; align-items: center; gap: var(--sp-1);
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 4px var(--sp-2); border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim);
    background: none; color: var(--text-muted);
    cursor: pointer; flex-shrink: 0;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .action-btn:hover { color: var(--text-secondary); border-color: var(--border-strong); }
  .action-btn.ghost { border-color: transparent; }
  .action-btn.ghost:hover { border-color: var(--border-dim); }
  .action-btn.danger { color: var(--color-error); border-color: transparent; }
  .action-btn.danger:hover { background: var(--color-error-bg); border-color: var(--color-error); }

  .save-btn {
    display: flex; align-items: center; gap: var(--sp-1);
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 5px var(--sp-3); border-radius: var(--radius-sm);
    border: 1px solid var(--accent-dim);
    background: var(--accent-muted); color: var(--accent-fg);
    cursor: pointer; flex-shrink: 0;
    transition: filter var(--t-base), background var(--t-base);
  }
  .save-btn:hover { filter: brightness(1.12); }
  .save-btn.saved { background: var(--accent-dim); border-color: var(--accent); }

  .body { flex: 1; overflow: hidden; display: flex; min-height: 0; }

  .preview-pane {
    width: 260px; flex-shrink: 0;
    border-right: 1px solid var(--border-dim);
    background: var(--bg-void);
    display: flex; flex-direction: column;
    padding: var(--sp-4); gap: var(--sp-3);
  }

  .pane-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider); text-transform: uppercase;
    color: var(--text-faint); flex-shrink: 0;
  }

  .preview-ui {
    flex: 1; min-height: 0;
    border-radius: var(--radius-lg); overflow: hidden;
    border: 1px solid var(--border-base);
    display: flex; background: var(--bg-void);
  }

  .prv-sidebar {
    width: 34px; flex-shrink: 0;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-dim);
    display: flex; flex-direction: column;
    align-items: center; padding: var(--sp-3) 0; gap: var(--sp-2);
  }
  .prv-sb-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--text-faint); opacity: 0.4;
    transition: background var(--t-base), opacity var(--t-base);
  }
  .prv-sb-dot.active { background: var(--accent); opacity: 1; }

  .prv-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .prv-titlebar {
    height: 26px; flex-shrink: 0;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border-dim);
    display: flex; align-items: center; padding: 0 var(--sp-2); gap: var(--sp-2);
  }
  .prv-win-dots        { display: flex; gap: var(--sp-1); }
  .prv-win-dots span   { width: 6px; height: 6px; border-radius: 50%; background: var(--border-strong); }
  .prv-win-title       { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); color: var(--text-faint); }

  .prv-content {
    flex: 1; overflow: hidden;
    padding: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2);
    background: var(--bg-base);
  }

  .prv-row  { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
  .prv-bar  { height: 3px; border-radius: 2px; }

  .prv-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: var(--sp-1); flex-shrink: 0; }
  .prv-card {
    border-radius: var(--radius-sm); border: 1px solid var(--border-dim);
    background: var(--bg-raised); overflow: hidden;
    transition: border-color var(--t-base);
  }
  .prv-card.active-card { border-color: var(--accent); }
  .prv-cover     { height: 34px; background: var(--bg-overlay); }
  .prv-card-line { height: 3px; margin: 4px; border-radius: 2px; background: var(--text-faint); opacity: 0.5; }

  .prv-reader {
    flex: 1; min-height: 0;
    border-radius: var(--radius-sm); border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
    display: flex; align-items: center; justify-content: center;
  }
  .prv-page { width: 68%; height: 86%; background: var(--bg-subtle); border-radius: 2px; }

  .prv-toast {
    flex-shrink: 0;
    display: flex; align-items: center; gap: var(--sp-2);
    padding: var(--sp-2);
    border-radius: var(--radius-md);
    background: var(--bg-overlay); border: 1px solid var(--accent-dim);
  }
  .prv-toast-dot   { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
  .prv-toast-lines { flex: 1; }

  .swatches { display: flex; gap: var(--sp-1); flex-wrap: wrap; flex-shrink: 0; }
  .swatch   { width: 22px; height: 22px; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }

  .editor-pane {
    flex: 1; overflow-y: auto;
    padding: var(--sp-4) var(--sp-5);
    display: flex; flex-direction: column; gap: var(--sp-6);
  }

  .group       { display: flex; flex-direction: column; gap: var(--sp-1); }
  .group-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider); text-transform: uppercase;
    color: var(--text-faint);
    padding-bottom: var(--sp-2); margin-bottom: var(--sp-1);
    border-bottom: 1px solid var(--border-dim);
  }

  .token-list { display: flex; flex-direction: column; gap: 1px; }
  .token-row  {
    display: flex; align-items: center; gap: var(--sp-3);
    padding: 5px var(--sp-2); border-radius: var(--radius-md);
    transition: background var(--t-base);
  }
  .token-row:hover { background: var(--bg-raised); }

  .color-swatch {
    width: 36px; height: 18px; border-radius: var(--radius-md);
    flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.2);
    cursor: pointer; position: relative; overflow: hidden; display: block;
  }
  .color-swatch:hover { box-shadow: 0 0 0 2px var(--border-focus); }

  .color-picker {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    opacity: 0; cursor: pointer; padding: 0; border: none;
  }

  .token-name { flex: 1; font-size: var(--text-xs); color: var(--text-secondary); }
  .token-key  {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    color: var(--text-faint); flex-shrink: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;
  }

  .hex-input {
    width: 82px; flex-shrink: 0;
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    color: var(--text-muted);
    background: var(--bg-overlay);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-sm); padding: 3px var(--sp-2);
    outline: none;
    transition: border-color var(--t-base), color var(--t-base);
  }
  .hex-input:focus { border-color: var(--border-focus); color: var(--text-primary); }
</style>