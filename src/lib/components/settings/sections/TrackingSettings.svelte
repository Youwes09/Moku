<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { ArrowSquareOut, CheckCircle, CircleNotch, LinkBreak, ArrowClockwise, Copy } from "phosphor-svelte";
  import { platformService } from "$lib/platform-service";
  import { addToast } from "$lib/state/notifications.svelte";
  import { trackerState } from "$lib/state/trackers.svelte";
  import { tsunagu } from "$lib/server-adapters/tsunagu";
  import TrackerLogo from "$lib/components/tracking/TrackerLogo.svelte";

  let drafts  = $state<Record<string, string>>({});
  let busy    = $state<Record<string, boolean>>({});
  let polling = $state<Record<string, boolean>>({});

  let alive = true;
  onMount(() => { trackerState.load(); });
  onDestroy(() => { alive = false; });

  function setDraft(key: string, v: string) { drafts = { ...drafts, [key]: v }; }
  function setBusy(key: string, v: boolean) { busy = { ...busy, [key]: v }; }

  async function openAuth(url: string) {
    try {
      await platformService.openExternal(url);
    } catch {
      try { window.open(url, "_blank", "noopener"); } catch { }
    }
  }

  async function copyAuth(url: string) {
    try { await navigator.clipboard.writeText(url); addToast({ kind: "success", title: "Link copied" }); }
    catch { }
  }

  async function submitToken(key: string) {
    const raw = (drafts[key] ?? "").trim();
    if (!raw) return;
    setBusy(key, true);
    try {
      const updated = await tsunagu.trackerLogin(key, raw);
      trackerState.patch(updated);
      setDraft(key, "");
      addToast({ kind: "success", title: `${updated.name} connected`, body: updated.username ?? "" });
    } catch (e: any) {
      addToast({ kind: "error", title: "Couldn't connect", body: e?.message ?? String(e) });
    } finally {
      setBusy(key, false);
    }
  }

  async function authorize(key: string, url: string) {
    await openAuth(url);
    polling = { ...polling, [key]: true };
    const until = Date.now() + 120_000;
    while (alive && polling[key] && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2500));
      if (!alive || !polling[key]) break;
      await trackerState.load(true);
      if (trackerState.byKey(key)?.isLoggedIn) {
        addToast({ kind: "success", title: `${trackerState.byKey(key)?.name ?? "Tracker"} connected` });
        break;
      }
    }
    polling = { ...polling, [key]: false };
  }

  async function disconnect(key: string) {
    setBusy(key, true);
    try {
      await tsunagu.trackerLogout(key);
      await trackerState.load(true);
    } catch (e: any) {
      addToast({ kind: "error", title: "Couldn't disconnect", body: e?.message ?? String(e) });
    } finally {
      setBusy(key, false);
    }
  }
</script>

