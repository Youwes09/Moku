<script lang="ts">
  import { onMount } from "svelte";
  import { MagnifyingGlass, CircleNotch, CaretDown, CaretRight } from "phosphor-svelte";
  import { gql } from "@api/client";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import { GET_SOURCES } from "@api/queries/extensions";
  import { store } from "@store/state.svelte";
  import type { Source } from "@types/index";

  let sources:  Source[]   = $state([]);
  let loading              = $state(true);
  let lang                 = $state("all");
  let search               = $state("");
  let expanded             = $state(new Set<string>());

  onMount(() => {
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => { sources = d.sources.nodes; })
      .catch(console.error)
      .finally(() => { loading = false; });
  });

  const langs    = $derived(["all", ...Array.from(new Set(sources.map((s) => s.lang))).sort()]);
  const filtered = $derived(sources.filter((src) => {
    if (src.id === "0") return false;
    const matchLang   = lang === "all" || src.lang === lang;
    const matchSearch = src.name.toLowerCase().includes(search.toLowerCase())
                     || src.displayName.toLowerCase().includes(search.toLowerCase());
    return matchLang && matchSearch;
  }));

  const groups = $derived.by(() => {
    const map = new Map<string, { name: string; icon: string; sources: Source[] }>();
    for (const src of filtered) {
      if (!map.has(src.name)) map.set(src.name, { name: src.name, icon: src.iconUrl, sources: [] });
      map.get(src.name)!.sources.push(src);
    }
    return Array.from(map.values());
  });

  function toggleGroup(name: string) {
    const next = new Set(expanded);
    next.has(name) ? next.delete(name) : next.add(name);
    expanded = next;
  }
</script>

<div class="root">
  <div class="header">
    <h1 class="heading">Sources</h1>
    <div class="search-wrap">
      <MagnifyingGlass size={12} class="search-icon" weight="light" />
      <input class="search" placeholder="Search" bind:value={search} />
    </div>
  </div>

  <div class="content">
    <div class="lang-row">
      {#each langs as l}
        <button class="lang-btn" class:active={lang === l} onclick={() => lang = l}>
          {l === "all" ? "All" : l.toUpperCase()}
        </button>
      {/each}
    </div>

    {#if loading}
      <div class="empty"><CircleNotch size={16} weight="light" class="anim-spin" style="color:var(--text-faint)" /></div>
    {:else if groups.length === 0}
      <div class="empty">No sources found.</div>
    {:else}
      <div class="list">
        {#each groups as g}
          {@const single = g.sources.length === 1}
          {@const open   = expanded.has(g.name)}
          <div>
            <button class="row" onclick={() => single ? store.activeSource = g.sources[0] : toggleGroup(g.name)}>
              <Thumbnail src={g.icon} alt={g.name} class="icon" onerror={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
              <div class="info">
                <span class="name">{g.name}</span>
                <span class="meta">{single ? `${g.sources[0].lang.toUpperCase()}${g.sources[0].isNsfw ? " · NSFW" : ""}` : `${g.sources.length} languages`}</span>
              </div>
              <span class="arrow">
                {#if single}→{:else if open}<CaretDown size={12} weight="light" />{:else}<CaretRight size={12} weight="light" />{/if}
              </span>
            </button>
            {#if !single && open}
              {#each g.sources as src}
                <button class="row row-indented" onclick={() => store.activeSource = src}>
                  <div class="indent-spacer"></div>
                  <div class="info"><span class="name">{src.lang.toUpperCase()}{src.isNsfw ? " · NSFW" : ""}</span></div>
                  <span class="arrow">→</span>
                </button>
              {/each}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .root { display: flex; flex-direction: column; height: 100%; overflow: hidden; animation: fadeIn 0.14s ease both; }
  .content { flex: 1; overflow-y: auto; padding: var(--sp-4) var(--sp-6) var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-3); }
  .header { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-4) var(--sp-6); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .heading { font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-normal); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-wrap :global(.search-icon) { position: absolute; left: 9px; color: var(--text-faint); pointer-events: none; }
  .search { background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 5px 10px 5px 26px; color: var(--text-primary); font-size: var(--text-sm); width: 180px; outline: none; transition: border-color var(--t-base); }
  .search::placeholder { color: var(--text-faint); }
  .search:focus { border-color: var(--border-strong); }
  .lang-row { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
  .lang-btn { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); padding: 3px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .lang-btn:hover { color: var(--text-muted); border-color: var(--border-strong); }
  .lang-btn.active { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
  .list { display: flex; flex-direction: column; gap: 1px; }
  .row { display: flex; align-items: center; gap: var(--sp-3); padding: 9px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; background: none; text-align: left; width: 100%; cursor: pointer; transition: background var(--t-fast), border-color var(--t-fast); }
  .row:hover { background: var(--bg-raised); border-color: var(--border-dim); }
  .row-indented { padding-left: var(--sp-5); }
  .indent-spacer { width: 32px; flex-shrink: 0; }
  :global(.icon) { width: 32px; height: 32px; border-radius: var(--radius-md); object-fit: cover; flex-shrink: 0; background: var(--bg-raised); }
  .info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .name { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .arrow { display: flex; align-items: center; font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); flex-shrink: 0; opacity: 0; transition: opacity var(--t-base); }
  .row:hover .arrow { opacity: 1; }
  .empty { display: flex; align-items: center; justify-content: center; height: 160px; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>