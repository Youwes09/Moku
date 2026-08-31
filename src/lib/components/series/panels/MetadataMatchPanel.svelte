<script lang="ts">
  import { X, Database, MagnifyingGlass, CircleNotch, ArrowSquareOut, LinkBreak, ArrowClockwise, Check } from "phosphor-svelte";
  import { tsunagu } from "$lib/server-adapters/tsunagu";
  import { addToast } from "$lib/state/notifications.svelte";
  import type { Manga } from "$lib/types";
  import type { MediaMetadata, MetadataCandidate } from "$lib/server-adapters/types";

  interface Props {
    manga:     Manga;
    mediaId:   string;
    metadata:  MediaMetadata | null;
    onChanged: (m: MediaMetadata | null) => void;
    onClose:   () => void;
  }

  let { manga, mediaId, metadata, onChanged, onClose }: Props = $props();

  let current  = $state<MediaMetadata | null>(metadata);
  let query    = $state(manga.title ?? "");
  let results  = $state<MetadataCandidate[]>([]);
  let searching = $state(false);
  let busy     = $state<string | null>(null);
  let error    = $state<string | null>(null);

  function providerLabel(p: string): string {
    if (p === "anilist") return "AniList";
    if (p === "mal" || p === "myanimelist") return "MAL";
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  async function search() {
    const q = query.trim();
    if (!q || searching) return;
    searching = true;
    error = null;
    try {
      results = await tsunagu.searchMetadata(q, manga.contentType);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      results = [];
    } finally {
      searching = false;
    }
  }

  async function apply(c: MetadataCandidate) {
    if (busy) return;
    busy = c.providerId;
    error = null;
    try {
      current = await tsunagu.applyMetadataMatch(mediaId, c.providerId, c.provider);
      onChanged(current);
      addToast({ kind: "success", title: "Metadata linked", body: c.title });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  async function refresh() {
    if (busy) return;
    busy = "refresh";
    error = null;
    try {
      current = await tsunagu.refreshMetadataMatch(mediaId);
      onChanged(current);
      addToast({ kind: "success", title: "Metadata refreshed" });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }

  async function unlink() {
    if (busy) return;
    busy = "unlink";
    error = null;
    try {
      await tsunagu.unlinkMetadata(mediaId);
      current = null;
      onChanged(null);
      addToast({ kind: "info", title: "Metadata unlinked" });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = null;
    }
  }
</script>

<div class="modal-overlay" role="presentation" onclick={onClose}>
  <div class="panel" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <span class="title"><Database size={12} weight="bold" /> Metadata Match</span>
      <button class="icon-x" onclick={onClose}><X size={14} weight="bold" /></button>
    </div>

    <div class="body">
      {#if current}
        <div class="current">
          <div class="current-info">
            <span class="current-provider">{providerLabel(current.provider)}</span>
            {#if current.confidence != null}
              <span class="current-conf">{Math.round(current.confidence * 100)}% match</span>
            {/if}
            {#if current.locked}<span class="current-lock">locked</span>{/if}
          </div>
          <div class="current-actions">
            <a class="mini-btn" href={current.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={12} weight="light" /> {providerLabel(current.provider)}</a>
            {#if current.malUrl}
              <a class="mini-btn" href={current.malUrl} target="_blank" rel="noreferrer"><ArrowSquareOut size={12} weight="light" /> MAL</a>
            {/if}
            <button class="mini-btn" onclick={refresh} disabled={!!busy}>
              {#if busy === "refresh"}<CircleNotch size={12} weight="light" class="anim-spin" />{:else}<ArrowClockwise size={12} weight="light" />{/if} Refresh
            </button>
            <button class="mini-btn danger" onclick={unlink} disabled={!!busy}>
              {#if busy === "unlink"}<CircleNotch size={12} weight="light" class="anim-spin" />{:else}<LinkBreak size={12} weight="light" />{/if} Unlink
            </button>
          </div>
        </div>
      {:else}
        <div class="unlinked">No metadata provider linked.</div>
      {/if}

      <div class="search-row">
        <div class="search-wrap">
          <MagnifyingGlass size={12} weight="light" class="search-icon" />
          <input
            class="search"
            placeholder="Search AniList…"
            bind:value={query}
            onkeydown={(e) => e.key === "Enter" && search()}
          />
        </div>
        <button class="search-btn" onclick={search} disabled={searching || !query.trim()}>
          {#if searching}<CircleNotch size={13} weight="light" class="anim-spin" />{:else}Search{/if}
        </button>
      </div>

      {#if error}<div class="err">{error}</div>{/if}

      <div class="results">
        {#each results as r (r.provider + ":" + r.providerId)}
          {@const active = current?.provider === r.provider && current?.providerId === r.providerId}
          <div class="result" class:result-active={active}>
            {#if r.coverUrl}<img class="result-cover" src={r.coverUrl} alt="" loading="lazy" />{/if}
            <div class="result-info">
              <span class="result-title">{r.title}</span>
              <span class="result-meta">
                {providerLabel(r.provider)}{r.startYear ? ` · ${r.startYear}` : ""}{r.status ? ` · ${r.status}` : ""}
              </span>
            </div>
            <a class="result-open" href={r.url} target="_blank" rel="noreferrer" title="Open"><ArrowSquareOut size={12} weight="light" /></a>
            <button class="result-link" class:on={active} onclick={() => apply(r)} disabled={!!busy}>
              {#if busy === r.providerId}<CircleNotch size={12} weight="light" class="anim-spin" />
              {:else if active}<Check size={12} weight="bold" /> Linked
              {:else}Link{/if}
            </button>
          </div>
        {:else}
          {#if !searching}<div class="empty">No results.</div>{/if}
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .modal-overlay { position: fixed; inset: 0; z-index: var(--z-settings); display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); animation: fade 0.12s ease both; }
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  .panel { width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; background: var(--bg-surface); border: 1px solid var(--border-base); border-radius: var(--radius-xl); overflow: hidden; }
  .head { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); }
  .title { display: flex; align-items: center; gap: 5px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--text-muted); }
  .icon-x { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); transition: color var(--t-fast), background var(--t-fast); }
  .icon-x:hover { color: var(--color-error); background: var(--bg-overlay); }
  .body { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); overflow-y: auto; }
  .current { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); border: 1px solid var(--accent-dim); background: var(--accent-muted); border-radius: var(--radius-md); }
  .current-info { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); }
  .current-provider { color: var(--accent-fg); text-transform: uppercase; }
  .current-conf { color: var(--text-muted); }
  .current-lock { color: var(--text-faint); text-transform: uppercase; }
  .current-actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
  .mini-btn { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-base); background: var(--bg-surface); color: var(--text-muted); cursor: pointer; transition: color var(--t-fast), border-color var(--t-fast); }
  .mini-btn:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
  .mini-btn:disabled { opacity: 0.5; cursor: default; }
  .mini-btn.danger:hover:not(:disabled) { color: var(--color-error); border-color: var(--color-error); }
  .unlinked { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .search-row { display: flex; gap: var(--sp-2); }
  .search-wrap { position: relative; flex: 1; display: flex; align-items: center; }
  .search-wrap :global(.search-icon) { position: absolute; left: 9px; color: var(--text-faint); pointer-events: none; }
  .search { flex: 1; background: var(--bg-base); border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 6px 10px 6px 26px; color: var(--text-primary); font-size: var(--text-sm); outline: none; transition: border-color var(--t-base); }
  .search:focus { border-color: var(--border-focus); }
  .search-btn { display: flex; align-items: center; justify-content: center; min-width: 64px; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 6px 12px; border-radius: var(--radius-md); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); cursor: pointer; transition: filter var(--t-base); }
  .search-btn:hover:not(:disabled) { filter: brightness(1.15); }
  .search-btn:disabled { opacity: 0.5; cursor: default; }
  .err { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-error); letter-spacing: var(--tracking-wide); }
  .results { display: flex; flex-direction: column; gap: 2px; }
  .result { display: flex; align-items: center; gap: var(--sp-3); padding: 6px var(--sp-2); border-radius: var(--radius-md); border: 1px solid transparent; transition: background var(--t-fast), border-color var(--t-fast); }
  .result:hover { background: var(--bg-raised); }
  .result-active { border-color: var(--accent-dim); background: var(--accent-muted); }
  .result-cover { width: 34px; height: 48px; object-fit: cover; border-radius: var(--radius-sm); flex-shrink: 0; background: var(--bg-raised); }
  .result-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
  .result-title { font-size: var(--text-sm); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .result-meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .result-open { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); color: var(--text-faint); flex-shrink: 0; transition: color var(--t-fast); }
  .result-open:hover { color: var(--text-primary); }
  .result-link { display: flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 10px; border-radius: var(--radius-sm); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); cursor: pointer; flex-shrink: 0; transition: filter var(--t-base); }
  .result-link:hover:not(:disabled) { filter: brightness(1.15); }
  .result-link:disabled { opacity: 0.5; cursor: default; }
  .result-link.on { background: rgba(107,143,107,0.2); border-color: var(--accent-fg); }
  .empty { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); padding: var(--sp-2); }
</style>
