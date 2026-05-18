<script lang="ts">
  import { Pencil, Trash, Plus } from "phosphor-svelte";
  import { store, updateSettings, deleteCustomTheme } from "@store/state.svelte";
  import { mountSystemThemeSync } from "@core/theme";
  import { selectPortal } from "@core/actions/selectPortal";

  interface Props {
    selectOpen: string | null;
    closingSelect: string | null;
    toggleSelect: (id: string) => void;
    anims: boolean;
    onOpenThemeEditor?: (id?: string | null) => void;
  }

  let { selectOpen, closingSelect, toggleSelect, anims, onOpenThemeEditor }: Props = $props();

  const THEMES: { id: string; label: string; description: string; swatches: string[] }[] = [
    { id: "original",       label: "Original",       description: "Default near-black",            swatches: ["#101010","#151515","#a8c4a8","#f0efec"] },
    { id: "dark",           label: "Dark",           description: "Darker base, sharper text",     swatches: ["#080808","#111111","#bcd8bc","#ffffff"] },
    { id: "light",          label: "Light",          description: "Warm off-white",                swatches: ["#f4f2ee","#faf8f4","#2a5a2a","#1a1916"] },
    { id: "midnight",       label: "Midnight",       description: "Deep blue-black tint",          swatches: ["#0c1020","#101428","#a8b4e8","#eeeef8"] },
    { id: "warm",           label: "Warm",           description: "Amber and sepia tones",         swatches: ["#16130c","#1c1810","#e0b860","#f5f0e0"] },
  ];

  const allThemeOptions = $derived([
    ...THEMES.map(t => ({ id: t.id, label: t.label })),
    ...(store.settings.customThemes ?? []).map(t => ({ id: t.id, label: t.name })),
  ]);

  function toggleSync() {
    updateSettings({ systemThemeSync: !store.settings.systemThemeSync });
    mountSystemThemeSync();
  }

  let triggerDark  = $state<HTMLButtonElement>(null!);
  let triggerLight = $state<HTMLButtonElement>(null!);
</script>

