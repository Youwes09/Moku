<script lang="ts">
  import { CircleNotch, X, MagnifyingGlass, ArrowSquareOut, Lock, LockOpen, ArrowsClockwise, ArrowLineDown, CalendarBlank } from "phosphor-svelte";
  import { gql }        from "@api/client";
  import Thumbnail      from "@shared/manga/Thumbnail.svelte";
  import { GET_TRACKERS, GET_MANGA_TRACK_RECORDS, SEARCH_TRACKER } from "@api/queries/tracking";
  import { BIND_TRACK, UPDATE_TRACK, UNBIND_TRACK, FETCH_TRACK } from "@api/mutations/tracking";
  import { GET_CHAPTERS } from "@api/queries/chapters";
  import { addToast, store } from "@store/state.svelte";
  import { syncBackFromTracker } from "@features/tracking/lib/trackingSync";
  import type { Tracker, TrackRecord, TrackSearch } from "@types";
  import type { Chapter } from "@types/index";

  let { mangaId, mangaTitle, onClose }: {
    mangaId:    number;
    mangaTitle: string;
    onClose:    () => void;
  } = $props();

  type TabId = "records" | number;

  let trackers:    Tracker[]     = $state([]);
  let records:     TrackRecord[] = $state([]);
  let loading:     boolean       = $state(true);
  let activeTab:   TabId         = $state("records");

  let searchQuery:   string        = $state("");
  let searchResults: TrackSearch[] = $state([]);
  let searching:     boolean       = $state(false);
  let searchInited:  Set<number>   = $state(new Set());

  let binding:        boolean       = $state(false);
  let updatingRecord: number | null = $state(null);
  let syncing:        number | null = $state(null);
  let applyingRecord: number | null = $state(null);

  let editingId:    number | null = $state(null);
  let chapterDraft: number        = $state(0);
  let startDraft:   string        = $state("");
  let finishDraft:  string        = $state("");
  let confirmUnbindId: number | null = $state(null);

  const loggedInTrackers = $derived(trackers.filter(t => t.isLoggedIn));

  function autoFocus(node: HTMLElement) { setTimeout(() => node.focus(), 50); }

  async function load() {
    loading = true;
    try {
      const [tRes, rRes] = await Promise.all([
        gql<{ trackers: { nodes: Tracker[] } }>(GET_TRACKERS),
        gql<{ manga: { trackRecords: { nodes: TrackRecord[] } } }>(GET_MANGA_TRACK_RECORDS, { mangaId }),
      ]);
      trackers = tRes.trackers.nodes;
      records  = rRes.manga.trackRecords.nodes;
      if (store.settings.trackerSyncBack && records.length > 0) {
        await Promise.all(records.map(r => applyToLibrary(r, true)));
      }
    } catch (e: any) {
      addToast({ kind: "error", title: "Failed to load tracking", body: e?.message });
    } finally {
      loading = false;
    }
  }

  $effect(() => { load(); });

  $effect(() => {
    const tab = activeTab;
    if (typeof tab !== "number") return;
    if (searchInited.has(tab)) return;
    searchQuery  = mangaTitle;
    searchInited = new Set([...searchInited, tab]);
    doSearch(tab, mangaTitle);
  });

  function trackerFor(id: number)       { return trackers.find(t => t.id === id); }
  function recordFor(trackerId: number) { return records.find(r => r.trackerId === trackerId); }

  let searchTimer: ReturnType<typeof setTimeout>;

  function onSearchInput() {
    clearTimeout(searchTimer);
    if (typeof activeTab !== "number") return;
    const tid = activeTab;
    if (!searchQuery.trim()) { searchResults = []; return; }
    searchTimer = setTimeout(() => doSearch(tid, searchQuery), 400);
  }

  async function doSearch(trackerId: number, query: string) {
    if (!query.trim()) return;
    searching = true; searchResults = [];
    try {
      const res = await gql<{ searchTracker: { trackSearches: TrackSearch[] } }>(
        SEARCH_TRACKER, { trackerId, query: query.trim() }
      );
      searchResults = res.searchTracker.trackSearches;
    } catch (e: any) {
      addToast({ kind: "error", title: "Search failed", body: e?.message });
    } finally {
      searching = false;
    }
  }

  async function bind(result: TrackSearch) {
    if (typeof activeTab !== "number") return;
    binding = true;
    try {
      const existing = recordFor(activeTab);
      if (existing) {
        await gql(UNBIND_TRACK, { recordId: existing.id });
        records = records.filter(r => r.id !== existing.id);
      }
      const res = await gql<{ bindTrack: { trackRecord: TrackRecord } }>(
        BIND_TRACK, { mangaId, trackerId: activeTab, remoteId: result.remoteId }
      );
      const newRecord = res.bindTrack.trackRecord;
      records   = [...records, newRecord];
      activeTab = "records";
      addToast({ kind: "success", title: "Now tracking", body: result.title });
      if (store.settings.trackerSyncBack) await applyToLibrary(newRecord, true);
    } catch (e: any) {
      addToast({ kind: "error", title: "Failed to bind", body: e?.message });
    } finally {
      binding = false;
    }
  }

  async function unbind(record: TrackRecord) {
    updatingRecord = record.id;
    confirmUnbindId = null;
    try {
      await gql(UNBIND_TRACK, { recordId: record.id });
      records = records.filter(r => r.id !== record.id);
      addToast({ kind: "info", title: "Unlinked from " + trackerFor(record.trackerId)?.name });
    } catch (e: any) {
      addToast({ kind: "error", title: "Failed to unlink", body: e?.message });
    } finally {
      updatingRecord = null;
    }
  }

  function patchRecord(updated: Partial<TrackRecord> & { id: number }) {
    records = records.map(r => r.id === updated.id ? { ...r, ...updated } : r);
  }

  async function updateStatus(record: TrackRecord, status: number) {
    updatingRecord = record.id;
    try {
      const res = await gql<{ updateTrack: { trackRecord: TrackRecord } }>(UPDATE_TRACK, { recordId: record.id, status });
      patchRecord(res.updateTrack.trackRecord);
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message });
    } finally { updatingRecord = null; }
  }

  async function updateScore(record: TrackRecord, scoreString: string) {
    updatingRecord = record.id;
    try {
      const res = await gql<{ updateTrack: { trackRecord: TrackRecord } }>(UPDATE_TRACK, { recordId: record.id, scoreString });
      patchRecord(res.updateTrack.trackRecord);
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message });
    } finally { updatingRecord = null; }
  }

  async function togglePrivate(record: TrackRecord) {
    updatingRecord = record.id;
    try {
      const res = await gql<{ updateTrack: { trackRecord: TrackRecord } }>(UPDATE_TRACK, { recordId: record.id, private: !record.private });
      patchRecord(res.updateTrack.trackRecord);
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message });
    } finally { updatingRecord = null; }
  }

  async function syncRecord(record: TrackRecord) {
    syncing = record.id;
    try {
      const res = await gql<{ fetchTrack: { trackRecord: TrackRecord } }>(FETCH_TRACK, { recordId: record.id });
      patchRecord(res.fetchTrack.trackRecord);
      addToast({ kind: "success", title: "Synced from tracker" });
    } catch (e: any) {
      addToast({ kind: "error", title: "Sync failed", body: e?.message });
    } finally { syncing = null; }
  }

  function openChapterEditor(record: TrackRecord) {
    editingId    = record.id;
    chapterDraft = record.lastChapterRead;
    startDraft   = record.startDate  ?? "";
    finishDraft  = record.finishDate ?? "";
  }

  function cancelEditor() { editingId = null; }

  async function applyToLibrary(record: TrackRecord, silent = false) {
    applyingRecord = record.id;
    try {
      const chapRes = await gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId });
      const prefs   = store.settings.mangaPrefs?.[mangaId] ?? {};
      const marked  = await syncBackFromTracker(
        [record], chapRes.chapters.nodes,
        {
          threshold:              store.settings.trackerSyncBackThreshold ?? null,
          respectScanlatorFilter: store.settings.trackerRespectScanlatorFilter ?? true,
          chapterPrefs:           prefs,
        },
        (query, vars) => gql(query, vars),
      );
      if (!silent) {
        if (marked.length > 0) addToast({ kind: "success", title: `${marked.length} chapter${marked.length !== 1 ? "s" : ""} marked read` });
        else addToast({ kind: "info", title: "Already up to date" });
      }
    } catch (e: any) {
      addToast({ kind: "error", title: "Apply failed", body: e?.message });
    } finally { applyingRecord = null; }
  }

  async function submitChapter(record: TrackRecord) {
    const tracker = trackerFor(record.trackerId);
    const val     = Math.max(0, chapterDraft);
    const sd      = tracker?.supportsReadingDates ? (startDraft.trim()  || undefined) : undefined;
    const fd      = tracker?.supportsReadingDates ? (finishDraft.trim() || undefined) : undefined;

    editingId = null;

    const chapterChanged = val !== record.lastChapterRead;
    const startChanged   = sd !== (record.startDate  ?? undefined);
    const finishChanged  = fd !== (record.finishDate ?? undefined);
    if (!chapterChanged && !startChanged && !finishChanged) return;

    updatingRecord = record.id;
    try {
      const res = await gql<{ updateTrack: { trackRecord: TrackRecord } }>(UPDATE_TRACK, {
        recordId:        record.id,
        lastChapterRead: chapterChanged ? val : undefined,
        startDate:       sd,
        finishDate:      fd,
      });
      patchRecord(res.updateTrack.trackRecord);
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message });
    } finally { updatingRecord = null; }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape") { if (confirmUnbindId !== null) { confirmUnbindId = null; } else if (editingId !== null) { editingId = null; } else { onClose(); } } }} />

