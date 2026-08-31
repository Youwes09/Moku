<script lang="ts">
  import { onMount } from "svelte";
  import {
    X, MagnifyingGlass, ArrowSquareOut, CircleNotch, GearSix, ArrowsClockwise,
  } from "phosphor-svelte";
  import { tsunagu } from "$lib/server-adapters/tsunagu";
  import { app } from "$lib/state/app.svelte";
  import { addToast } from "$lib/state/notifications.svelte";
  import { trackerState, statusesFor } from "$lib/state/trackers.svelte";
  import { trackingState } from "$lib/state/tracking.svelte";
  import Thumbnail from "$lib/components/shared/manga/Thumbnail.svelte";
  import ModalBlur from "$lib/components/shared/ui/ModalBlur.svelte";
  import TrackerLogo from "$lib/components/tracking/TrackerLogo.svelte";
  import type { Manga } from "$lib/types";
  import type { TrackLink, TrackSearchResult } from "$lib/server-adapters/types";

  interface Props {
    mediaId:   string;
    manga:     Manga | null;
    links:     TrackLink[];
    onClose:   () => void;
    onChanged: () => void;
  }
  let { mediaId, manga, links, onClose, onChanged }: Props = $props();

  type TabId = "records" | string;

  let local          = $state<TrackLink[]>([...links]);
  let activeTab      = $state<TabId>("records");
  let refreshing     = $state(true);
  let dirty          = $state(false);
  let busyLink       = $state<string | null>(null);
  let binding        = $state(false);
  let syncing        = $state<string | null>(null);

  let searchQuery    = $state(manga?.title ?? "");
  let searchResults  = $state<TrackSearchResult[]>([]);
  let searching      = $state(false);
  let searchInited   = $state<Set<string>>(new Set());

  let editingId      = $state<string | null>(null);
  let chapterDraft   = $state(0);

  let confirmUnlinkId = $state<string | null>(null);

  const connected = $derived(trackerState.list.filter((t) => t.isLoggedIn));
  const linkFor   = (key: string) => local.find((l) => l.trackerKey === key);

  onMount(() => {
    trackerState.load();
    tsunagu.libraryEntry(mediaId)
      .then((e) => { if (!dirty && e?.trackLinks) local = e.trackLinks; })
      .catch(() => {})
      .finally(() => { refreshing = false; });
  });

  $effect(() => {
    const tab = activeTab;
    if (tab === "records" || searchInited.has(tab)) return;
    searchQuery  = manga?.title ?? "";
    searchInited = new Set([...searchInited, tab]);
    void runSearch(tab, searchQuery);
  });

  function autoFocus(node: HTMLElement) { setTimeout(() => node.focus(), 50); }

  function relTime(iso: string | null): string {
    if (!iso) return "never";
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60_000) return "just now";
    const m = Math.floor(d / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  let searchTimer: ReturnType<typeof setTimeout>;
  function onSearchInput() {
    clearTimeout(searchTimer);
    if (activeTab === "records") return;
    const key = activeTab;
    if (!searchQuery.trim()) { searchResults = []; return; }
    searchTimer = setTimeout(() => runSearch(key, searchQuery), 400);
  }

  async function runSearch(key: string, query: string) {
    if (!query.trim()) return;
    searching = true;
    searchResults = [];
    try {
      searchResults = await tsunagu.trackSearch(key, query.trim(), manga?.contentType);
    } catch (e: any) {
      addToast({ kind: "error", title: "Search failed", body: e?.message ?? String(e) });
    } finally {
      searching = false;
    }
  }

  async function bind(key: string, r: TrackSearchResult) {
    binding = true;
    dirty = true;
    try {
      const link = await tsunagu.bindTrack(mediaId, key, r.remoteId);
      local = [...local.filter((l) => l.trackerKey !== key), link];
      searchResults = [];
      activeTab = "records";
      onChanged();
      trackingState.loadAll(true).catch(() => {});
      addToast({ kind: "success", title: "Now tracking", body: link.title });
    } catch (e: any) {
      addToast({ kind: "error", title: "Couldn't link", body: e?.message ?? String(e) });
    } finally {
      binding = false;
    }
  }

  async function unbind(link: TrackLink) {
    busyLink = link.id;
    confirmUnlinkId = null;
    dirty = true;
    try {
      await tsunagu.unbindTrack(link.id);
      local = local.filter((l) => l.id !== link.id);
      onChanged();
      trackingState.loadAll(true).catch(() => {});
      addToast({ kind: "info", title: "Unlinked" });
    } catch (e: any) {
      addToast({ kind: "error", title: "Couldn't unlink", body: e?.message ?? String(e) });
    } finally {
      busyLink = null;
    }
  }

  async function patch(link: TrackLink, p: { status?: number; score?: number; lastChapterRead?: number }) {
    busyLink = link.id;
    dirty = true;
    try {
      const updated = await tsunagu.updateTrack(link.id, p);
      local = local.map((l) => (l.id === updated.id ? updated : l));
      onChanged();
      trackingState.loadAll(true).catch(() => {});
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message ?? String(e) });
    } finally {
      busyLink = null;
    }
  }

  async function resync(link: TrackLink) {
    syncing = link.id;
    dirty = true;
    try {
      const updated = await tsunagu.resyncTrack(link.id);
      local = local.map((l) => (l.id === updated.id ? updated : l));
      onChanged();
      trackingState.loadAll(true).catch(() => {});
      addToast({ kind: "success", title: "Synced", body: `${updated.lastChapterRead}/${updated.totalChapters || "?"}` });
    } catch (e: any) {
      addToast({ kind: "error", title: "Sync failed", body: e?.message ?? String(e) });
    } finally {
      syncing = null;
    }
  }

  function openEditor(link: TrackLink) {
    editingId = link.id;
    chapterDraft = link.lastChapterRead;
  }
  function cancelEditor() { editingId = null; }

  async function submitChapter(link: TrackLink) {
    const val = Math.max(0, chapterDraft);
    editingId = null;
    if (val === link.lastChapterRead) return;
    await patch(link, { lastChapterRead: val });
  }

  function openSettings() {
    onClose();
    app.setSettingsOpen(true);
  }
