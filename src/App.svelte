<script lang="ts">
  import { onMount }           from "svelte";
  import { invoke }            from "@tauri-apps/api/core";
  import { listen }            from "@tauri-apps/api/event";
  import { getCurrentWindow }  from "@tauri-apps/api/window";
  import { platform }          from "@tauri-apps/plugin-os";
  import { store, updateSettings, setActiveDownloads } from "@store/state.svelte";
  import { downloadStore } from "@features/downloads/store/downloadState.svelte";
  import { boot, initStore, startProbe, stopProbe, retryBoot, bypassBoot } from "@store/boot.svelte";
  import { initRpc, setIdle, clearReading, destroyRpc } from "@store/discord";
  import { applyTheme }        from "@core/theme";
  import { applyZoom, mountZoomKey, mountIdleDetection } from "@core/ui";
  import { checkForUpdateSilently } from "@core/updater";
  import Layout       from "@shared/chrome/Layout.svelte";
  import Reader       from "@features/reader/components/Reader.svelte";
  import Settings     from "@features/settings/components/Settings.svelte";
  import ThemeEditor  from "@features/settings/components/ThemeEditor.svelte";
  import TitleBar     from "@shared/chrome/TitleBar.svelte";
  import Toaster      from "@shared/chrome/Toaster.svelte";
  import SplashScreen from "@shared/chrome/SplashScreen.svelte";
  import MangaPreview from "@shared/manga/MangaPreview.svelte";
  import AuthGate     from "@shared/chrome/AuthGate.svelte";

  const win = getCurrentWindow();
  void platform();

  let appReady  = $state(false);
  let idle      = $state(false);
  let devSplash = $state(false);

  let themeEditorOpen   = $state(false);
  let themeEditorEditId = $state<string | null>(null);

  let closeDialogOpen   = $state(false);
  let closeRemember     = $state(false);

  function openThemeEditor(id?: string | null) {
    themeEditorEditId = id ?? null;
    themeEditorOpen   = true;
  }

  function closeThemeEditor() {
    themeEditorOpen   = false;
    themeEditorEditId = null;
  }

  async function doQuit() {
    if (store.settings.autoStartServer) {
      await Promise.race([
        invoke("kill_server").catch(() => {}),
        new Promise(res => setTimeout(res, 2000)),
      ]);
    }
    await invoke("exit_app");
  }

  async function doHide() {
    await win.hide();
  }

  async function handleCloseRequested() {
    const action = store.settings.closeAction ?? "ask";
    if (action === "tray") { await doHide(); return; }
    if (action === "quit") { await doQuit(); return; }
    closeDialogOpen = true;
  }

  async function confirmClose(choice: "tray" | "quit") {
    closeDialogOpen = false;
    if (closeRemember) updateSettings({ closeAction: choice });
    closeRemember = false;
    if (choice === "tray") await doHide();
    else await doQuit();
  }

  $effect(() => { void store.settings.theme; applyTheme(); });
  $effect(() => { void store.settings.uiZoom; applyZoom(); });
  $effect(() => mountZoomKey());

  $effect(() => {
    if (!appReady) return;
    return mountIdleDetection(
      () => { idle = true; },
      () => { if (idle) idle = false; },
    );
  });

  $effect(() => {
    if (!appReady) return;
    const timer = setTimeout(checkForUpdateSilently, 5_000);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (!appReady) return;
    downloadStore.poll();
    const dlInterval = setInterval(() => downloadStore.poll(), 2000);
    return () => clearInterval(dlInterval);
  });

  $effect(() => {
    if (store.settings.discordRpc) {
      initRpc();
    } else {
      clearReading();
      destroyRpc();
    }
  });

  $effect(() => {
    if (!store.activeChapter && store.settings.discordRpc) setIdle();
  });

  $effect(() => {
    const next = downloadStore.queue.slice();
    downloadStore.detectTransitions(next);
  });

  onMount(async () => {
    document.addEventListener("contextmenu", e => e.preventDefault());
    (window as any).__mokuShowSplash = () => { devSplash = true; };

    applyZoom();

    store.isFullscreen = await win.isFullscreen();

    const unlistenResize = await win.onResized(async () => {
      store.isFullscreen = await win.isFullscreen();
    });

    const unlistenScale = await win.onScaleChanged(async () => {
      applyZoom();
    });

    const unlistenClose = await win.listen("tauri://close-requested", handleCloseRequested);

    await initStore();
    startProbe();

    if (store.settings.autoStartServer) {
      invoke<void>("spawn_server", {
        binary: store.settings.serverBinary,
        webUiEnabled: store.settings.suwayomiWebUI ?? false,
      }).catch((err: any) => {
        if (err?.kind === "NotConfigured") boot.notConfigured = true;
        else console.warn("Could not start server:", err);
      });
    }

    const unlistenDownload = await listen<{ chapterId: number; mangaId: number; progress: number }[]>(
      "download-progress",
      e => setActiveDownloads(e.payload),
    );

    return () => {
      stopProbe();
      unlistenResize();
      unlistenScale();
      unlistenDownload();
      unlistenClose();
      destroyRpc();
      delete (window as any).__mokuShowSplash;
    };
  });
