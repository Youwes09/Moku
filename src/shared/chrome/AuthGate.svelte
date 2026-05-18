<script lang="ts">
  import logoUrl from "@assets/moku-icon-splash.svg";
  import { store } from "@store/state.svelte";
  import { boot, submitLogin, bypassBoot } from "@store/boot.svelte";

  let { onReady }: { onReady: () => void } = $props();

  function handleLogin() {
    submitLogin(onReady);
  }

  function handleBypass() {
    bypassBoot(onReady);
  }
</script>

{#if boot.loginRequired}
  <div class="auth-overlay">
    <div class="auth-card anim-scale-in">
      <img src={logoUrl} alt="Moku" class="auth-logo" />
      <p class="auth-title">moku</p>
      <span class="auth-mode-badge">
        {store.settings.serverAuthMode === "UI_LOGIN" ? "UI Login" : "Basic Auth"}
      </span>
      <p class="auth-host">{store.settings.serverUrl || "localhost:4567"}</p>

      {#if boot.loginError}
        <p class="auth-error">{boot.loginError}</p>
      {/if}

      <div class="auth-fields">
        <input class="auth-input" type="text" placeholder="Username"
          bind:value={boot.loginUser} disabled={boot.loginBusy}
          autocomplete="username"
          onkeydown={(e) => e.key === "Enter" && handleLogin()} />
        <input class="auth-input" type="password" placeholder="Password"
          bind:value={boot.loginPass} disabled={boot.loginBusy}
          autocomplete="current-password"
          onkeydown={(e) => e.key === "Enter" && handleLogin()} />
      </div>

      <button class="auth-btn" onclick={handleLogin}
        disabled={boot.loginBusy || !boot.loginUser.trim() || !boot.loginPass.trim()}>
        {boot.loginBusy ? "Signing in…" : "Sign in"}
      </button>
      <button class="auth-btn auth-btn--ghost" onclick={handleBypass}>Skip</button>
    </div>
  </div>
{/if}

<style>
  .auth-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  .auth-card { pointer-events: auto; width: min(280px, calc(100vw - 48px)); background: var(--bg-surface); border: 1px solid var(--border-base); border-radius: var(--radius-xl); padding: var(--sp-6) var(--sp-5); display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); box-shadow: 0 32px 80px rgba(0,0,0,0.75); text-align: center; outline: none; }

  .auth-logo { width: 56px; height: 56px; border-radius: 14px; display: block; }
  .auth-title { font-family: var(--font-ui); font-size: 11px; font-weight: 500; letter-spacing: 0.26em; text-transform: uppercase; color: var(--text-secondary); margin: -6px 0 0; user-select: none; }
  .auth-mode-badge { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--accent-fg); background: var(--accent-muted); border: 1px solid var(--accent-dim); border-radius: var(--radius-full); padding: 2px 10px; }
  .auth-host { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); margin: -4px 0 0; }
  .auth-error { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-error); background: var(--color-error-bg); border: 1px solid var(--color-error); border-radius: var(--radius-sm); padding: var(--sp-2) var(--sp-3); margin: 0; width: 100%; box-sizing: border-box; }
  .auth-fields { display: flex; flex-direction: column; gap: var(--sp-2); width: 100%; }
  .auth-input { width: 100%; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 8px 12px; font-size: var(--text-sm); color: var(--text-primary); outline: none; box-sizing: border-box; transition: border-color var(--t-base), box-shadow var(--t-base); font-family: inherit; }
  .auth-input:focus { border-color: var(--border-focus); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent); }
  .auth-input:disabled { opacity: 0.5; }
  .auth-btn { width: 100%; padding: 9px; border-radius: var(--radius-md); background: var(--accent); border: 1px solid var(--accent); color: var(--accent-fg); font-size: var(--text-sm); font-family: var(--font-ui); letter-spacing: var(--tracking-wide); cursor: pointer; transition: opacity var(--t-base); }
  .auth-btn:hover:not(:disabled) { opacity: 0.85; }
  .auth-btn:disabled { opacity: 0.35; cursor: default; }
  .auth-btn--ghost { background: none; border-color: transparent; color: var(--text-faint); font-size: var(--text-xs); padding: 4px; }
  .auth-btn--ghost:hover:not(:disabled) { color: var(--text-muted); opacity: 1; }
</style>