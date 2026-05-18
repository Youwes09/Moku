<script lang="ts">
  import ThreeDCard from "@shared/manga/ThreeDCard.svelte";
  import { store, addToast } from "@store/state.svelte";
  import { cache } from "@core/cache/index";
  import { invoke } from "@tauri-apps/api/core";

  interface PerfSnapshot { cacheEntries: number; cacheKeys: string[]; oldestEntryMs: number | null; newestEntryMs: number | null; }

  let perfSnapshot    = $state<PerfSnapshot | null>(null);
  let splashTriggered = $state(false);
  let expOpen         = $state(false);
  let appVersion      = $state("…");
  let helloAvailable  = $state<boolean | null>(null);
  let helloBusy       = $state(false);

  $effect(() => {
    import("@tauri-apps/api/app").then(m => m.getVersion()).then(v => appVersion = v).catch(() => {});
    refreshPerfMetrics();
    invoke<boolean>("windows_hello_available").then(v => helloAvailable = v).catch(() => helloAvailable = false);
  });

  function refreshPerfMetrics() {
    let entries = 0, oldest: number | null = null, newest: number | null = null;
    const foundKeys: string[] = [];
    const checkKey = (k: string) => {
      const age = cache.ageOf(k);
      if (age !== undefined) {
        entries++;
        foundKeys.push(k);
        const ts = Date.now() - age;
        if (oldest === null || ts < oldest) oldest = ts;
        if (newest === null || ts > newest) newest = ts;
      }
    };
    ["library","sources","popular"].forEach(checkKey);
    ["Action","Romance","Fantasy","Comedy","Drama","Horror","Sci-Fi","Adventure","Thriller",
     "Isekai","Supernatural","Historical","Psychological","Sports","Mystery","Mecha",
     "Slice of Life","School Life","Martial Arts","Magic","Military"].forEach(g => checkKey(`genre:${g}`));
    perfSnapshot = { cacheEntries: entries, cacheKeys: foundKeys, oldestEntryMs: oldest, newestEntryMs: newest };
  }

  function fmtAge(ts: number | null) {
    if (ts === null) return "—";
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  function triggerSplash() {
    splashTriggered = true;
    setTimeout(() => splashTriggered = false, 200);
    (window as any).__mokuShowSplash?.();
  }

  async function testWindowsHello() {
    helloBusy = true;
    try {
      await invoke("windows_hello_authenticate", { reason: "Moku devtools test" });
      addToast({ kind: "success", title: "Windows Hello", body: "Verified successfully" });
    } catch (e: any) {
      addToast({ kind: "error", title: "Windows Hello", body: String(e) });
    } finally {
      helloBusy = false;
    }
  }
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Toasts</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Fire test toast</span><span class="s-desc">Triggers each kind with realistic content</span></div>
        <div class="s-dev-pill-group">
          {#each ([["success","S"],["error","E"],["info","I"],["download","D"]] as const) as [kind, label]}
            <button class="s-dev-pill {kind}" onclick={() => addToast({
              kind,
              title: kind === "success" ? "Library updated" : kind === "error" ? "Could not reach server" : kind === "info" ? "Already up to date" : "Download complete",
              body:  kind === "success" ? "3 new chapters across 2 series" : kind === "error" ? "Connection refused on port 4567" : kind === "info" ? "No new chapters found" : "Berserk · Ch. 372 ready to read",
            })}>{label}</button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Previews</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Idle splash</span><span class="s-desc">Dismiss with any click or key</span></div>
        <button class="s-btn" class:s-btn-accent={splashTriggered} onclick={triggerSplash}>Show</button>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Biometrics</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Windows Hello</span>
          <span class="s-desc">Available: {helloAvailable === null ? "…" : helloAvailable ? "yes" : "no"}</span>
        </div>
        <button class="s-btn" disabled={!helloAvailable || helloBusy} onclick={testWindowsHello}>
          {helloBusy ? "…" : "Test"}
        </button>
      </div>
    </div>
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => expOpen = !expOpen} aria-expanded={expOpen}>
      <span class="s-label">Experimental</span>
      <svg class="s-collapsible-caret" class:open={expOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if expOpen}
      <div class="s-collapsible-body">
        <div class="s-row" style="flex-direction:column;align-items:flex-start;gap:var(--sp-3)">
          <span class="s-desc">3D tilt cards — hover to preview</span>
          <div style="display:flex;gap:var(--sp-3)">
            {#each [{ title: "Berserk", sub: "Ch. 372", hue: "265" },{ title: "Vinland Saga", sub: "Ch. 208", hue: "200" },{ title: "Dungeon Meshi", sub: "Ch. 97", hue: "140" }] as card}
              <ThreeDCard>
                <div style="width:72px;height:100px;border-radius:var(--radius-md);background:hsl({card.hue},40%,18%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:var(--sp-2)">
                  <span style="font-size:var(--text-2xs);color:var(--text-secondary);text-align:center;line-height:1.2">{card.title}</span>
                  <span style="font-size:10px;color:var(--text-faint)">{card.sub}</span>
                </div>
              </ThreeDCard>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="s-section">
    <p class="s-section-title">Runtime</p>
    <div class="s-section-body">
      <div class="s-dev-grid">
        <span class="s-dev-key">Filter</span>  <span class="s-dev-val">{store.libraryFilter}</span>
        <span class="s-dev-key">Folders</span> <span class="s-dev-val">{store.categories.filter(c => c.id !== 0).map(c => c.name).join(", ") || "none"}</span>
        <span class="s-dev-key">History</span> <span class="s-dev-val">{store.history.length} entries</span>
        <span class="s-dev-key">Cache</span>   <span class="s-dev-val">{perfSnapshot?.cacheEntries ?? "—"} entries</span>
        <span class="s-dev-key">Toasts</span> <span class="s-dev-val">{store.toasts.length} queued</span>
        <span class="s-dev-key">Version</span> <span class="s-dev-val">{appVersion} · {import.meta.env.MODE}</span>
      </div>
      <div class="s-row">
        <div class="s-row-info">
          {#if perfSnapshot && perfSnapshot.cacheEntries > 0}
            <span class="s-desc">{perfSnapshot.cacheKeys.join(", ")}</span>
            <span class="s-desc">Oldest: {fmtAge(perfSnapshot.oldestEntryMs)} · Newest: {fmtAge(perfSnapshot.newestEntryMs)}</span>
          {/if}
        </div>
        <button class="s-btn-icon" onclick={refreshPerfMetrics} title="Refresh cache stats">↺</button>
      </div>
    </div>
  </div>

</div>