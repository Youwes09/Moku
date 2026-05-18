<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { X, ArrowSquareOut, ArrowsClockwise, Lock, CircleNotch, Books } from "phosphor-svelte";
  import { gql } from "@api/client";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import { GET_CHAPTERS } from "@api/queries/chapters";
  import { store } from "@store/state.svelte";
  import { addToast, setActiveManga, setNavPage } from "@store/state.svelte";
  import { trackingState } from "@features/tracking/store/trackingState.svelte";
  import type { Chapter } from "@types/index";
  import { calcProgress, type FlatRecord } from "../lib/trackingSync";

  interface Props {
    record:  FlatRecord;
    onClose: () => void;
  }

  let { record, onClose }: Props = $props();

  let updatingId     = $state<number | null>(null);
  let syncingId      = $state<number | null>(null);
  let editingChapter = $state(false);
  let chapterDraft   = $state(0);
  let scoreDraft     = $state("");

  $effect(() => {
    chapterDraft = record.lastChapterRead;
    scoreDraft   = record.displayScore ?? "";
  });
  let confirmUnbind  = $state(false);

  const isBusy     = $derived(updatingId === record.id);
  const isSyncing  = $derived(syncingId  === record.id);
  const progress   = $derived(calcProgress(record.lastChapterRead, record.totalChapters));
  const statusName = $derived(record.tracker.statuses?.find(s => s.value === record.status)?.name);

  function prefsForManga(mangaId: number) {
    return store.settings.mangaPrefs?.[mangaId] ?? {};
  }

  async function updateStatus(status: number) {
    const mangaId = record.manga?.id ?? null;
    if (mangaId === null) return;
    updatingId = record.id;
    try {
      await trackingState.updateStatus(mangaId, record, status);
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message });
    } finally { updatingId = null; }
  }

  async function submitScore() {
    const val = String(scoreDraft).trim();
    if (val === String(record.displayScore ?? "")) return;
    const mangaId = record.manga?.id ?? null;
    if (mangaId === null) return;
    updatingId = record.id;
    try {
      await trackingState.updateScore(mangaId, record, val);
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message });
    } finally { updatingId = null; }
  }

  async function submitChapter() {
    const val = Math.max(0, chapterDraft);
    editingChapter = false;
    if (val === record.lastChapterRead) return;
    const mangaId = record.manga?.id ?? null;
    if (mangaId === null) return;
    updatingId = record.id;
    try {
      await trackingState.updateChapterProgress(mangaId, record, val);
      if (store.settings.trackerSyncBack && record.manga?.id) {
        const chapRes = await gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId: record.manga.id });
        await trackingState.syncFromRemote(mangaId, { ...record, lastChapterRead: val }, chapRes.chapters.nodes, prefsForManga(mangaId));
      }
    } catch (e: any) {
      addToast({ kind: "error", title: "Update failed", body: e?.message });
    } finally { updatingId = null; }
  }

  async function syncRecord() {
    const mangaId = record.manga?.id ?? null;
    if (mangaId === null) return;
    syncingId = record.id;
    try {
      let chapters: Chapter[] = [];
      if (store.settings.trackerSyncBack && record.manga?.id) {
        const res = await gql<{ chapters: { nodes: Chapter[] } }>(GET_CHAPTERS, { mangaId: record.manga.id });
        chapters = res.chapters.nodes;
      }
      const { markedIds } = await trackingState.syncFromRemote(mangaId, record, chapters, prefsForManga(mangaId));
      const body = markedIds.length > 0 ? `${markedIds.length} chapter${markedIds.length !== 1 ? "s" : ""} marked read` : undefined;
      addToast({ kind: "success", title: "Synced from tracker", body });
    } catch (e: any) {
      addToast({ kind: "error", title: "Sync failed", body: e?.message });
    } finally { syncingId = null; }
  }

  async function unbind() {
    const mangaId = record.manga?.id ?? null;
    if (mangaId === null) return;
    updatingId = record.id;
    confirmUnbind = false;
    try {
      await trackingState.unbind(mangaId, record);
      addToast({ kind: "info", title: `Unlinked from ${record.tracker.name}` });
      onClose();
    } catch (e: any) {
      addToast({ kind: "error", title: "Unbind failed", body: e?.message });
    } finally { updatingId = null; }
  }

  function openManga() {
    if (!record.manga) return;
    setActiveManga(record.manga as any);
    setNavPage(store.navPage);
    onClose();
  }

  function focusEl(node: HTMLElement) { setTimeout(() => node.focus(), 0); }

  function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
  onMount(() => window.addEventListener("keydown", onKey));
  onDestroy(() => window.removeEventListener("keydown", onKey));
