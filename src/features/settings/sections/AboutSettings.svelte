<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { getVersion } from "@tauri-apps/api/app";
  import { open as openUrl } from "@tauri-apps/plugin-shell";
  import { autoBackupAppData } from "@core/backup";
  import { gql } from "@api/client";
  import { GET_ABOUT_SERVER, GET_ABOUT_WEBUI } from "@api/queries/updater";

  interface ReleaseInfo { tag_name: string; name: string; body: string; published_at: string; html_url: string; }
  type UpdatePhase = "idle" | "downloading" | "launching" | "ready" | "error";
  const IS_WINDOWS = navigator.userAgent.includes("Windows");

  interface AboutServer { name: string; version: string; buildType: string; buildTime: number; github: string; discord: string; }
  interface AboutWebUI  { channel: string; tag: string; updateTimestamp: number; }

  let appVersion      = $state("…");
  let releases        = $state<ReleaseInfo[]>([]);
  let releasesLoading = $state(false);
  let releasesError   = $state<string | null>(null);
  let expandedTag     = $state<string | null>(null);
  let updatePhase     = $state<UpdatePhase>("idle");
  let updateError     = $state<string | null>(null);
  let dlBytes         = $state(0);
  let dlTotal         = $state<number | null>(null);
  let targetTag       = $state<string | null>(null);
  let releasesLoaded  = false;

  let serverInfo      = $state<AboutServer | null>(null);
  let webuiInfo       = $state<AboutWebUI | null>(null);

  $effect(() => {
    getVersion().then(v => appVersion = v).catch(() => appVersion = "unknown");
    if (!releasesLoaded) { releasesLoaded = true; loadReleases(); }
  });

  $effect(() => {
    loadServerInfo();
  });

  $effect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ downloaded: number; total: number | null }>("update-progress", (e) => {
      dlBytes = e.payload.downloaded; dlTotal = e.payload.total ?? null;
    }).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  });

  $effect(() => {
    let unlisten: (() => void) | undefined;
    listen("update-launching", () => { updatePhase = "launching"; })
      .then(fn => { unlisten = fn; });
    return () => unlisten?.();
  });

  async function loadReleases() {
    releasesLoading = true; releasesError = null;
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out after 10s")), 10_000));
      const all = await Promise.race([invoke<ReleaseInfo[]>("list_releases"), timeout]);
      releases = all.filter(r => typeof r.tag_name === "string" && r.tag_name.trim());
    } catch (e: any) {
      releasesError = e instanceof Error ? e.message : String(e);
    } finally { releasesLoading = false; }
  }

  async function loadServerInfo() {
    try {
      const [s, w] = await Promise.all([
        gql<{ aboutServer: AboutServer }>(GET_ABOUT_SERVER),
        gql<{ aboutWebUI: AboutWebUI }>(GET_ABOUT_WEBUI),
      ]);
      serverInfo = s.aboutServer;
      webuiInfo  = w.aboutWebUI;
    } catch {}
  }

  function stripV(v: string) { return v.replace(/^v/, ""); }
  function isCurrentVersion(tag: string) { return stripV(tag) === appVersion; }
  function parseSemver(v: string) { return stripV(v).split(".").map(Number); }
  function compareSemver(a: string, b: string) {
    const pa = parseSemver(a), pb = parseSemver(b);
    for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
    return 0;
  }

  const onLatestVersion = $derived((() => {
    if (releasesLoading || releases.length === 0 || !appVersion || appVersion === "…") return false;
    const sorted = releases.slice().sort((a, b) => compareSemver(a.tag_name, b.tag_name));
    return compareSemver(appVersion, sorted[0].tag_name) >= 0;
  })());

  function fmtDate(iso: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtBuildTime(unix: number | string) {
    if (!unix) return "";
    return new Date(Number(unix) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const units = ["B","KB","MB","GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
  }

  function fmtProgress() {
    return dlTotal ? `${fmtBytes(dlBytes)} / ${fmtBytes(dlTotal)} (${Math.round((dlBytes / dlTotal) * 100)}%)` : fmtBytes(dlBytes);
  }

  async function installUpdate(release: ReleaseInfo) {
    if (updatePhase === "downloading") return;
    targetTag = release.tag_name; updatePhase = "downloading"; updateError = null; dlBytes = 0; dlTotal = null;
    try {
      if (IS_WINDOWS) {
        await autoBackupAppData();
        try { await invoke("kill_server"); } catch {}
        await invoke("download_and_install_update", { tag: release.tag_name });
        updatePhase = "ready";
      } else {
        await openUrl(release.html_url);
        updatePhase = "idle"; targetTag = null;
      }
    } catch (e: any) {
      updateError = e instanceof Error ? e.message : String(e);
      updatePhase = "error";
    }
  }

  async function restartNow() { await invoke("restart_app"); }
  function cancelUpdate() { updatePhase = "idle"; updateError = null; targetTag = null; dlBytes = 0; dlTotal = null; }
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Moku</p>
    <div class="s-section-body">
      <div class="s-row" style="flex-direction:column;align-items:flex-start;gap:var(--sp-1)">
        <span class="s-label">A manga reader frontend for Suwayomi / Tachidesk.</span>
        <span class="s-desc">Built with Tauri + Svelte.</span>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Version</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Installed</span><span class="s-desc">v{appVersion}</span></div>
        <button class="s-btn" onclick={() => { releasesError = null; loadReleases(); }} disabled={releasesLoading}>
          {releasesLoading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {#if onLatestVersion}
        <div class="s-row">
          <span class="s-desc" style="color:var(--accent-fg)">✓ You're on the latest version.</span>
        </div>
      {/if}
      {#if updatePhase === "downloading" && IS_WINDOWS}
        <div class="s-update-progress">
          <div class="s-update-bar">
            <div class="s-update-fill" style="width:{dlTotal ? Math.round((dlBytes / dlTotal) * 100) : 0}%"></div>
          </div>
          <div class="s-update-labels">
            <span>Downloading {targetTag ?? "update"}…</span>
            <span>{fmtProgress()}</span>
          </div>
        </div>
      {/if}
      {#if updatePhase === "launching"}
        <div class="s-update-ready">
          <span class="s-update-ready-label">Launching installer for {targetTag}…</span>
        </div>
      {/if}
      {#if updatePhase === "ready"}
        <div class="s-update-ready">
          <span class="s-update-ready-label">{targetTag} downloaded — restart to finish installing.</span>
          <button class="s-btn s-btn-accent" onclick={restartNow}>Restart now</button>
          <button class="s-btn-icon" onclick={cancelUpdate} title="Dismiss">✕</button>
        </div>
      {/if}
      {#if updatePhase === "error"}
        <div class="s-row">
          <span class="s-desc" style="color:var(--color-error)">{updateError}</span>
          <button class="s-btn" onclick={cancelUpdate}>Dismiss</button>
        </div>
      {/if}
    </div>
  </div>

  {#if serverInfo}
    <div class="s-section">
      <p class="s-section-title">Server</p>
      <div class="s-section-body">
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Version</span>
            <span class="s-desc">
              {serverInfo.version}
              {#if serverInfo.buildType}
                <span class="s-release-badge">{serverInfo.buildType}</span>
              {/if}
            </span>
          </div>
        </div>
        {#if serverInfo.buildTime}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Built</span>
              <span class="s-desc">{fmtBuildTime(serverInfo.buildTime)}</span>
            </div>
          </div>
        {/if}
        {#if webuiInfo?.channel}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Channel</span>
              <span class="s-desc">{webuiInfo.channel}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="s-section">
    <p class="s-section-title">Releases</p>
    <div class="s-section-body">
      {#if releasesError}
        <p class="s-empty" style="color:var(--color-error)">{releasesError}</p>
      {:else if releasesLoading}
        <p class="s-empty">Fetching releases…</p>
      {:else if releases.length === 0}
        <p class="s-empty">No releases found.</p>
      {:else}
        <div class="s-release-scroll">
          {#each releases as release}
            {@const isCurrent    = isCurrentVersion(release.tag_name)}
            {@const isExpanded   = expandedTag === release.tag_name}
            {@const isTarget     = targetTag === release.tag_name}
            {@const isInstalling = isTarget && updatePhase === "downloading"}
            <div class="s-release-row" class:current={isCurrent}>
              <div class="s-release-header">
                <div class="s-release-meta">
                  <span class="s-release-tag">{release.tag_name}</span>
                  {#if isCurrent}<span class="s-release-badge">installed</span>{/if}
                  {#if release.published_at}<span class="s-release-date">{fmtDate(release.published_at)}</span>{/if}
                </div>
                <div class="s-btn-row">
                  {#if release.body.trim()}
                    <button class="s-btn" onclick={() => expandedTag = isExpanded ? null : release.tag_name}>
                      {isExpanded ? "Hide" : "Changelog"}
                    </button>
                  {/if}
                  {#if !isCurrent}
                    {#if IS_WINDOWS}
                      <button class="s-btn" class:s-btn-accent={!isInstalling}
                        disabled={updatePhase === "downloading"} onclick={() => installUpdate(release)}>
                        {isInstalling ? "Downloading…" : "Install"}
                      </button>
                    {:else}
                      <button class="s-btn" onclick={() => installUpdate(release)}>Open on GitHub</button>
                    {/if}
                  {/if}
                </div>
              </div>
              {#if isExpanded && release.body.trim()}
                <div class="s-release-body">
                  <pre class="s-release-body pre">{release.body.trim()}</pre>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Links</p>
    <div class="s-section-body">
      <div class="s-row" style="flex-direction:column;align-items:flex-start;gap:var(--sp-2)">
        <a href="https://github.com/moku-project/Moku" target="_blank" class="s-label" style="color:var(--accent-fg);text-decoration:none">GitHub →</a>
        <a href="https://discord.gg/Jq3pwuNqPp" target="_blank" class="s-label" style="color:var(--accent-fg);text-decoration:none">Discord →</a>
        {#if serverInfo?.github && serverInfo.github !== "https://github.com/moku-project/Moku"}
          <a href={serverInfo.github} target="_blank" class="s-label" style="color:var(--accent-fg);text-decoration:none">Suwayomi GitHub →</a>
        {/if}
        {#if serverInfo?.discord && serverInfo.discord !== "https://discord.gg/Jq3pwuNqPp"}
          <a href={serverInfo.discord} target="_blank" class="s-label" style="color:var(--accent-fg);text-decoration:none">Suwayomi Discord →</a>
        {/if}
      </div>
    </div>
  </div>

</div>