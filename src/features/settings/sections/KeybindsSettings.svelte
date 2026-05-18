<script lang="ts">
  import { store, updateSettings, resetKeybinds } from "@store/state.svelte";
  import { KEYBIND_LABELS, DEFAULT_KEYBINDS, eventToKeybind } from "@core/keybinds";
  import type { Keybinds } from "@core/keybinds";

  let listeningKey: keyof Keybinds | null = $state(null);

  function startListen(key: keyof Keybinds) {
    listeningKey = listeningKey === key ? null : key;
  }

  function onKeyCapture(e: KeyboardEvent) {
    if (!listeningKey) return;
    e.preventDefault(); e.stopPropagation();
    const bind = eventToKeybind(e);
    if (!bind) return;
    updateSettings({ keybinds: { ...store.settings.keybinds, [listeningKey]: bind } });
    listeningKey = null;
  }

  $effect(() => {
    if (listeningKey) {
      window.addEventListener("keydown", onKeyCapture, true);
      return () => window.removeEventListener("keydown", onKeyCapture, true);
    }
  });
</script>

<div class="s-panel">
  <div class="s-section">
    <p class="s-section-title">
      Keyboard Shortcuts
      <button class="s-btn" onclick={resetKeybinds}>Reset all</button>
    </p>
    <p class="s-kb-hint">Click a binding to rebind, then press the new key combination.</p>
    <div class="s-section-body">
      {#each Object.keys(KEYBIND_LABELS) as key}
        {@const k = key as keyof Keybinds}
        {@const isListening = listeningKey === k}
        {@const isDefault   = store.settings.keybinds[k] === DEFAULT_KEYBINDS[k]}
        <div class="s-kb-row">
          <span class="s-kb-label">{KEYBIND_LABELS[k]}</span>
          <div class="s-kb-right">
            <button class="s-kb-bind" class:listening={isListening} onclick={() => startListen(k)}>
              {isListening ? "Press key…" : store.settings.keybinds[k]}
            </button>
            <button class="s-btn-icon" onclick={() => updateSettings({ keybinds: { ...store.settings.keybinds, [k]: DEFAULT_KEYBINDS[k] } })} disabled={isDefault} title="Reset">↺</button>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>