</script>

{#if devSplash}
  <SplashScreen mode="idle" showFps showCards={store.settings.splashCards ?? true}
    onDismiss={() => setTimeout(() => devSplash = false, 340)} />

{:else if !appReady && !boot.loginRequired}
  <SplashScreen mode="loading" ringFull={boot.serverProbeOk}
    failed={boot.failed} notConfigured={boot.notConfigured}
    showCards={store.settings.splashCards ?? true}
    onReady={() => { appReady = true; }}
    onRetry={retryBoot}
    onBypass={() => bypassBoot(() => { appReady = true; })} />

{:else if boot.loginRequired}
  <SplashScreen mode="loading" ringFull={true} showCards={store.settings.splashCards ?? true} />
  <AuthGate onReady={() => { appReady = true; }} />

{:else}
  {#if idle && !store.activeChapter}
    <SplashScreen mode="idle" showCards={store.settings.splashCards ?? true}
      onDismiss={() => { idle = false; }} />
  {/if}

  {#if boot.sessionExpired}
    <SplashScreen mode="loading" ringFull={true} showCards={store.settings.splashCards ?? true} />
    <AuthGate onReady={() => { boot.sessionExpired = false; }} />
  {/if}

  <div id="app-shell" class="root">
    {#if !store.activeChapter}<TitleBar onClose={handleCloseRequested} />{/if}
    <div class="content">
      {#if store.activeChapter}<Reader />{:else}<Layout />{/if}
    </div>
    {#if store.settingsOpen}<Settings onOpenThemeEditor={openThemeEditor} />{/if}
    {#if themeEditorOpen}
      <ThemeEditor bind:editingId={themeEditorEditId} onClose={closeThemeEditor} />
    {/if}
    <MangaPreview />
    <Toaster />
  </div>
{/if}

{#if closeDialogOpen}
  <div class="close-backdrop" role="presentation" onclick={() => { closeDialogOpen = false; closeRemember = false; }}>
    <div class="close-dialog" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <div class="close-header">
        <p class="close-title">Close Moku?</p>
        <p class="close-sub">Choose how the app should exit.</p>
      </div>
      <div class="close-actions">
        <button class="close-btn" onclick={() => confirmClose("tray")}>
          <span class="close-btn-label">Minimize to Tray</span>
          <span class="close-btn-desc">Keep running in the background</span>
        </button>
        <button class="close-btn close-btn-danger" onclick={() => confirmClose("quit")}>
          <span class="close-btn-label">Quit</span>
          <span class="close-btn-desc">Stop Moku entirely</span>
        </button>
      </div>
      <button class="close-remember" onclick={() => closeRemember = !closeRemember}>
        <span class="close-remember-toggle" class:on={closeRemember}><span class="close-remember-thumb"></span></span>
        <span class="close-remember-label">Remember my choice</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .root    { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .content { flex: 1; overflow: hidden; }

  .close-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
  }

  .close-dialog {
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-2xl);
    padding: var(--sp-5);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    width: 300px;
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.04) inset,
      0 20px 60px rgba(0,0,0,0.65),
      0 6px 20px rgba(0,0,0,0.35);
  }

  .close-header { display: flex; flex-direction: column; gap: 3px; }

  .close-title {
    font-family: var(--font-ui);
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    color: var(--text-primary);
    letter-spacing: var(--tracking-tight);
    margin: 0;
  }

  .close-sub {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    margin: 0;
  }

  .close-actions { display: flex; flex-direction: column; gap: var(--sp-1); }

  .close-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 10px var(--sp-3);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-dim);
    background: var(--bg-raised);
    cursor: pointer;
    text-align: left;
    transition: background var(--t-base), border-color var(--t-base);
  }
  .close-btn:hover { background: var(--bg-overlay); border-color: var(--border-strong); }

  .close-btn-danger { border-color: color-mix(in srgb, var(--color-error) 30%, transparent); }
  .close-btn-danger:hover { background: var(--color-error-bg); border-color: color-mix(in srgb, var(--color-error) 55%, transparent); }
  .close-btn-danger .close-btn-label { color: var(--color-error); }
  .close-btn-danger .close-btn-desc  { color: color-mix(in srgb, var(--color-error) 55%, var(--text-faint)); }

  .close-btn-label {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
  }

  .close-btn-desc {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
  }

  .close-remember {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-1) 0 0;
    background: none;
    border: none;
    cursor: pointer;
    user-select: none;
  }

  .close-remember-toggle {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-strong);
    background: var(--bg-overlay);
    flex-shrink: 0;
    transition: background var(--t-base), border-color var(--t-base);
  }
  .close-remember-toggle.on { background: var(--accent); border-color: var(--accent); }

  .close-remember-thumb {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-faint);
    transition: transform var(--t-base), background var(--t-base);
  }
  .close-remember-toggle.on .close-remember-thumb {
    transform: translateX(12px);
    background: var(--bg-void);
  }

  .close-remember-label {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
  }
</style>