</script>

<div
  class="backdrop"
  role="button"
  tabindex="-1"
  aria-label="Close tracking detail"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
  <div class="modal" role="dialog" aria-label="Tracking detail">

    <div class="cover-col">
      <div class="cover-wrap">
        {#if record.manga?.thumbnailUrl}
          <div class="cover-glow" style="background-image:url({record.manga.thumbnailUrl})"></div>
          <Thumbnail src={record.manga.thumbnailUrl} alt={record.title} class="cover" />
        {:else}
          <div class="cover-empty"></div>
        {/if}
        <div class="tracker-badge">
          <Thumbnail src={record.tracker.icon} alt={record.tracker.name} class="tracker-badge-img" />
        </div>
      </div>

      <div class="col-actions">
        {#if isSyncing}
          <div class="action-btn action-btn-inert">
            <CircleNotch size={13} weight="light" class="anim-spin" />
            <span class="action-label">Syncing…</span>
          </div>
        {:else}
          <button class="action-btn" onclick={syncRecord} disabled={isBusy}>
            <ArrowsClockwise size={13} weight="light" />
            <span class="action-label">Sync from tracker</span>
          </button>
        {/if}

        {#if record.manga}
          <button class="action-btn" onclick={openManga}>
            <Books size={13} weight="light" />
            <span class="action-label">Go to series</span>
          </button>
        {/if}

        {#if record.remoteUrl}
          <a href={record.remoteUrl} target="_blank" rel="noreferrer" class="action-btn">
            <Thumbnail src={record.tracker.icon} alt={record.tracker.name} class="tracker-icon" />
            <span class="action-label">Open on {record.tracker.name}</span>
            <ArrowSquareOut size={11} weight="light" style="flex-shrink:0;opacity:0.5" />
          </a>
        {/if}

        <button class="action-btn action-danger" onclick={() => confirmUnbind = true} disabled={isBusy}>
          <X size={12} weight="bold" />
          <span class="action-label">Unlink</span>
        </button>
      </div>
    </div>

    <div class="content">
      <div class="content-header">
        <div class="title-block">
          <h2 class="title">{record.title}</h2>
          {#if record.manga?.title && record.manga.title !== record.title}
            <p class="byline">{record.manga.title}</p>
          {/if}
        </div>
        <button class="close-btn" onclick={onClose}><X size={15} weight="light" /></button>
      </div>

      <div class="content-body">

        <div class="badges">
          <span class="badge badge-tracker">
            <Thumbnail src={record.tracker.icon} alt={record.tracker.name} class="badge-icon" />
            {record.tracker.name}
          </span>
          {#if statusName}
            <span class="badge badge-accent">{statusName}</span>
          {/if}
          {#if record.private}
            <span class="badge badge-private"><Lock size={10} weight="fill" /> Private</span>
          {/if}
        </div>

        <div class="progress-box">
          <div class="progress-box-top">
            <div class="progress-stat">
              <span class="progress-stat-value">{record.lastChapterRead > 0 ? record.lastChapterRead : "—"}</span>
              <span class="progress-stat-label">read</span>
            </div>
            {#if record.totalChapters > 0}
              <div class="progress-divider"></div>
              <div class="progress-stat">
                <span class="progress-stat-value">{record.totalChapters}</span>
                <span class="progress-stat-label">total</span>
              </div>
              <div class="progress-divider"></div>
              <div class="progress-stat">
                <span class="progress-stat-value">{Math.max(0, record.totalChapters - record.lastChapterRead)}</span>
                <span class="progress-stat-label">left</span>
              </div>
            {/if}
            {#if !editingChapter}
              <button class="edit-btn" onclick={() => { editingChapter = true; chapterDraft = record.lastChapterRead; }} disabled={isBusy}>
                Edit
              </button>
            {/if}
          </div>

          {#if progress !== null}
            <div class="progress-track">
              <div class="progress-fill" style="width:{progress}%"></div>
            </div>
            <span class="progress-pct">{Math.round(progress)}% complete</span>
          {/if}

          {#if editingChapter}
            <div class="chapter-editor">
              <div class="chapter-input-row">
                <input
                  type="number" class="chapter-input"
                  min="0" max={record.totalChapters > 0 ? record.totalChapters : undefined}
                  step="0.5"
                  bind:value={chapterDraft}
                  onkeydown={(e) => { if (e.key === "Enter") submitChapter(); if (e.key === "Escape") editingChapter = false; }}
                  use:focusEl
                />
                {#if record.totalChapters > 0}
                  <span class="chapter-total">/ {record.totalChapters}</span>
                {/if}
              </div>
              {#if record.totalChapters > 0}
                <input type="range" class="chapter-slider" min="0" max={record.totalChapters} step="1" bind:value={chapterDraft} />
              {/if}
              <div class="chapter-actions">
                <button class="chapter-cancel" onclick={() => editingChapter = false}>Cancel</button>
                <button class="chapter-save" onclick={submitChapter}>Save</button>
              </div>
            </div>
          {/if}
        </div>

        <div class="controls-row">
          <div class="control-group">
            <span class="control-label">Status</span>
            <select
              class="field-select"
              value={record.status}
              disabled={isBusy}
              onchange={(e) => updateStatus(parseInt((e.target as HTMLSelectElement).value))}
            >
              {#each (record.tracker.statuses ?? []) as s}
                <option value={s.value}>{s.name}</option>
              {/each}
            </select>
          </div>

          <div class="control-group">
            <span class="control-label">Score</span>
            <input
              type="number"
              class="field-input"
              bind:value={scoreDraft}
              disabled={isBusy}
              min={record.tracker.scores?.[0] ?? 0}
              max={record.tracker.scores?.[record.tracker.scores.length - 1] ?? 10}
              step="0.1"
              onblur={submitScore}
              onkeydown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
        </div>

        <div class="meta-section">
          <div class="meta-row">
            <span class="meta-key">Tracker</span>
            <span class="meta-val">{record.tracker.name}</span>
          </div>
          {#if record.manga?.title}
            <div class="meta-row">
              <span class="meta-key">Local title</span>
              <span class="meta-val">{record.manga.title}</span>
            </div>
          {/if}
          {#if record.startDate}
            <div class="meta-row">
              <span class="meta-key">Started</span>
              <span class="meta-val">{record.startDate}</span>
            </div>
          {/if}
          {#if record.finishDate}
            <div class="meta-row">
              <span class="meta-key">Finished</span>
              <span class="meta-val">{record.finishDate}</span>
            </div>
          {/if}
        </div>

      </div>
    </div>

  </div>
</div>

{#if confirmUnbind}
  <div class="confirm-backdrop" role="button" tabindex="-1" aria-label="Cancel" onclick={() => confirmUnbind = false} onkeydown={(e) => { if (e.key === 'Escape') confirmUnbind = false; }}>
    <div class="confirm-modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="confirm-icon"><X size={16} weight="bold" /></div>
      <p class="confirm-title">Unlink from {record.tracker.name}?</p>
      <p class="confirm-body"><strong>{record.title}</strong> will be removed from your list. Your progress on {record.tracker.name} is unaffected.</p>
      <div class="confirm-actions">
        <button class="confirm-cancel" onclick={() => confirmUnbind = false}>Cancel</button>
        <button class="confirm-confirm" onclick={unbind}>Unlink</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: var(--z-settings);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.12s ease both;
  }
  .modal {
    width: min(720px, calc(100vw - 48px));
    height: min(520px, calc(100vh - 80px));
    display: flex; flex-direction: row;
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: 0 0 0 1px var(--border-dim), 0 24px 64px rgba(0,0,0,0.6);
    animation: scaleIn 0.16s ease both;
  }

  .cover-col {
    width: 190px; flex-shrink: 0;
    background: var(--bg-raised);
    border-right: 1px solid var(--border-dim);
    display: flex; flex-direction: column;
    padding: var(--sp-5) var(--sp-4) var(--sp-4);
    gap: var(--sp-3); overflow: hidden;
  }
  .cover-wrap { position: relative; width: 100%; }
  .cover-glow {
    position: absolute; inset: -20px; z-index: 0;
    background-size: cover; background-position: center;
    filter: blur(24px) saturate(1.4);
    opacity: 0.18;
    border-radius: var(--radius-md);
    pointer-events: none;
  }
  :global(.cover) {
    position: relative; z-index: 1;
    width: 100%; aspect-ratio: 2/3;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-dim);
    display: block;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .cover-empty {
    width: 100%; aspect-ratio: 2/3;
    border-radius: var(--radius-md); border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
  }
  .tracker-badge {
    position: absolute; bottom: 7px; right: 7px; z-index: 2;
    width: 22px; height: 22px; border-radius: 5px;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  :global(.tracker-badge-img) { width: 16px; height: 16px; object-fit: contain; display: block; }

  .col-actions { display: flex; flex-direction: column; gap: var(--sp-2); }
  .action-btn {
    display: flex; align-items: center; gap: var(--sp-2);
    width: 100%; padding: 7px var(--sp-3);
    border-radius: var(--radius-md);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    border: 1px solid var(--border-strong); background: none; color: var(--text-muted);
    cursor: pointer; text-align: left; text-decoration: none;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .action-btn-inert { cursor: default; pointer-events: none; }
  .action-btn:hover:not(:disabled):not(.action-btn-inert) { color: var(--accent-fg); border-color: var(--accent); background: var(--accent-muted); }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
  .action-danger:hover:not(:disabled) {
    color: var(--color-error);
    border-color: color-mix(in srgb, var(--color-error) 40%, transparent);
    background: color-mix(in srgb, var(--color-error) 8%, transparent);
  }
  .action-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  :global(.tracker-icon) { width: 13px; height: 13px; border-radius: 2px; object-fit: contain; flex-shrink: 0; }

  .content { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  .content-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: var(--sp-4); padding: var(--sp-5) var(--sp-6) var(--sp-4);
    border-bottom: 1px solid var(--border-dim); flex-shrink: 0;
  }
  .title-block { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
  .title  { font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); line-height: var(--leading-tight); margin: 0; }
  .byline { font-size: var(--text-sm); color: var(--text-muted); line-height: var(--leading-snug); margin: 0; }
  .close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; flex-shrink: 0;
    border-radius: var(--radius-sm); color: var(--text-faint);
    background: none; border: none; cursor: pointer;
    transition: color var(--t-base), background var(--t-base);
  }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .content-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: var(--sp-5) var(--sp-6);
    display: flex; flex-direction: column; gap: var(--sp-4);
    scrollbar-width: none;
  }
  .content-body::-webkit-scrollbar { display: none; }

  .badges { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide); text-transform: uppercase;
    padding: 3px 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint);
  }
  .badge-accent  { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
  .badge-tracker { background: var(--bg-overlay); border-color: var(--border-dim); color: var(--text-muted); }
  .badge-private { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.25); color: #f59e0b; }
  :global(.badge-icon) { width: 11px; height: 11px; border-radius: 2px; object-fit: contain; }

  .progress-box {
    display: flex; flex-direction: column; gap: var(--sp-3);
    padding: var(--sp-4); background: var(--bg-raised);
    border: 1px solid var(--border-dim); border-radius: var(--radius-md);
  }
  .progress-box-top { display: flex; align-items: center; gap: var(--sp-4); }
  .progress-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .progress-stat-value { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-primary); line-height: 1; }
  .progress-stat-label { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--text-faint); }
  .progress-divider { width: 1px; height: 24px; background: var(--border-dim); }
  .edit-btn {
    margin-left: auto;
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 4px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: none; color: var(--text-faint);
    cursor: pointer; transition: color var(--t-base), border-color var(--t-base);
  }
  .edit-btn:hover:not(:disabled) { color: var(--accent-fg); border-color: var(--accent-dim); }
  .edit-btn:disabled { opacity: 0.35; cursor: default; }
  .progress-track { height: 3px; background: var(--bg-overlay); border-radius: var(--radius-full); overflow: hidden; }
  .progress-fill  { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.3s ease; }
  .progress-pct   { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); }

  .chapter-editor { display: flex; flex-direction: column; gap: var(--sp-2); padding-top: var(--sp-1); border-top: 1px solid var(--border-dim); }
  .chapter-input-row { display: flex; align-items: center; gap: var(--sp-2); }
  .chapter-input {
    width: 70px; background: var(--bg-surface);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    padding: 5px 8px; font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--text-primary); outline: none; text-align: center;
    appearance: none; -moz-appearance: textfield;
    transition: border-color var(--t-base);
  }
  .chapter-input:focus { border-color: var(--accent); }
  .chapter-input::-webkit-outer-spin-button,
  .chapter-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .chapter-total { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .chapter-slider { width: 100%; accent-color: var(--accent); cursor: pointer; height: 3px; }
  .chapter-actions { display: flex; align-items: center; gap: var(--sp-2); justify-content: flex-end; }
  .chapter-save {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 16px; border-radius: var(--radius-sm);
    border: 1px solid var(--accent-dim); background: var(--accent-muted);
    color: var(--accent-fg); cursor: pointer; transition: filter var(--t-base);
  }
  .chapter-save:hover { filter: brightness(1.15); }
  .chapter-cancel {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 8px; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-faint);
    cursor: pointer; transition: color var(--t-base);
  }
  .chapter-cancel:hover { color: var(--text-muted); }

  .controls-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); }
  .control-group { display: flex; flex-direction: column; gap: var(--sp-2); }
  .control-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider); text-transform: uppercase;
    color: var(--text-faint);
  }
  .field-select {
    width: 100%;
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 7px 28px 7px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: var(--bg-overlay);
    color: var(--text-secondary); outline: none; cursor: pointer; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23555' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 8px center;
    transition: border-color var(--t-base), color var(--t-base);
  }
  .field-select:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-primary); }
  .field-select:disabled { opacity: 0.35; cursor: default; }
  .field-select option { background: var(--bg-surface); color: var(--text-secondary); }
  .field-input {
    width: 100%;
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 7px 10px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: var(--bg-overlay);
    color: var(--text-secondary); outline: none;
    appearance: none; -moz-appearance: textfield;
    transition: border-color var(--t-base), color var(--t-base);
  }
  .field-input:hover:not(:disabled) { border-color: var(--border-strong); color: var(--text-primary); }
  .field-input:focus { border-color: var(--accent); color: var(--text-primary); }
  .field-input:disabled { opacity: 0.35; cursor: default; }
  .field-input::-webkit-outer-spin-button,
  .field-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

  .meta-section { display: flex; flex-direction: column; border-top: 1px solid var(--border-dim); padding-top: var(--sp-3); }
  .meta-row { display: flex; align-items: baseline; gap: var(--sp-3); padding: 5px 0; }
  .meta-key {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide); text-transform: uppercase;
    min-width: 72px; flex-shrink: 0;
  }
  .meta-val { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .confirm-backdrop {
    position: fixed; inset: 0; z-index: calc(var(--z-settings) + 1);
    background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.12s ease both;
  }
  .confirm-modal {
    background: var(--bg-surface); border: 1px solid var(--border-dim);
    border-radius: var(--radius-xl); padding: var(--sp-6);
    width: 300px; max-width: calc(100vw - 32px);
    display: flex; flex-direction: column; align-items: center; gap: var(--sp-3);
    box-shadow: 0 24px 60px rgba(0,0,0,0.5);
    animation: scaleIn 0.18s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  .confirm-icon {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(200,50,50,0.1); border: 1px solid rgba(200,50,50,0.2);
    color: var(--color-error); display: flex; align-items: center; justify-content: center;
  }
  .confirm-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); text-align: center; margin: 0; }
  .confirm-body  { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); text-align: center; line-height: 1.5; margin: 0; }
  .confirm-body strong { color: var(--text-secondary); font-weight: var(--weight-medium); }
  .confirm-actions { display: flex; gap: var(--sp-2); width: 100%; margin-top: var(--sp-1); }
  .confirm-cancel {
    flex: 1; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 8px 0; border-radius: var(--radius-md);
    border: 1px solid var(--border-dim); background: none;
    color: var(--text-muted); cursor: pointer;
    transition: border-color var(--t-base), color var(--t-base);
  }
  .confirm-cancel:hover { border-color: var(--border-strong); color: var(--text-primary); }
  .confirm-confirm {
    flex: 1; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 8px 0; border-radius: var(--radius-md);
    border: 1px solid rgba(200,50,50,0.25); background: rgba(200,50,50,0.08);
    color: var(--color-error); cursor: pointer;
    transition: filter var(--t-base), background var(--t-base);
  }
  .confirm-confirm:hover { filter: brightness(1.2); background: rgba(200,50,50,0.16); }

  :global(.anim-spin) { animation: anim-spin 0.8s linear infinite; }
  @keyframes anim-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
  @keyframes fadeIn    { from { opacity: 0 }                          to { opacity: 1 }              }
  @keyframes scaleIn   { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>