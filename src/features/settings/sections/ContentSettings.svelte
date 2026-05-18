<script lang="ts">
  import { thumbUrl, gql } from "@api/client";
  import { GET_SOURCES }   from "@api/queries/index";
  import { store, updateSettings } from "@store/state.svelte";
  import type { ContentLevel } from "@types/settings";
  import type { Source } from "@types";

  let contentSources:        Source[] = $state([]);
  let contentSourcesLoading: boolean  = $state(false);
  let sourceSearch                    = $state("");

  $effect(() => {
    if (store.settings.sourceOverridesEnabled && contentSources.length === 0 && !contentSourcesLoading)
      loadContentSources();
  });

  async function loadContentSources() {
    contentSourcesLoading = true;
    try {
      const d = await gql<{ sources: { nodes: Source[] } }>(GET_SOURCES);
      contentSources = d.sources.nodes.filter(s => s.id !== "0");
    } catch (e) { console.error(e); }
    finally { contentSourcesLoading = false; }
  }

  function toggleSourceAllowed(ids: string[]) {
    const allowed = store.settings.nsfwAllowedSourceIds ?? [];
    const blocked = store.settings.nsfwBlockedSourceIds ?? [];
    const allAllowed = ids.every(id => allowed.includes(id));
    if (allAllowed) {
      updateSettings({ nsfwAllowedSourceIds: allowed.filter(x => !ids.includes(x)) });
    } else {
      updateSettings({
        nsfwAllowedSourceIds: [...allowed.filter(x => !ids.includes(x)), ...ids],
        nsfwBlockedSourceIds: blocked.filter(x => !ids.includes(x)),
      });
    }
  }

  function toggleSourceBlocked(ids: string[]) {
    const allowed = store.settings.nsfwAllowedSourceIds ?? [];
    const blocked = store.settings.nsfwBlockedSourceIds ?? [];
    const allBlocked = ids.every(id => blocked.includes(id));
    if (allBlocked) {
      updateSettings({ nsfwBlockedSourceIds: blocked.filter(x => !ids.includes(x)) });
    } else {
      updateSettings({
        nsfwBlockedSourceIds: [...blocked.filter(x => !ids.includes(x)), ...ids],
        nsfwAllowedSourceIds: allowed.filter(x => !ids.includes(x)),
      });
    }
  }

  interface ContentSourceGroup { name: string; iconUrl: string; isNsfw: boolean; sources: Source[]; }

  const contentSourcesFiltered = $derived.by(() => {
    const q = sourceSearch.trim().toLowerCase();
    const filtered = q
      ? contentSources.filter(s => s.displayName.toLowerCase().includes(q) || s.lang.toLowerCase().includes(q))
      : contentSources;
    const map = new Map<string, ContentSourceGroup>();
    for (const s of filtered) {
      if (!map.has(s.name)) map.set(s.name, { name: s.name, iconUrl: s.iconUrl, isNsfw: s.isNsfw, sources: [] });
      map.get(s.name)!.sources.push(s);
    }
    return Array.from(map.values());
  });

  const LEVELS: { value: ContentLevel; label: string; desc: string }[] = [
    { value: "strict",       label: "Strict",       desc: "Hides all adult, sexual, and graphic violent content" },
    { value: "moderate",     label: "Moderate",     desc: "Allows violence and gore, filters sexual content" },
    { value: "unrestricted", label: "Unrestricted", desc: "No content filtering applied" },
  ];
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Content Level</p>
    <div class="s-section-body">
      <div class="s-row" style="border-bottom: none; padding-bottom: 0;">
        <span class="s-desc">Controls what content is visible across library, search, and discover.</span>
      </div>
      <div class="s-level-group">
        {#each LEVELS as lvl}
          {@const active = store.settings.contentLevel === lvl.value}
          <button class="s-level-btn" class:active onclick={() => updateSettings({ contentLevel: lvl.value })}>
            <span class="s-level-dot" class:active></span>
            <div class="s-level-text">
              <span class="s-level-label">{lvl.label}</span>
              <span class="s-level-desc">{lvl.desc}</span>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Source Overrides</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info">
          <span class="s-label">Per-source overrides</span>
          <span class="s-desc">Allow a source through even if flagged NSFW, or always block it. Allowed sources still respect the active content level.</span>
        </div>
        <button
          role="switch"
          aria-checked={store.settings.sourceOverridesEnabled}
          aria-label="Enable source overrides"
          class="s-toggle"
          class:on={store.settings.sourceOverridesEnabled}
          onclick={() => updateSettings({ sourceOverridesEnabled: !store.settings.sourceOverridesEnabled })}
        ><span class="s-toggle-thumb"></span></button>
      </label>

      {#if store.settings.sourceOverridesEnabled}
        <div class="s-search-wrap">
          <input class="s-input full" placeholder="Filter sources…" bind:value={sourceSearch} />
        </div>
        {#if contentSourcesLoading}
          <p class="s-empty">Loading sources…</p>
        {:else if contentSources.length === 0}
          <p class="s-empty">No sources found — check your server connection.</p>
        {:else}
          <div class="s-source-list">
            {#each contentSourcesFiltered as group (group.name)}
              {@const ids       = group.sources.map(s => s.id)}
              {@const allowed   = store.settings.nsfwAllowedSourceIds ?? []}
              {@const blocked   = store.settings.nsfwBlockedSourceIds ?? []}
              {@const isAllowed = ids.every(id => allowed.includes(id))}
              {@const isBlocked = ids.every(id => blocked.includes(id))}
              <div class="s-source-row" class:allowed={isAllowed} class:blocked={isBlocked}>
                <img src={thumbUrl(group.iconUrl)} alt="" class="s-source-icon" loading="lazy" decoding="async" />
                <div class="s-source-info">
                  <span class="s-source-name">{group.name}</span>
                  <span class="s-source-meta">
                    {group.sources[0].isNsfw ? "NSFW · " : ""}{group.sources.length > 1 ? `${group.sources.length} languages` : group.sources[0].lang.toUpperCase()}
                  </span>
                </div>
                <div class="s-source-actions">
                  <button class="s-source-action-btn" class:allow={isAllowed} onclick={() => toggleSourceAllowed(ids)}>Allow</button>
                  <button class="s-source-action-btn" class:block={isBlocked} onclick={() => toggleSourceBlocked(ids)}>Block</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>

</div>

<style>
  .s-level-group {
    display: flex;
    flex-direction: column;
    padding: var(--sp-2) var(--sp-4) var(--sp-3);
    gap: var(--sp-1);
  }

  .s-level-btn {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 10px var(--sp-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-dim);
    background: var(--bg-surface);
    cursor: pointer;
    text-align: left;
    transition: border-color var(--t-base), background var(--t-base);
    width: 100%;
  }
  .s-level-btn:hover  { background: var(--bg-overlay); border-color: var(--border-strong); }
  .s-level-btn.active { background: var(--accent-muted); border-color: var(--accent-dim); }

  .s-level-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--border-strong);
    background: none;
    flex-shrink: 0;
    transition: border-color var(--t-base), background var(--t-base);
  }
  .s-level-dot.active { border-color: var(--accent); background: var(--accent); }

  .s-level-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .s-level-label {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: 1.3;
  }
  .s-level-btn.active .s-level-label { color: var(--accent-fg); }

  .s-level-desc {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-snug);
  }
  .s-level-btn.active .s-level-desc { color: var(--accent-fg); opacity: 0.7; }
</style>