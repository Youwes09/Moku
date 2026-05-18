<script lang="ts">
  import { CircleNotch, CaretRight, CaretDown, Books } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import type { Extension } from "@types/index";

  type SourceEntry = { id: string; displayName: string };

  interface Props {
    base:         string;
    primary:      Extension;
    variants:     Extension[];
    expanded:     boolean;
    working:      Set<string>;
    anims:        boolean;
    sources:      SourceEntry[];
    libraryCount: number;
    onToggle:     (base: string) => void;
    onMutate:     (pkgName: string, op: "install" | "update" | "uninstall") => void;
    onLibrary:    (pkgName: string, extensionName: string, iconUrl: string) => void;
  }

  let { base, primary, variants, expanded, working, anims, sources, libraryCount, onToggle, onMutate, onLibrary }: Props = $props();

  const clickable = $derived(primary.isInstalled);

  const hasVariants = $derived(variants.length > 0);
</script>

<div class="group">
  <svelte:element
    this={clickable ? "button" : "div"}
    class="row"
    class:row-clickable={clickable}
    onclick={clickable ? () => onLibrary(primary.pkgName, base, primary.iconUrl) : undefined}
  >
    <Thumbnail
      src={primary.iconUrl}
      alt={primary.name}
      class="icon"
      onerror={(e) => ((e.target as HTMLImageElement).style.display = "none")}
    />
    <div class="info">
      <span class="name">{base}</span>
      <span class="meta">
        <span class="lang-tag">{primary.lang.toUpperCase()}</span>
        {#if primary.isInstalled}
          <span class="lib-badge" class:lib-badge-empty={libraryCount === 0}>
            <Books size={10} weight={libraryCount > 0 ? "fill" : "regular"} />
            {libraryCount > 0 ? libraryCount : 0}
            
          </span>
        {/if}
        v{primary.versionName}
      </span>
    </div>

    {#if working.has(primary.pkgName)}
      <CircleNotch size={14} weight="light" class="anim-spin" style="color:var(--text-faint)" />
    {:else if primary.hasUpdate}
      <div class="row-actions">
        <button class="action-btn"     onclick={(e) => { e.stopPropagation(); onMutate(primary.pkgName, "update"); }}>Update</button>
        <button class="action-btn-dim" onclick={(e) => { e.stopPropagation(); onMutate(primary.pkgName, "uninstall"); }}>Remove</button>
      </div>
    {:else if primary.isInstalled}
      <div class="row-actions">
        <button class="action-btn-dim" onclick={(e) => { e.stopPropagation(); onMutate(primary.pkgName, "uninstall"); }}>Remove</button>
      </div>
    {:else}
      <button class="action-btn" onclick={() => onMutate(primary.pkgName, "install")}>Install</button>
    {/if}

    {#if hasVariants}
      <button class="expand-btn" onclick={(e) => { e.stopPropagation(); onToggle(base); }} title="{variants.length + 1} languages">
        {#if expanded}<CaretDown size={12} weight="light" />{:else}<CaretRight size={12} weight="light" />{/if}
        <span class="expand-count">{variants.length + 1}</span>
      </button>
    {/if}
  </svelte:element>

  {#if expanded && hasVariants}
    <div class="variants" class:variants-anim={anims}>
      {#each variants as v}
        <div class="variant-row">
          <span class="lang-tag">{v.lang.toUpperCase()}</span>
          <span class="variant-name">{v.name}</span>
          <span class="variant-version">v{v.versionName}</span>
          {#if v.hasUpdate}<span class="update-badge-small">↑</span>{/if}
          <div class="variant-actions">
            {#if working.has(v.pkgName)}
              <CircleNotch size={14} weight="light" class="anim-spin" style="color:var(--text-faint)" />
            {:else if v.hasUpdate}
              <button class="action-btn" onclick={() => onMutate(v.pkgName, "update")}>Update</button>
            {:else if v.isInstalled}
              <button class="action-btn-dim" onclick={() => onMutate(v.pkgName, "uninstall")}>Remove</button>
            {:else}
              <button class="action-btn" onclick={() => onMutate(v.pkgName, "install")}>Install</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .group { display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: var(--sp-3); padding: 8px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; transition: background var(--t-fast), border-color var(--t-fast); width: 100%; text-align: left; background: none; }
  .row:hover { background: var(--bg-raised); border-color: var(--border-dim); }
  .row-clickable { cursor: pointer; }
  :global(.icon) { width: 32px; height: 32px; border-radius: var(--radius-md); object-fit: cover; flex-shrink: 0; background: var(--bg-raised); }
  .info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
  .name { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .lang-tag { background: var(--bg-overlay); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); padding: 1px 5px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted); letter-spacing: var(--tracking-wider); }
  .lib-badge { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 2px 7px; border-radius: var(--radius-sm); border: 1px solid var(--accent-dim); background: var(--accent-muted); color: var(--accent-fg); flex-shrink: 0; }
  .lib-badge-empty { border-color: var(--border-dim); background: var(--bg-overlay); color: var(--text-faint); }
  .update-badge-small { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--accent-fg); flex-shrink: 0; }
  .row-actions { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
  .action-btn { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 4px 10px; border-radius: var(--radius-md); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); cursor: pointer; flex-shrink: 0; transition: filter var(--t-base); }
  .action-btn:hover { filter: brightness(1.1); }
  .action-btn-dim { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 4px 10px; border-radius: var(--radius-md); background: none; color: var(--text-faint); border: 1px solid var(--border-dim); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base); }
  .action-btn-dim:hover { color: var(--color-error); border-color: var(--color-error); }
  .expand-btn { display: flex; align-items: center; gap: 3px; padding: 4px 6px; border-radius: var(--radius-sm); color: var(--text-faint); flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .expand-btn:hover { color: var(--text-muted); background: var(--bg-overlay); }
  .expand-count { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); }
  .variants { display: flex; flex-direction: column; gap: 1px; margin: 1px 0 2px calc(32px + var(--sp-3) + var(--sp-3)); padding-left: var(--sp-3); border-left: 1px solid var(--border-dim); }
  .variants-anim { animation: slideDown 0.18s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  .variant-row { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2); border-radius: var(--radius-md); transition: background var(--t-fast); }
  .variant-row:hover { background: var(--bg-raised); }
  .variant-name { flex: 1; font-size: var(--text-sm); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .variant-version { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); flex-shrink: 0; }
  .variant-actions { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
</style>