<div class="s-panel">

  <div class="s-section">
    <div class="s-row">
      <div class="s-row-info">
        <span class="s-label">Match system theme</span>
        <span class="s-desc">Automatically switch theme when your OS switches between light and dark</span>
      </div>
      <button
        class="s-toggle"
        class:on={store.settings.systemThemeSync}
        onclick={toggleSync}
        role="switch"
        aria-label="Match system theme"
        aria-checked={store.settings.systemThemeSync}
      ><span class="s-toggle-thumb"></span></button>
    </div>

    {#if store.settings.systemThemeSync}
      <div class="s-sync-pair">
        <div class="s-sync-item">
          <span class="s-sync-label">Dark theme</span>
          <div class="s-select">
            <button bind:this={triggerDark} class="s-select-btn" onclick={() => toggleSelect("sync-dark")}>
              <span>{allThemeOptions.find(o => o.id === (store.settings.systemThemeDark ?? "dark"))?.label ?? "Original"}</span>
              <svg class="s-select-caret" class:open={selectOpen === "sync-dark"} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
            </button>
            {#if selectOpen === "sync-dark" || closingSelect === "sync-dark"}
              <div class="s-select-menu" class:anims class:closing={closingSelect === "sync-dark"} {@attach selectPortal(triggerDark)}>
                {#each allThemeOptions as opt}
                  <button class="s-select-option" class:active={opt.id === (store.settings.systemThemeDark ?? "dark")}
                    onclick={() => { updateSettings({ systemThemeDark: opt.id }); mountSystemThemeSync(); toggleSelect("sync-dark"); }}>
                    {opt.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="s-sync-item">
          <span class="s-sync-label">Light theme</span>
          <div class="s-select">
            <button bind:this={triggerLight} class="s-select-btn" onclick={() => toggleSelect("sync-light")}>
              <span>{allThemeOptions.find(o => o.id === (store.settings.systemThemeLight ?? "light"))?.label ?? "Light"}</span>
              <svg class="s-select-caret" class:open={selectOpen === "sync-light"} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
            </button>
            {#if selectOpen === "sync-light" || closingSelect === "sync-light"}
              <div class="s-select-menu" class:anims class:closing={closingSelect === "sync-light"} {@attach selectPortal(triggerLight)}>
                {#each allThemeOptions as opt}
                  <button class="s-select-option" class:active={opt.id === (store.settings.systemThemeLight ?? "light")}
                    onclick={() => { updateSettings({ systemThemeLight: opt.id }); mountSystemThemeSync(); toggleSelect("sync-light"); }}>
                    {opt.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="s-section">
    <p class="s-section-title">Theme</p>
    <div class="s-theme-grid">
      {#each THEMES as theme}
        {@const active = (store.settings.theme ?? "dark") === theme.id}
        <div class="s-theme-card" class:active>
          <button class="s-theme-card" style="border:none;padding:0;width:100%;display:block" onclick={() => updateSettings({ theme: theme.id })} title={theme.description}>
            <div class="s-theme-preview">
              <div class="s-theme-preview-bg" style="background:{theme.swatches[0]}">
                <div class="s-theme-preview-sidebar" style="background:{theme.swatches[1]}"></div>
                <div class="s-theme-preview-content">
                  <div class="s-theme-preview-accent" style="background:{theme.swatches[2]}"></div>
                  <div class="s-theme-preview-text" style="background:{theme.swatches[3]}55"></div>
                  <div class="s-theme-preview-text" style="background:{theme.swatches[3]}33;width:60%"></div>
                </div>
              </div>
            </div>
            <div class="s-theme-info">
              <span class="s-theme-name">{theme.label}</span>
              <span class="s-theme-desc">{theme.description}</span>
            </div>
            {#if active}<span class="s-theme-check">✓</span>{/if}
          </button>
        </div>
      {/each}

      {#each store.settings.customThemes ?? [] as custom}
        {@const active = store.settings.theme === custom.id}
        <div class="s-theme-card" class:active>
          <div class="s-theme-actions">
            <button class="s-theme-action-btn edit" onclick={() => onOpenThemeEditor?.(custom.id)} title="Edit theme">
              <Pencil size={10} />
            </button>
            <button class="s-theme-action-btn delete"
              onclick={() => { if (confirm(`Delete theme "${custom.name}"?`)) deleteCustomTheme(custom.id); }}
              title="Delete theme">
              <Trash size={10} />
            </button>
          </div>
          <button style="border:none;padding:0;width:100%;display:block;background:none;cursor:pointer"
            onclick={() => updateSettings({ theme: custom.id })} title="Apply {custom.name}">
            <div class="s-theme-preview">
              <div class="s-theme-preview-bg" style="background:{custom.tokens['bg-base']}">
                <div class="s-theme-preview-sidebar" style="background:{custom.tokens['bg-surface']}"></div>
                <div class="s-theme-preview-content">
                  <div class="s-theme-preview-accent" style="background:{custom.tokens['accent']}"></div>
                  <div class="s-theme-preview-text" style="background:{custom.tokens['text-primary']}55"></div>
                  <div class="s-theme-preview-text" style="background:{custom.tokens['text-primary']}33;width:60%"></div>
                </div>
              </div>
            </div>
            <div class="s-theme-info">
              <span class="s-theme-name">{custom.name}</span>
              <span class="s-theme-desc" style="color:var(--accent-fg)">Custom</span>
            </div>
          </button>
          {#if active}<span class="s-theme-check">✓</span>{/if}
        </div>
      {/each}

      <button class="s-theme-card s-theme-new" onclick={() => onOpenThemeEditor?.(null)} title="Create a custom theme">
        <Plus size={18} weight="light" />
        <div class="s-theme-info">
          <span class="s-theme-name">New Theme</span>
          <span class="s-theme-desc">Create custom</span>
        </div>
      </button>
    </div>
  </div>

</div>