<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="modal" role="dialog" aria-label="Tracking">

    <div class="modal-header">
      <div class="header-left">
        <span class="modal-title">Tracking</span>
        <span class="modal-subtitle">{mangaTitle}</span>
      </div>
      <button class="close-btn" onclick={onClose}><X size={14} weight="light" /></button>
    </div>

    {#if loading}
      <div class="state-body">
        <CircleNotch size={18} weight="light" class="anim-spin" style="color:var(--text-faint)" />
      </div>

    {:else if loggedInTrackers.length === 0}
      <div class="state-body">
        <p class="state-text">No trackers connected.</p>
        <p class="state-hint">Go to Settings → Tracking to log in.</p>
      </div>

    {:else}
      <div class="tabs">
        <button class="tab" class:tab-active={activeTab === "records"} onclick={() => activeTab = "records"}>
          My List
          {#if records.length > 0}<span class="tab-badge">{records.length}</span>{/if}
        </button>
        {#each loggedInTrackers as t}
          {@const rec = recordFor(t.id)}
          <button class="tab" class:tab-active={activeTab === t.id} onclick={() => { activeTab = t.id; searchResults = []; }}>
            <Thumbnail src={t.icon} alt={t.name} class="tab-icon" />
            {t.name}
            {#if rec}<span class="tab-dot"></span>{/if}
          </button>
        {/each}
      </div>

      {#if activeTab === "records"}
        <div class="tab-body">
          {#if records.length === 0}
            <div class="state-body">
              <p class="state-text">Not tracking yet.</p>
              <p class="state-hint">Click a tracker tab above to search and link it.</p>
            </div>
          {:else}
            {#each records as record (record.id)}
              {@const tracker = trackerFor(record.trackerId)}
              {@const isBusy  = updatingRecord === record.id}
              {@const isEdit  = editingId === record.id}
              {@const pct     = record.totalChapters > 0 ? Math.min(100, (record.lastChapterRead / record.totalChapters) * 100) : null}
              {@const canUnlink = !tracker || tracker.supportsTrackDeletion !== false}

              <div class="record-card" class:record-busy={isBusy}>

                <div class="record-head">
                  <div class="record-source">
                    {#if tracker}<Thumbnail src={tracker.icon} alt={tracker.name} class="record-icon" />{/if}
                    <span class="record-source-name">{tracker?.name ?? "Tracker"}</span>
                    {#if record.remoteUrl}
                      <a href={record.remoteUrl} target="_blank" rel="noreferrer" class="record-external" title="Open on {tracker?.name}">
                        <ArrowSquareOut size={10} weight="light" />
                      </a>
                    {/if}
                  </div>
                  <div class="record-actions">
                    {#if tracker?.supportsPrivateTracking}
                      <button
                        class="pill-btn"
                        class:pill-btn-on={record.private}
                        title={record.private ? "Private" : "Public"}
                        disabled={isBusy}
                        onclick={() => togglePrivate(record)}
                      >
                        {#if record.private}<Lock size={9} weight="fill" />{:else}<LockOpen size={9} weight="light" />{/if}
                        {record.private ? "Private" : "Public"}
                      </button>
                    {/if}
                    <button class="icon-action" title="Sync from tracker" disabled={syncing === record.id} onclick={() => syncRecord(record)}>
                      <ArrowsClockwise size={12} weight="light" class={syncing === record.id ? "anim-spin" : ""} />
                    </button>
                    {#if store.settings.trackerSyncBack}
                      <button class="icon-action" title="Apply to library" disabled={applyingRecord === record.id} onclick={() => applyToLibrary(record)}>
                        <ArrowLineDown size={12} weight="light" class={applyingRecord === record.id ? "anim-spin" : ""} />
                      </button>
                    {/if}
                    {#if canUnlink}
                      <button class="icon-action icon-action-danger" title="Unlink" disabled={isBusy} onclick={() => confirmUnbindId = record.id}>
                        <X size={11} weight="bold" />
                      </button>
                    {/if}
                  </div>
                </div>

                <div class="record-body">
                  <div class="record-selects">
                    <select class="field-select" value={record.status} disabled={isBusy}
                      onchange={(e) => updateStatus(record, parseInt((e.target as HTMLSelectElement).value))}>
                      {#each (tracker?.statuses ?? []) as s}
                        <option value={s.value}>{s.name}</option>
                      {/each}
                    </select>
                    {#if (tracker?.scores ?? []).length > 0}
                      <select class="field-select score-select" value={record.displayScore} disabled={isBusy}
                        onchange={(e) => updateScore(record, (e.target as HTMLSelectElement).value)}>
                        {#each (tracker?.scores ?? []) as s}
                          <option value={s}>★ {s}</option>
                        {/each}
                      </select>
                    {/if}
                  </div>

                  {#if isEdit}
                    <div class="editor">
                      <div class="editor-row">
                        <span class="editor-label">Chapter read</span>
                        <div class="editor-input-row">
                          <input
                            type="number" class="editor-input"
                            min="0" max={record.totalChapters > 0 ? record.totalChapters : undefined}
                            step="0.5" bind:value={chapterDraft}
                            onkeydown={(e) => { if (e.key === "Enter") submitChapter(record); if (e.key === "Escape") cancelEditor(); }}
                            use:autoFocus
                          />
                          {#if record.totalChapters > 0}
                            <span class="editor-total">/ {record.totalChapters}</span>
                          {/if}
                        </div>
                      </div>
                      {#if record.totalChapters > 0}
                        <input type="range" class="chapter-slider" min="0" max={record.totalChapters} step="1" bind:value={chapterDraft} />
                      {/if}
                      {#if tracker?.supportsReadingDates}
                        <div class="date-row">
                          <div class="date-field">
                            <CalendarBlank size={11} weight="light" class="date-icon" />
                            <span class="editor-label">Started</span>
                            <input type="date" class="date-input" bind:value={startDraft} />
                          </div>
                          <div class="date-field">
                            <CalendarBlank size={11} weight="light" class="date-icon" />
                            <span class="editor-label">Finished</span>
                            <input type="date" class="date-input" bind:value={finishDraft} />
                          </div>
                        </div>
                      {/if}
                      <div class="editor-actions">
                        <button class="editor-cancel" onclick={cancelEditor}>Cancel</button>
                        <button class="editor-save" onclick={() => submitChapter(record)}>Save</button>
                      </div>
                    </div>
                  {:else}
                    <button class="progress-row" onclick={() => openChapterEditor(record)} disabled={isBusy}>
                      <div class="progress-labels">
                        <span class="progress-text">
                          {#if record.totalChapters > 0}Ch. {record.lastChapterRead} / {record.totalChapters}
                          {:else if record.lastChapterRead > 0}Ch. {record.lastChapterRead} read
                          {:else}Set progress…{/if}
                        </span>
                        {#if record.startDate || record.finishDate}
                          <span class="progress-dates">
                            {#if record.startDate}{record.startDate}{/if}
                            {#if record.startDate && record.finishDate} → {/if}
                            {#if record.finishDate}{record.finishDate}{/if}
                          </span>
                        {/if}
                      </div>
                      <span class="progress-edit-hint">Edit</span>
                    </button>
                    {#if pct !== null}
                      <div class="progress-track">
                        <div class="progress-fill" style="width:{pct}%"></div>
                      </div>
                    {/if}
                  {/if}
                </div>

              </div>
            {/each}
          {/if}
        </div>

      {:else}
        {@const tracker     = trackerFor(activeTab as number)}
        {@const boundRecord = recordFor(activeTab as number)}
        <div class="search-bar">
          <MagnifyingGlass size={13} weight="light" class="search-icon" />
          <input
            class="search-input"
            placeholder="Search {tracker?.name}…"
            bind:value={searchQuery}
            oninput={onSearchInput}
            onkeydown={(e) => e.key === "Enter" && doSearch(activeTab as number, searchQuery)}
            use:autoFocus
          />
          {#if searching}<CircleNotch size={13} weight="light" class="anim-spin" style="color:var(--text-faint)" />{/if}
        </div>

        <div class="search-results">
          {#if searching && searchResults.length === 0}
            <div class="state-body"><p class="state-hint">Searching…</p></div>
          {:else if !searching && searchQuery.trim() && searchResults.length === 0}
            <div class="state-body"><p class="state-text">No results for "{searchQuery}"</p></div>
          {:else if !searchQuery.trim()}
            <div class="state-body"><p class="state-hint">Type a title to search</p></div>
          {:else}
            {#each searchResults as result (result.trackerId + ":" + result.remoteId)}
              {@const isBound = boundRecord?.remoteId === result.remoteId}
              <button
                class="result-row"
                class:result-bound={isBound}
                onclick={() => isBound ? unbind(boundRecord!) : bind(result)}
                disabled={binding}
              >
                {#if result.coverUrl}
                  <img src={result.coverUrl} alt={result.title} class="result-cover" loading="lazy"
                    onerror={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                {:else}
                  <div class="result-cover result-cover-empty"></div>
                {/if}
                <div class="result-info">
                  <span class="result-title">{result.title}</span>
                  <div class="result-meta">
                    {#if result.publishingType}<span class="result-tag">{result.publishingType}</span>{/if}
                    {#if result.publishingStatus}<span class="result-tag">{result.publishingStatus}</span>{/if}
                    {#if result.totalChapters > 0}<span class="result-tag">{result.totalChapters} ch</span>{/if}
                  </div>
                  {#if result.summary}
                    <p class="result-summary">{result.summary.slice(0,140)}{result.summary.length > 140 ? "…" : ""}</p>
                  {/if}
                </div>
                <span class="result-action" class:result-action-on={isBound}>
                  {isBound ? "✓ Linked" : "Link"}
                </span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    {/if}

  </div>
</div>

{#if confirmUnbindId !== null}
  {@const rec = records.find(r => r.id === confirmUnbindId)}
  {@const trk = rec ? trackerFor(rec.trackerId) : null}
  <div class="confirm-backdrop" role="button" tabindex="-1" aria-label="Cancel" onclick={() => confirmUnbindId = null} onkeydown={(e) => { if (e.key === 'Escape') confirmUnbindId = null; }}>
    <div class="confirm-modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <p class="confirm-title">Unlink from {trk?.name ?? "tracker"}?</p>
      <p class="confirm-body">Your progress on {trk?.name} is unaffected.</p>
      <div class="confirm-row">
        <button class="confirm-cancel" onclick={() => confirmUnbindId = null}>Cancel</button>
        <button class="confirm-ok" onclick={() => rec && unbind(rec)}>Unlink</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.68);
    z-index: var(--z-settings);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.12s ease both;
  }
  .modal {
    width: min(520px, calc(100vw - 40px));
    max-height: min(640px, calc(100vh - 72px));
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
  .modal-title  { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); }
  .modal-subtitle { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .close-btn { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .state-body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); padding: var(--sp-10) var(--sp-5); flex: 1; }
  .state-text  { font-size: var(--text-sm); color: var(--text-muted); }
  .state-hint  { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); text-align: center; }

  .tabs { display: flex; align-items: center; gap: 1px; padding: 0 var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; overflow-x: auto; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 10px 8px 9px; color: var(--text-faint); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; white-space: nowrap; transition: color var(--t-base), border-color var(--t-base); margin-bottom: -1px; }
  .tab:hover { color: var(--text-muted); }
  .tab-active  { color: var(--text-secondary); border-bottom-color: var(--accent); }
  :global(.tab-icon) { width: 13px; height: 13px; border-radius: 2px; object-fit: contain; }
  .tab-badge { font-size: 10px; padding: 0 4px; border-radius: var(--radius-full); background: var(--bg-overlay); color: var(--text-faint); min-width: 16px; text-align: center; line-height: 16px; }
  .tab-active .tab-badge { background: var(--accent-muted); color: var(--accent-fg); }
  .tab-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }

  .tab-body { flex: 1; overflow-y: auto; padding: var(--sp-3); scrollbar-width: none; display: flex; flex-direction: column; gap: var(--sp-2); }
  .tab-body::-webkit-scrollbar { display: none; }

  .record-card { display: flex; flex-direction: column; border-radius: var(--radius-lg); border: 1px solid var(--border-dim); background: var(--bg-raised); overflow: hidden; transition: border-color var(--t-base); }
  .record-card:hover { border-color: var(--border-strong); }
  .record-busy { opacity: 0.45; pointer-events: none; }

  .record-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: var(--sp-3) var(--sp-3) 0; }
  .record-source { display: flex; align-items: center; gap: 6px; }
  :global(.record-icon) { width: 14px; height: 14px; border-radius: 2px; flex-shrink: 0; object-fit: contain; opacity: 0.7; }
  .record-source-name { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .record-external { display: flex; align-items: center; color: var(--text-faint); transition: color var(--t-base); }
  .record-external:hover { color: var(--accent-fg); }
  .record-actions { display: flex; align-items: center; gap: 2px; }

  .pill-btn { display: flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: 10px; letter-spacing: var(--tracking-wide); padding: 2px 7px; border-radius: var(--radius-full); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-base), background var(--t-base), border-color var(--t-base); }
  .pill-btn:hover:not(:disabled) { color: var(--text-muted); border-color: var(--border-strong); }
  .pill-btn-on { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .pill-btn:disabled { opacity: 0.35; cursor: default; }

  .icon-action { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-base), background var(--t-base); flex-shrink: 0; }
  .icon-action:hover:not(:disabled) { color: var(--text-muted); background: var(--bg-overlay); }
  .icon-action-danger:hover:not(:disabled) { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }
  .icon-action:disabled { opacity: 0.3; cursor: default; }

  .record-body { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3) var(--sp-3); }

  .record-selects { display: flex; gap: var(--sp-2); }
  .field-select { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 5px 22px 5px 9px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-surface); color: var(--text-muted); outline: none; cursor: pointer; flex: 1; min-width: 0; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23555' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 7px center; transition: border-color var(--t-base), color var(--t-base); }
  .field-select:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-secondary); }
  .field-select:focus { border-color: var(--accent-dim); }
  .field-select:disabled { opacity: 0.35; cursor: default; }
  .field-select option { background: var(--bg-surface); color: var(--text-secondary); }
  .score-select { flex: 0 0 auto; min-width: 76px; }

  .progress-row { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid transparent; background: none; cursor: pointer; text-align: left; transition: background var(--t-fast), border-color var(--t-fast); }
  .progress-row:hover:not(:disabled) { background: var(--bg-overlay); border-color: var(--border-dim); }
  .progress-row:disabled { cursor: default; }
  .progress-labels { display: flex; flex-direction: column; gap: 1px; }
  .progress-text { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .progress-dates { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); opacity: 0.7; }
  .progress-edit-hint { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); opacity: 0; letter-spacing: var(--tracking-wide); transition: opacity var(--t-fast); }
  .progress-row:hover:not(:disabled) .progress-edit-hint { opacity: 0.5; }
  .progress-track { height: 2px; background: var(--border-strong); border-radius: var(--radius-full); overflow: hidden; }
  .progress-fill  { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.3s ease; }

  .editor { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-surface); }
  .editor-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
  .editor-label { font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .editor-input-row { display: flex; align-items: center; gap: var(--sp-2); }
  .editor-input { width: 60px; background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 3px 6px; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-primary); outline: none; text-align: center; transition: border-color var(--t-base); }
  .editor-input:focus { border-color: var(--accent); }
  .editor-total { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); }
  .chapter-slider { width: 100%; accent-color: var(--accent); cursor: pointer; height: 3px; }

  .date-row { display: flex; gap: var(--sp-3); padding-top: var(--sp-1); border-top: 1px solid var(--border-dim); }
  .date-field { display: flex; align-items: center; gap: 5px; flex: 1; }
  :global(.date-icon) { color: var(--text-faint); flex-shrink: 0; }
  .date-input { flex: 1; min-width: 0; background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); padding: 3px 6px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted); outline: none; transition: border-color var(--t-base); }
  .date-input:focus { border-color: var(--accent-dim); }

  .editor-actions { display: flex; gap: var(--sp-2); justify-content: flex-end; padding-top: var(--sp-1); }
  .editor-save { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 12px; border-radius: var(--radius-sm); border: 1px solid var(--accent-dim); background: var(--accent-muted); color: var(--accent-fg); cursor: pointer; transition: filter var(--t-base); }
  .editor-save:hover { filter: brightness(1.15); }
  .editor-cancel { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 8px; border-radius: var(--radius-sm); border: none; background: none; color: var(--text-faint); cursor: pointer; transition: color var(--t-base); }
  .editor-cancel:hover { color: var(--text-muted); }

  .search-bar { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  :global(.search-icon) { color: var(--text-faint); flex-shrink: 0; }
  .search-input { flex: 1; background: none; border: none; outline: none; font-size: var(--text-sm); color: var(--text-primary); }
  .search-input::placeholder { color: var(--text-faint); }

  .search-results { flex: 1; overflow-y: auto; padding: var(--sp-2); scrollbar-width: none; }
  .search-results::-webkit-scrollbar { display: none; }

  .result-row { display: flex; align-items: flex-start; gap: var(--sp-3); width: 100%; padding: var(--sp-3); border-radius: var(--radius-md); border: none; background: none; text-align: left; cursor: pointer; transition: background var(--t-fast); }
  .result-row:hover:not(:disabled) { background: var(--bg-raised); }
  .result-row:disabled { opacity: 0.4; cursor: default; }
  .result-bound { background: color-mix(in srgb, var(--accent) 8%, transparent) !important; }
  .result-cover { width: 40px; height: 56px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); flex-shrink: 0; }
  .result-cover-empty { background: var(--bg-raised); }
  .result-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-top: 2px; }
  .result-title { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); text-align: left; }
  .result-meta { display: flex; flex-wrap: wrap; gap: 4px; }
  .result-tag { font-family: var(--font-ui); font-size: 10px; letter-spacing: var(--tracking-wide); padding: 1px 5px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint); }
  .result-summary { font-size: var(--text-xs); color: var(--text-faint); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: left; }
  .result-action { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); flex-shrink: 0; align-self: center; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .result-row:hover:not(:disabled) .result-action { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .result-action-on { color: var(--accent-fg) !important; border-color: var(--accent-dim) !important; background: var(--accent-muted) !important; }

  .confirm-backdrop { position: fixed; inset: 0; z-index: calc(var(--z-settings) + 1); background: rgba(0,0,0,0.45); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; animation: fadeIn 0.1s ease both; }
  .confirm-modal { background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: var(--radius-xl); padding: var(--sp-5); width: 260px; display: flex; flex-direction: column; gap: var(--sp-3); box-shadow: 0 16px 48px rgba(0,0,0,0.5); animation: scaleIn 0.15s ease both; }
  .confirm-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); margin: 0; }
  .confirm-body  { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); line-height: 1.5; margin: 0; letter-spacing: var(--tracking-wide); }
  .confirm-row   { display: flex; gap: var(--sp-2); }
  .confirm-cancel { flex: 1; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 0; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: none; color: var(--text-muted); cursor: pointer; transition: border-color var(--t-base), color var(--t-base); }
  .confirm-cancel:hover { border-color: var(--border-strong); color: var(--text-primary); }
  .confirm-ok { flex: 1; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 0; border-radius: var(--radius-md); border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent); background: color-mix(in srgb, var(--color-error) 8%, transparent); color: var(--color-error); cursor: pointer; transition: filter var(--t-base); }
  .confirm-ok:hover { filter: brightness(1.2); }

  @keyframes fadeIn  { from { opacity: 0 }                         to { opacity: 1 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>