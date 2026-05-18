<script lang="ts">
  import { store, updateSettings } from "@store/state.svelte";
  import { cache } from "@core/cache";

  interface PerfSnapshot {
    cacheEntries:  number;
    cacheKeys:     string[];
    oldestEntryMs: number | null;
    newestEntryMs: number | null;
  }

  let perfSnapshot = $state<PerfSnapshot | null>(null);
  let clearing     = $state(false);
  let cleared      = $state(false);

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

  function fmtAge(ts: number | null): string {
    if (ts === null) return "—";
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  function handleClearCache() {
    clearing = true;
    caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {})
      .finally(() => { clearing = false; cleared = true; setTimeout(() => cleared = false, 2500); refreshPerfMetrics(); });
  }

  $effect(() => { refreshPerfMetrics(); });
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Render Limit</p>
    <div class="s-section-body">
      <div class="s-slider-row">
        <div class="s-row-info">
          <span class="s-label">Items per page</span>
          <span class="s-desc">Lower = faster on large libraries</span>
        </div>
        <div class="s-stepper">
          <button class="s-step-btn" onclick={() => updateSettings({ renderLimit: Math.max(12, (store.settings.renderLimit ?? 48) - 12) })} disabled={(store.settings.renderLimit ?? 48) <= 12}>−</button>
          <span class="s-step-val">{store.settings.renderLimit ?? 48}</span>
          <button class="s-step-btn" onclick={() => updateSettings({ renderLimit: Math.min(200, (store.settings.renderLimit ?? 48) + 12) })} disabled={(store.settings.renderLimit ?? 48) >= 200}>+</button>
        </div>
      </div>
      <div class="s-presets">
        {#each [12, 24, 48, 96, 200] as v}
          <button class="s-preset" class:active={(store.settings.renderLimit ?? 48) === v} onclick={() => updateSettings({ renderLimit: v })}>{v}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Rendering</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">GPU acceleration</span><span class="s-desc">Uses the GPU for rendering; disable if you see visual glitches</span></div>
        <button role="switch" aria-checked={store.settings.gpuAcceleration} aria-label="GPU acceleration" class="s-toggle" class:on={store.settings.gpuAcceleration} onclick={() => updateSettings({ gpuAcceleration: !store.settings.gpuAcceleration })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Idle / Splash Screen</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Animated card background</span><span class="s-desc">Shows cover art cards floating in the background on the idle screen</span></div>
        <button role="switch" aria-checked={store.settings.splashCards ?? true} aria-label="Animated card background" class="s-toggle" class:on={store.settings.splashCards ?? true} onclick={() => updateSettings({ splashCards: !(store.settings.splashCards ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Session Cache</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Cache entries</span>
          <span class="s-desc">In-memory, cleared on restart</span>
        </div>
        <div class="s-btn-row">
          <span class="s-step-val">{perfSnapshot?.cacheEntries ?? 0} entries</span>
          <button class="s-btn-icon" onclick={refreshPerfMetrics} title="Refresh">↺</button>
        </div>
      </div>
      {#if perfSnapshot && perfSnapshot.cacheEntries > 0}
        <div class="s-row">
          <div class="s-row-info"><span class="s-label">Oldest entry</span></div>
          <span class="s-step-val">{fmtAge(perfSnapshot.oldestEntryMs)}</span>
        </div>
        <div class="s-row">
          <div class="s-row-info"><span class="s-label">Newest entry</span></div>
          <span class="s-step-val">{fmtAge(perfSnapshot.newestEntryMs)}</span>
        </div>
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Cached keys</span>
            <span class="s-desc">{perfSnapshot.cacheKeys.join(", ")}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Cache</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Image cache</span><span class="s-desc">Webview page image cache</span></div>
        <button class="s-btn s-btn-danger" onclick={handleClearCache} disabled={clearing}>
          {cleared ? "Cleared" : clearing ? "Clearing…" : "Clear"}
        </button>
      </div>
    </div>
  </div>

</div>