</script>

<svelte:window onkeydown={(e) => {
  if (e.key !== "Escape") return;
  if (confirmUnlinkId !== null) confirmUnlinkId = null;
  else if (editingId !== null) editingId = null;
  else onClose();
}} />

<ModalBlur blur={4} dim={0.68} />
<div class="backdrop" role="presentation" onmousedown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Tracking">

    <div class="modal-header">
      <div class="header-left">
        <span class="modal-title">Tracking</span>
        {#if manga?.title}<span class="modal-subtitle">{manga.title}</span>{/if}
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close"><X size={14} weight="light" /></button>
    </div>

    {#if (trackerState.loading || refreshing) && trackerState.list.length === 0}
      <div class="state-body">
        <CircleNotch size={18} weight="light" class="anim-spin" style="color:var(--text-faint)" />
      </div>

    {:else if connected.length === 0}
      <div class="state-body">
        <p class="state-text">No trackers connected.</p>
        <button class="link-btn" onclick={openSettings}><GearSix size={12} weight="regular" /> Open Tracking settings</button>
      </div>

    {:else}
      <div class="tabs">
        <button class="tab" class:tab-active={activeTab === "records"} onclick={() => (activeTab = "records")}>
          My List
          {#if local.length > 0}<span class="tab-badge">{local.length}</span>{/if}
        </button>
        {#each connected as t (t.key)}
          {@const rec = linkFor(t.key)}
          <button class="tab" class:tab-active={activeTab === t.key}
            onclick={() => { activeTab = t.key; searchResults = []; }}>
            <TrackerLogo trackerKey={t.key} iconUrl={t.iconUrl} size={13} />
            {t.name}
            {#if rec}<span class="tab-dot"></span>{/if}
          </button>
        {/each}
      </div>

      {#if activeTab === "records"}
        <div class="tab-body">
          {#if local.length === 0}
            <div class="state-body">
              <p class="state-text">Not tracking yet.</p>
              <p class="state-hint">Pick a tracker tab above to search and link it.</p>
            </div>
          {:else}
            {#each connected as t (t.key)}
              {@const link = linkFor(t.key)}
              {#if link}
                {@const numericScore = t.scoreOptions.length > 0 && t.scoreOptions.every((o) => /^\d+(\.\d+)?$/.test(o))}
                {@const isBusy = busyLink === link.id}
                {@const isEdit = editingId === link.id}
                {@const pct = link.totalChapters > 0 ? Math.min(100, (link.lastChapterRead / link.totalChapters) * 100) : null}

                <div class="record-card" class:record-busy={isBusy}>
                  <div class="record-head">
                    <div class="record-source">
                      <TrackerLogo trackerKey={t.key} iconUrl={t.iconUrl} size={14} />
                      <span class="record-source-name">{t.name}</span>
                      {#if link.url}
                        <a href={link.url} target="_blank" rel="noreferrer" class="record-external" title="Open on {t.name}">
                          <ArrowSquareOut size={10} weight="light" />
                        </a>
                      {/if}
                    </div>
                    <div class="record-actions">
                      <button class="icon-action" title="Sync from tracker" disabled={syncing === link.id}
                        onclick={() => resync(link)}>
                        <ArrowsClockwise size={12} weight="light" class={syncing === link.id ? "anim-spin" : ""} />
                      </button>
                      <button class="icon-action icon-action-danger" title="Unlink" disabled={isBusy}
                        onclick={() => (confirmUnlinkId = link.id)}>
                        <X size={11} weight="bold" />
                      </button>
                    </div>
                  </div>

                  <p class="record-title">{link.title}</p>

                  <div class="record-body">
                    <div class="tp-fields">
                      <label class="tp-fld">
                        <span>Status</span>
                        {#key link.status}
                          <select class="tp-input" value={link.status} disabled={isBusy}
                            onchange={(e) => patch(link, { status: +(e.currentTarget as HTMLSelectElement).value })}>
                            {#each statusesFor(t, manga?.contentType) as s}<option value={s.value}>{s.label}</option>{/each}
                          </select>
                        {/key}
                      </label>

                      {#if t.scoreOptions.length > 0}
                        <label class="tp-fld">
                          <span>Score</span>
                          {#key link.score}
                            {#if numericScore}
                              <select class="tp-input" value={String(link.score)} disabled={isBusy}
                                onchange={(e) => patch(link, { score: +(e.currentTarget as HTMLSelectElement).value })}>
                                <option value="0">–</option>
                                {#each t.scoreOptions as opt}<option value={opt}>{opt}</option>{/each}
                              </select>
                            {:else}
                              <input class="tp-input tp-num" type="number" min="0" step="1"
                                value={link.score} disabled={isBusy}
                                onchange={(e) => patch(link, { score: +(e.currentTarget as HTMLInputElement).value })} />
                            {/if}
                          {/key}
                        </label>
                      {/if}
                    </div>

                    {#if isEdit}
                      <div class="editor">
                        <div class="editor-row">
                          <span class="editor-label">Chapter read</span>
                          <div class="editor-input-row">
                            <input type="number" class="editor-input" min="0"
                              max={link.totalChapters > 0 ? link.totalChapters : undefined}
                              step="1" bind:value={chapterDraft}
                              onkeydown={(e) => { if (e.key === "Enter") submitChapter(link); if (e.key === "Escape") cancelEditor(); }}
                              use:autoFocus />
                            {#if link.totalChapters > 0}<span class="editor-total">/ {link.totalChapters}</span>{/if}
                          </div>
                        </div>
                        {#if link.totalChapters > 0}
                          <input type="range" class="chapter-slider" min="0" max={link.totalChapters} step="1" bind:value={chapterDraft} />
                        {/if}
                        <div class="editor-actions">
                          <button class="editor-cancel" onclick={cancelEditor}>Cancel</button>
                          <button class="editor-save" onclick={() => submitChapter(link)}>Save</button>
                        </div>
                      </div>
                    {:else}
                      <button class="progress-row" onclick={() => openEditor(link)} disabled={isBusy}>
                        <span class="progress-text">
                          {#if link.totalChapters > 0}Ch. {link.lastChapterRead} / {link.totalChapters}
                          {:else if link.lastChapterRead > 0}Ch. {link.lastChapterRead} read
                          {:else}Set progress…{/if}
                        </span>
                        <span class="progress-edit-hint">Edit</span>
                      </button>
                      {#if pct !== null}
                        <div class="progress-track"><div class="progress-fill" style="width:{pct}%"></div></div>
                      {/if}
                    {/if}

                    <span class="record-synced">Synced {relTime(link.lastSyncedAt)}</span>
                  </div>
                </div>
              {/if}
            {/each}
          {/if}
        </div>

      {:else}
        {@const t = connected.find((x) => x.key === activeTab)}
        {@const bound = linkFor(activeTab)}
        <div class="search-bar">
          <MagnifyingGlass size={13} weight="light" class="search-icon" />
          <input class="search-input" placeholder="Search {t?.name}…" bind:value={searchQuery}
            oninput={onSearchInput}
            onkeydown={(e) => { if (e.key === "Enter") runSearch(activeTab, searchQuery); }}
            use:autoFocus />
          {#if searching}<CircleNotch size={13} weight="light" class="anim-spin" style="color:var(--text-faint)" />{/if}
        </div>

        <div class="search-results">
          {#if searching && searchResults.length === 0}
            <div class="state-body"><p class="state-hint">Searching…</p></div>
          {:else if !searching && searchQuery.trim() && searchResults.length === 0}
            <div class="state-body"><p class="state-text">No results for “{searchQuery}”</p></div>
          {:else if !searchQuery.trim()}
            <div class="state-body"><p class="state-hint">Type a title to search</p></div>
          {:else}
            {#each searchResults as r (r.remoteId)}
              {@const isBound = bound?.remoteId === r.remoteId}
              {@const pick = () => { if (binding) return; isBound && bound ? (confirmUnlinkId = bound.id) : bind(activeTab, r); }}
              <div class="result-row" class:result-bound={isBound} class:result-disabled={binding}
                role="button" tabindex={binding ? -1 : 0}
                onclick={pick}
                onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }}>
                {#if r.coverUrl}
                  <Thumbnail src={r.coverUrl} alt="" class="result-cover" />
                {:else}
                  <div class="result-cover result-cover-empty"></div>
                {/if}
                <div class="result-info">
                  <span class="result-title">{r.title}</span>
                  <div class="result-meta">
                    {#if r.mediaType}<span class="result-tag">{r.mediaType === "ANIME" ? "Anime" : "Manga"}</span>{/if}
                    {#if r.publishingStatus}<span class="result-tag">{r.publishingStatus}</span>{/if}
                    {#if r.totalChapters}<span class="result-tag">{r.totalChapters} {r.mediaType === "ANIME" ? "ep" : "ch"}</span>{/if}
                  </div>
                  {#if r.summary}
                    <p class="result-summary">{r.summary.slice(0, 140)}{r.summary.length > 140 ? "…" : ""}</p>
                  {/if}
                </div>
                <span class="result-action" class:result-action-on={isBound}>{isBound ? "Linked" : "Link"}</span>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {/if}

  </div>
</div>

{#if confirmUnlinkId !== null}
  {@const rec = local.find((l) => l.id === confirmUnlinkId)}
  {@const trk = rec ? connected.find((t) => t.key === rec.trackerKey) : null}
  <ModalBlur blur={2} dim={0.45} zIndex="calc(var(--z-settings) + 1)" />
  <div class="confirm-backdrop" role="button" tabindex="-1" aria-label="Cancel"
    onclick={() => (confirmUnlinkId = null)}
    onkeydown={(e) => { if (e.key === "Escape") confirmUnlinkId = null; }}>
    <div class="confirm-modal" role="dialog" tabindex="-1"
      onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <p class="confirm-title">Unlink from {trk?.name ?? "tracker"}?</p>
      <p class="confirm-body">Your progress on {trk?.name ?? "the service"} is unaffected.</p>
      <div class="confirm-row">
        <button class="confirm-cancel" onclick={() => (confirmUnlinkId = null)}>Cancel</button>
        <button class="confirm-ok" onclick={() => rec && unbind(rec)}>Unlink</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: var(--z-settings);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.12s ease both;
  }
  .modal {
    width: min(540px, calc(100vw - 40px));
    max-height: min(660px, calc(100vh - 72px));
    display: flex; flex-direction: column;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-xl); overflow: hidden;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(0,0,0,0.6);
    animation: scaleIn 0.15s ease both;
  }

  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-5);
    border-bottom: 1px solid var(--border-dim); flex-shrink: 0;
  }
  .header-left { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .modal-title    { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); }
  .modal-subtitle { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .close-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .state-body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); padding: var(--sp-10) var(--sp-5); flex: 1; }
  .state-text { font-size: var(--text-sm); color: var(--text-muted); }
  .state-hint { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); text-align: center; }
  .link-btn { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 5px 12px; border-radius: var(--radius-md); border: 1px solid var(--accent-dim); background: var(--accent-muted); color: var(--accent-fg); cursor: pointer; }

  .tabs { display: flex; align-items: center; gap: 1px; padding: 0 var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 10px 8px 9px; color: var(--text-faint); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: color var(--t-base), border-color var(--t-base); margin-bottom: -1px; }
  .tab:hover { color: var(--text-muted); }
  .tab-active { color: var(--text-secondary); border-bottom-color: var(--accent); }
  .tab-badge { font-size: 10px; padding: 0 4px; border-radius: var(--radius-full); background: var(--bg-overlay); color: var(--text-faint); min-width: 16px; text-align: center; line-height: 16px; }
  .tab-active .tab-badge { background: var(--accent-muted); color: var(--accent-fg); }
  .tab-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }

  .tab-body { flex: 1; overflow-y: auto; padding: var(--sp-3); scrollbar-width: none; display: flex; flex-direction: column; gap: var(--sp-2); }
  .tab-body::-webkit-scrollbar { display: none; }

  .record-card { display: flex; flex-direction: column; border-radius: var(--radius-lg); border: 1px solid var(--border-dim); background: var(--bg-raised); overflow: hidden; transition: border-color var(--t-base); }
  .record-card:hover { border-color: var(--border-strong); }
  .record-busy { opacity: 0.45; pointer-events: none; }

  .record-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: var(--sp-3) var(--sp-3) 0; }
  .record-source { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .record-source-name { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .record-external { display: flex; align-items: center; color: var(--text-faint); transition: color var(--t-base); }
  .record-external:hover { color: var(--accent-fg); }
  .record-actions { display: flex; align-items: center; gap: 2px; }

  .icon-action { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-base), background var(--t-base); flex-shrink: 0; }
  .icon-action:hover:not(:disabled) { color: var(--text-muted); background: var(--bg-overlay); }
  .icon-action-danger:hover:not(:disabled) { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }
  .icon-action:disabled { opacity: 0.3; cursor: default; }

  .record-title { margin: var(--sp-1) 0 0; padding: 0 var(--sp-3); font-size: var(--text-xs); color: var(--text-secondary); line-height: var(--leading-snug); }

  .record-body { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3) var(--sp-3); }

  .tp-fields { display: flex; flex-wrap: wrap; gap: var(--sp-3); }
  .tp-fld { display: flex; flex-direction: column; gap: 3px; }
  .tp-fld > span { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .tp-input {
    height: 30px; padding: 0 8px;
    background-color: var(--bg-raised); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); color: var(--text-primary);
    font-family: inherit; font-size: var(--text-xs); outline: none;
    appearance: none; -webkit-appearance: none;
    transition: border-color var(--t-base);
  }
  .tp-input:focus { border-color: var(--accent-dim); }
  select.tp-input {
    width: 148px; cursor: pointer; padding-right: 24px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23888' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 8px center;
  }
  select.tp-input option { background: var(--bg-surface); color: var(--text-secondary); }
  .tp-num { width: 68px; appearance: textfield; -moz-appearance: textfield; }
  .tp-num::-webkit-inner-spin-button, .tp-num::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

  .progress-row { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid transparent; background: none; cursor: pointer; text-align: left; transition: background var(--t-fast), border-color var(--t-fast); }
  .progress-row:hover:not(:disabled) { background: var(--bg-overlay); border-color: var(--border-dim); }
  .progress-row:disabled { cursor: default; }
  .progress-text { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .progress-edit-hint { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); opacity: 0; letter-spacing: var(--tracking-wide); transition: opacity var(--t-fast); }
  .progress-row:hover:not(:disabled) .progress-edit-hint { opacity: 0.5; }
  .progress-track { height: 2px; background: var(--border-strong); border-radius: var(--radius-full); overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.3s ease; }

  .record-synced { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); opacity: 0.7; letter-spacing: var(--tracking-wide); }

  .editor { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-surface); }
  .editor-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
  .editor-label { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .editor-input-row { display: flex; align-items: center; gap: var(--sp-2); }
  .editor-input { width: 60px; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 3px 6px; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-primary); outline: none; text-align: center; transition: border-color var(--t-base); appearance: textfield; -moz-appearance: textfield; }
  .editor-input::-webkit-inner-spin-button, .editor-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .editor-input:focus { border-color: var(--accent); }
  .editor-total { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); }
  .chapter-slider { width: 100%; accent-color: var(--accent); cursor: pointer; height: 3px; }
  .editor-actions { display: flex; gap: var(--sp-2); justify-content: flex-end; padding-top: var(--sp-1); }
  .editor-save { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 12px; border-radius: var(--radius-sm); border: 1px solid var(--accent-dim); background: var(--accent-muted); color: var(--accent-fg); cursor: pointer; transition: filter var(--t-base); }
  .editor-save:hover { filter: brightness(1.15); }
  .editor-cancel { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 8px; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-base); }
  .editor-cancel:hover { color: var(--text-muted); }

  .search-bar { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .search-input { flex: 1; background: none; border: none; outline: none; font-size: var(--text-sm); color: var(--text-primary); font-family: inherit; }
  .search-input::placeholder { color: var(--text-faint); }

  .search-results { flex: 1; overflow-y: auto; padding: var(--sp-2); scrollbar-width: none; }
  .search-results::-webkit-scrollbar { display: none; }

  .result-row { display: flex; align-items: center; gap: var(--sp-3); width: 100%; padding: var(--sp-3); border-radius: var(--radius-md); text-align: left; cursor: pointer; user-select: none; transition: background var(--t-fast); }
  .result-row:hover:not(.result-disabled) { background: var(--bg-raised); }
  .result-row:focus-visible { outline: none; background: var(--bg-raised); box-shadow: inset 0 0 0 1px var(--accent-dim); }
  .result-disabled { opacity: 0.4; cursor: default; }
  .result-bound { background: color-mix(in srgb, var(--accent) 8%, transparent); }
  :global(.result-cover) { width: 40px; height: 56px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); flex-shrink: 0; }
  .result-cover-empty { background: var(--bg-raised); }
  .result-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .result-title { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .result-meta { display: flex; flex-wrap: wrap; gap: 4px; }
  .result-tag { font-family: var(--font-ui); font-size: 10px; letter-spacing: var(--tracking-wide); padding: 1px 5px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint); }
  .result-summary { font-size: var(--text-xs); color: var(--text-faint); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .result-action { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); flex-shrink: 0; align-self: center; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .result-row:hover:not(:disabled) .result-action { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .result-action-on { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .confirm-backdrop { position: fixed; inset: 0; z-index: calc(var(--z-settings) + 1); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.1s ease both; }
  .confirm-modal { background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: var(--radius-xl); padding: var(--sp-5); width: 260px; display: flex; flex-direction: column; gap: var(--sp-3); box-shadow: 0 16px 48px rgba(0,0,0,0.5); animation: scaleIn 0.15s ease both; }
  .confirm-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); margin: 0; }
  .confirm-body { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); line-height: 1.5; margin: 0; letter-spacing: var(--tracking-wide); }
  .confirm-row { display: flex; gap: var(--sp-2); }
  .confirm-cancel { flex: 1; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 0; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: none; color: var(--text-muted); cursor: pointer; transition: border-color var(--t-base), color var(--t-base); }
  .confirm-cancel:hover { border-color: var(--border-strong); color: var(--text-primary); }
  .confirm-ok { flex: 1; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 0; border-radius: var(--radius-md); border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent); background: color-mix(in srgb, var(--color-error) 8%, transparent); color: var(--color-error); cursor: pointer; transition: filter var(--t-base); }
  .confirm-ok:hover { filter: brightness(1.2); }

  @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>
