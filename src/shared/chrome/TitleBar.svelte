<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { platform } from "@tauri-apps/plugin-os";

  const { onClose }: { onClose: () => void } = $props();

  const win       = getCurrentWindow();
  const os        = platform();
  const isMac     = os === "macos";
  const isWindows  = os === "windows";

  let isFullscreen = $state(false);

  onMount(async () => {
    isFullscreen = await win.isFullscreen();
    const unlisten = await win.onResized(async () => {
      isFullscreen = await win.isFullscreen();
    });
    return unlisten;
  });
</script>

{#if !isFullscreen}
  <div class="bar" data-tauri-drag-region>
    {#if isMac}<div class="mac-spacer"></div>{/if}
    <span class="title" data-tauri-drag-region>Moku</span>
    {#if !isMac}
      <div class="controls">
        <button onclick={() => win.minimize()} title="Minimize" aria-label="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" stroke-width="1.5" /></svg>
        </button>
        <button onclick={() => win.toggleMaximize()} title="Maximize" aria-label="Maximize">
          <svg width="9" height="9" viewBox="0 0 9 9"><rect x="0.75" y="0.75" width="7.5" height="7.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
        </button>
        <button class="close" onclick={onClose} title="Close" aria-label="Close">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    {/if}
  </div>
{:else if isWindows}
  <div class="fullscreen-controls">
    <button onclick={() => win.setFullscreen(false)} title="Exit Fullscreen" aria-label="Exit Fullscreen">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <polyline points="1,4 1,1 4,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="6,1 9,1 9,4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="9,6 9,9 6,9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="4,9 1,9 1,6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
    <button class="close" onclick={onClose} title="Close" aria-label="Close">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
  </div>
{/if}

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; height: var(--titlebar-height); padding: 0 6px 0 var(--sp-4); background: transparent; flex-shrink: 0; user-select: none; -webkit-app-region: drag; }
  .mac-spacer { width: 70px; flex-shrink: 0; -webkit-app-region: drag; }
  .title { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; opacity: 0.5; -webkit-app-region: drag; }
  .controls { display: flex; align-items: center; gap: 2px; -webkit-app-region: no-drag; }

  button { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-sm); color: var(--text-faint); transition: color var(--t-base), background var(--t-base); -webkit-app-region: no-drag; }
  button:hover { color: var(--text-muted); background: rgba(255,255,255,0.06); }
  .close:hover { color: #fff; background: #c0392b; }

  .fullscreen-controls { position: fixed; top: 0; right: 0; z-index: 9999; display: flex; align-items: center; gap: 2px; padding: 4px; opacity: 0; transition: opacity 0.2s ease; -webkit-app-region: no-drag; }
  .fullscreen-controls:hover { opacity: 1; }
</style>