<div class="s-panel">
  <div class="s-section">
    <div class="s-section-title">
      <span>Tracking services</span>
      <button class="trk-reload" title="Reload" onclick={() => trackerState.load(true)} aria-label="Reload">
        <ArrowClockwise size={13} weight="regular" class={trackerState.loading ? "anim-spin" : ""} />
      </button>
    </div>

    <div class="s-section-body">
      {#if trackerState.loading && trackerState.list.length === 0}
        <p class="s-empty"><CircleNotch size={14} weight="light" class="anim-spin" /> Loading…</p>
      {:else if trackerState.error}
        <p class="s-empty" style="color:var(--color-error)">{trackerState.error}</p>
      {:else if trackerState.list.length === 0}
        <p class="s-empty">No tracking services available on this server.</p>
      {:else}
        {#each trackerState.list as t (t.key)}
          {@const isMal = t.key === "mal" || t.key === "myanimelist"}
          <div class="trk">
            <div class="trk-top">
              <TrackerLogo trackerKey={t.key} iconUrl={t.iconUrl} size={22} />
              <div class="trk-id">
                <span class="trk-name">{t.name}</span>
                {#if !isMal && t.isLoggedIn && t.username}
                  <span class="trk-user">Signed in as {t.username}</span>
                {/if}
              </div>
              {#if isMal}
                <span class="trk-badge trk-badge-off">Coming soon</span>
              {:else if !t.configured}
                <span class="trk-badge trk-badge-off">Not configured</span>
              {:else if t.isLoggedIn}
                <span class="trk-badge trk-badge-on"><CheckCircle size={11} weight="fill" /> Connected</span>
              {:else}
                <span class="trk-badge">Not connected</span>
              {/if}
            </div>

            {#if isMal}
              <p class="s-desc">MyAnimeList sync is not available yet.</p>

            {:else if !t.configured}
              <p class="s-desc">No OAuth client for {t.name}. An operator sets <code>TSUNAGU_ANILIST_CLIENT_ID</code> and restarts Tsunagu.</p>

            {:else if t.isLoggedIn}
              <div class="trk-actions">
                <button class="s-btn s-btn-danger" disabled={busy[t.key]} onclick={() => disconnect(t.key)}>
                  <LinkBreak size={12} weight="light" /> Disconnect
                </button>
              </div>

            {:else}
              <p class="s-desc">Open the authorization page and approve access. If it does not finish on its own, paste the token or redirected URL below.</p>
              <div class="trk-connect">
                <div class="trk-row">
                  {#if polling[t.key]}
                    <button class="s-btn s-btn-accent" onclick={() => (polling = { ...polling, [t.key]: false })}>
                      <CircleNotch size={12} weight="light" class="anim-spin" /> Waiting… cancel
                    </button>
                  {:else}
                    <button class="s-btn s-btn-accent" onclick={() => t.authUrl && authorize(t.key, t.authUrl)} disabled={!t.authUrl}>
                      <ArrowSquareOut size={12} weight="light" /> Authorize {t.name}
                    </button>
                  {/if}
                  {#if t.authUrl}
                    <button class="s-btn trk-icon-btn" title="Copy link" onclick={() => copyAuth(t.authUrl!)} aria-label="Copy authorization link">
                      <Copy size={12} weight="light" />
                    </button>
                  {/if}
                </div>
                <div class="trk-row">
                  <input
                    class="s-input full mono"
                    placeholder="Paste token or redirect URL"
                    value={drafts[t.key] ?? ""}
                    oninput={(e) => setDraft(t.key, (e.currentTarget as HTMLInputElement).value)}
                    onkeydown={(e) => { if (e.key === "Enter") submitToken(t.key); }}
                  />
                  <button class="s-btn s-btn-accent" disabled={busy[t.key] || !(drafts[t.key] ?? "").trim()} onclick={() => submitToken(t.key)}>
                    {busy[t.key] ? "…" : "Connect"}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .trk-reload {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; margin: -4px 0; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-faint); cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .trk-reload:hover { color: var(--text-primary); background: var(--bg-surface); }

  .trk {
    display: flex; flex-direction: column; gap: var(--sp-3);
    padding: var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
  }
  .trk:last-child { border-bottom: none; }

  .trk-top { display: flex; align-items: center; gap: var(--sp-3); }
  .trk-id  { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .trk-name { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  .trk-user {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .trk-badge {
    display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 3px 8px; border-radius: var(--radius-full);
    background: var(--bg-surface); color: var(--text-faint); border: 1px solid var(--border-dim);
  }
  .trk-badge-on  { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .trk-badge-off { color: var(--text-faint); }

  .trk-connect { display: flex; flex-direction: column; gap: var(--sp-2); }
  .trk-row     { display: flex; align-items: center; gap: var(--sp-2); }
  .trk-actions { display: flex; }
  .trk-icon-btn { padding: 5px 10px; }

  .s-desc code {
    font-family: var(--font-mono, monospace); font-size: 0.9em;
    background: var(--bg-surface); border: 1px solid var(--border-dim);
    border-radius: 3px; padding: 0 3px;
  }
</style>
