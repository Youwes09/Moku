<script lang="ts">
  import { gql, thumbUrl } from "@api/client";
  import { GET_TRACKERS } from "@api/queries/tracking";
  import { LOGIN_TRACKER_OAUTH, LOGIN_TRACKER_CREDENTIALS, LOGOUT_TRACKER } from "@api/mutations/tracking";
  import { open as openUrl } from "@tauri-apps/plugin-shell";
  import { store, updateSettings, addToast } from "@store/state.svelte";
  import { syncBackFromTracker } from "@features/tracking/lib/trackingSync";
  import { GET_ALL_TRACKER_RECORDS } from "@api/queries/tracking";
  import { GET_CHAPTERS } from "@api/queries/chapters";
  import type { Tracker, TrackRecord } from "../../lib/types";
  import type { Chapter } from "@types/index";

  let trackers        = $state<Tracker[]>([]);
  let trackersLoading = $state(false);
  let trackersError   = $state<string | null>(null);
  let oauthTrackerId  = $state<number | null>(null);
  let oauthCallbackInput = $state("");
  let oauthSubmitting = $state(false);
  let oauthError      = $state<string | null>(null);
  let credsTrackerId  = $state<number | null>(null);
  let credsUsername   = $state("");
  let credsPassword   = $state("");
  let credsSubmitting = $state(false);
  let credsError      = $state<string | null>(null);
  let loggingOut      = $state<number | null>(null);

  $effect(() => {
    if (trackers.length === 0 && !trackersLoading) loadTrackers();
  });

  async function loadTrackers() {
    trackersLoading = true; trackersError = null;
    try {
      const res = await gql<{ trackers: { nodes: Tracker[] } }>(GET_TRACKERS);
      trackers = res.trackers.nodes;
    } catch (e: any) {
      trackersError = e?.message ?? "Failed to load trackers";
    } finally { trackersLoading = false; }
  }

  async function startOAuth(tracker: Tracker) {
    if (!tracker.authUrl) return;
    oauthTrackerId = tracker.id; oauthCallbackInput = "";
    await openUrl(tracker.authUrl);
  }

  async function submitOAuth() {
    if (!oauthTrackerId || !oauthCallbackInput.trim()) return;
    oauthSubmitting = true;
    try {
      await gql(LOGIN_TRACKER_OAUTH, { trackerId: oauthTrackerId, callbackUrl: oauthCallbackInput.trim() });
      await loadTrackers();
      oauthTrackerId = null; oauthCallbackInput = "";
    } catch (e: any) {
      oauthError = e?.message ?? "Login failed";
    } finally { oauthSubmitting = false; }
  }

  function cancelOAuth() { oauthTrackerId = null; oauthCallbackInput = ""; oauthError = null; }

  function startCredentials(tracker: Tracker) { credsTrackerId = tracker.id; credsUsername = ""; credsPassword = ""; }

  async function submitCredentials() {
    if (!credsTrackerId || !credsUsername.trim() || !credsPassword.trim()) return;
    credsSubmitting = true;
    try {
      await gql(LOGIN_TRACKER_CREDENTIALS, { trackerId: credsTrackerId, username: credsUsername.trim(), password: credsPassword.trim() });
      await loadTrackers();
      credsTrackerId = null; credsUsername = ""; credsPassword = "";
    } catch (e: any) {
      credsError = e?.message ?? "Login failed";
    } finally { credsSubmitting = false; }
  }

  function cancelCredentials() { credsTrackerId = null; credsUsername = ""; credsPassword = ""; credsError = null; }

  async function logoutTracker(trackerId: number) {
    loggingOut = trackerId;
    try {
      await gql(LOGOUT_TRACKER, { trackerId });
      await loadTrackers();
    } catch (e: any) {
      trackersError = e?.message ?? "Logout failed";
    } finally { loggingOut = null; }
  }

  function focusEl(node: HTMLElement) { setTimeout(() => node.focus(), 0); }

  let syncing = $state(false);

  async function runSyncAll() {
    syncing = true;
    try {
      const res = await gql<{ trackers: { nodes: any[] } }>(GET_ALL_TRACKER_RECORDS);
      const allTrackers = res.trackers.nodes.filter((t: any) => t.isLoggedIn);
      let totalMarked = 0;

      for (const tracker of allTrackers) {
        for (const record of tracker.trackRecords.nodes as TrackRecord[]) {
          if (!record.manga?.id) continue;
          const mangaId = record.manga.id;
          const chapRes = await gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId });
          const prefs   = store.settings.mangaPrefs?.[mangaId] ?? {};

          const marked = await syncBackFromTracker(
            [record],
            chapRes.chapters.nodes,
            {
              threshold:              store.settings.trackerSyncBackThreshold ?? null,
              respectScanlatorFilter: store.settings.trackerRespectScanlatorFilter ?? true,
              chapterPrefs:           prefs,
            },
            (query, vars) => gql(query, vars),
          );
          totalMarked += marked.length;
        }
      }

      addToast({ kind: "success", title: "Sync complete", body: `${totalMarked} chapter${totalMarked !== 1 ? "s" : ""} marked read` });
    } catch (e: any) {
      addToast({ kind: "error", title: "Sync failed", body: e?.message });
    } finally { syncing = false; }
  }
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Connected Trackers</p>
    <div class="s-section-body">
      {#if trackersError}
        <div class="s-banner s-banner-error" onclick={() => trackersError = null} role="button" tabindex="0" onkeydown={(e) => e.key === "Enter" && (trackersError = null)}>{trackersError}</div>
      {/if}
      {#if trackersLoading}
        <p class="s-empty">Loading trackers…</p>
      {:else}
        {#each trackers as tracker}
          <div class="s-tracker-row" class:expanded={oauthTrackerId === tracker.id || credsTrackerId === tracker.id}>
            <div class="s-tracker-identity">
              <img src={thumbUrl(tracker.icon)} alt={tracker.name} class="s-tracker-logo" />
              <div class="s-row-info">
                <span class="s-label">{tracker.name}</span>
                <div class="s-tracker-status-row">
                  <span class="s-pill" class:on={tracker.isLoggedIn && !tracker.isTokenExpired}>
                    {tracker.isLoggedIn ? "Connected" : "Not connected"}
                  </span>
                  {#if tracker.isLoggedIn && tracker.isTokenExpired}
                    <span class="s-pill s-pill-warn">Token expired — reconnect</span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="s-tracker-action">
              {#if tracker.isLoggedIn && tracker.isTokenExpired}
                <button class="s-btn s-btn-accent" onclick={() => tracker.authUrl ? startOAuth(tracker) : startCredentials(tracker)}>
                  Reconnect
                </button>
                <button class="s-btn s-btn-danger" onclick={() => logoutTracker(tracker.id)} disabled={loggingOut === tracker.id}>
                  {loggingOut === tracker.id ? "Disconnecting…" : "Disconnect"}
                </button>
              {:else if tracker.isLoggedIn}
                <button class="s-btn s-btn-danger" onclick={() => logoutTracker(tracker.id)} disabled={loggingOut === tracker.id}>
                  {loggingOut === tracker.id ? "Disconnecting…" : "Disconnect"}
                </button>
              {:else if oauthTrackerId !== tracker.id && credsTrackerId !== tracker.id}
                <button class="s-btn" onclick={() => tracker.authUrl ? startOAuth(tracker) : startCredentials(tracker)}>
                  {tracker.authUrl ? "Connect via browser →" : "Connect"}
                </button>
              {/if}
            </div>
            {#if oauthTrackerId === tracker.id}
              <div class="s-tracker-expand">
                {#if oauthError}
                  <div class="s-banner s-banner-error s-banner-dismissible" onclick={() => oauthError = null} role="button" tabindex="0" onkeydown={(e) => e.key === "Enter" && (oauthError = null)}>{oauthError}</div>
                {/if}
                <p class="s-oauth-hint">Browser opened {tracker.name} login — authorise then paste the callback URL below.</p>
                <input class="s-input full" placeholder="https://suwayomi.org/tracker-oauth#access_token=…"
                  bind:value={oauthCallbackInput}
                  onkeydown={(e) => { if (e.key === "Enter") submitOAuth(); if (e.key === "Escape") cancelOAuth(); }}
                  use:focusEl />
                <div class="s-oauth-btns">
                  <button class="s-btn s-btn-accent" onclick={submitOAuth} disabled={oauthSubmitting || !oauthCallbackInput.trim()}>
                    {oauthSubmitting ? "Connecting…" : "Connect"}
                  </button>
                  <button class="s-btn" onclick={cancelOAuth}>Cancel</button>
                </div>
              </div>
            {/if}
            {#if credsTrackerId === tracker.id}
              <div class="s-tracker-expand">
                {#if credsError}
                  <div class="s-banner s-banner-error s-banner-dismissible" onclick={() => credsError = null} role="button" tabindex="0" onkeydown={(e) => e.key === "Enter" && (credsError = null)}>{credsError}</div>
                {/if}
                <input class="s-input full" placeholder="Username / Email" bind:value={credsUsername}
                  onkeydown={(e) => e.key === "Escape" && cancelCredentials()} use:focusEl />
                <input class="s-input full" type="password" placeholder="Password" bind:value={credsPassword}
                  onkeydown={(e) => { if (e.key === "Enter") submitCredentials(); if (e.key === "Escape") cancelCredentials(); }} />
                <div class="s-oauth-btns">
                  <button class="s-btn s-btn-accent" onclick={submitCredentials} disabled={credsSubmitting || !credsUsername.trim() || !credsPassword.trim()}>
                    {credsSubmitting ? "Connecting…" : "Connect"}
                  </button>
                  <button class="s-btn" onclick={cancelCredentials}>Cancel</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Sync back from tracker</p>
    <div class="s-row">
      <div class="s-row-info">
        <span class="s-label">Enable sync back</span>
        <span class="s-desc">Mark chapters read locally based on tracker progress</span>
      </div>
      <button class="s-toggle" class:on={store.settings.trackerSyncBack}
        onclick={() => updateSettings({ trackerSyncBack: !store.settings.trackerSyncBack })}
        role="switch" aria-checked={store.settings.trackerSyncBack} aria-label="Enable sync back">
        <span class="s-toggle-thumb"></span>
      </button>
    </div>

    {#if store.settings.trackerSyncBack}
      <label class="s-row">
        <div class="s-row-info">
          <span class="s-label">Chapter number tolerance</span>
          <span class="s-desc">Allow source and tracker chapter numbers to differ by up to the set amount. When off, the tracker number is used as-is with no range check.</span>
        </div>
        <button role="switch" aria-checked={store.settings.trackerSyncBackThreshold !== null} aria-label="Chapter number tolerance" class="s-toggle" class:on={store.settings.trackerSyncBackThreshold !== null}
          onclick={() => updateSettings({ trackerSyncBackThreshold: store.settings.trackerSyncBackThreshold !== null ? null : 20 })}>
          <span class="s-toggle-thumb"></span>
        </button>
      </label>
      {#if store.settings.trackerSyncBackThreshold !== null}
        <div class="s-row">
          <div class="s-row-info"><span class="s-label">Tolerance</span><span class="s-desc">Max chapter number difference allowed (1–20)</span></div>
          <div class="s-stepper">
            <button class="s-step-btn" onclick={() => updateSettings({ trackerSyncBackThreshold: Math.max(1, (store.settings.trackerSyncBackThreshold ?? 20) - 1) })}>−</button>
            <span class="s-step-val">{store.settings.trackerSyncBackThreshold}</span>
            <button class="s-step-btn" onclick={() => updateSettings({ trackerSyncBackThreshold: Math.min(20, (store.settings.trackerSyncBackThreshold ?? 20) + 1) })}>+</button>
          </div>
        </div>
      {/if}

      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Respect scanlator filter</span>
          <span class="s-desc">Only mark chapters matching the series' active scanlator filter</span>
        </div>
        <button class="s-toggle" class:on={store.settings.trackerRespectScanlatorFilter}
          onclick={() => updateSettings({ trackerRespectScanlatorFilter: !store.settings.trackerRespectScanlatorFilter })}
          role="switch" aria-checked={store.settings.trackerRespectScanlatorFilter} aria-label="Respect scanlator filter">
          <span class="s-toggle-thumb"></span>
        </button>
      </div>

      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Sync now</span>
          <span class="s-desc">Apply tracker progress to all linked manga in your library</span>
        </div>
        <button class="s-btn" onclick={runSyncAll} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync all"}
        </button>
      </div>
    {/if}
  </div>

</div>

<style>
  .s-tracker-status-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .s-pill-warn { background: color-mix(in srgb, var(--color-warn, #c97c2b) 15%, transparent); color: var(--color-warn, #c97c2b); border-color: color-mix(in srgb, var(--color-warn, #c97c2b) 35%, transparent); }
  .s-banner-dismissible { cursor: pointer; max-height: 8rem; overflow-y: auto; }
  .s-banner-dismissible:hover { opacity: 0.85; }
</style>