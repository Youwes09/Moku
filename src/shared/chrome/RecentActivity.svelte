<script lang="ts">
  import { onMount } from "svelte";
  import { ClockCounterClockwise, Trash, MagnifyingGlass, Books, Fire, BookOpen, Clock, TrendUp } from "phosphor-svelte";
  import Thumbnail from "@shared/manga/Thumbnail.svelte";
  import { store, clearHistory, setPreviewManga } from "@store/state.svelte";
  import { gql } from "@api/client";
  import { GET_LIBRARY } from "@api/queries/manga";
  import { cache, CACHE_KEYS } from "@core/cache";
  import type { HistoryEntry } from "@store/state.svelte";
  import type { Manga } from "@types";
  import { timeAgo, dayLabel, formatReadTime } from "@core/util";

  let libraryManga = $state<Manga[]>([]);

  onMount(() => {
    cache.get(CACHE_KEYS.LIBRARY, () =>
      gql<{ mangas: { nodes: Manga[] } }>(GET_LIBRARY).then(d => d.mangas.nodes)
    )
      .then(m => { libraryManga = m; })
      .catch(() => {});
  });

  function thumbFor(mangaId: number, fallback: string): string {
    return libraryManga.find(m => m.id === mangaId)?.thumbnailUrl ?? fallback ?? "";
  }

  let search       = $state("");
  let confirmClear = $state(false);

  const SESSION_GAP_MS = 30 * 60 * 1000;

  interface Session {
    mangaId:           number;
    mangaTitle:        string;
    thumbnailUrl:      string;
    latestChapterId:   number;
    latestChapterName: string;
    latestPageNumber:  number;
    firstChapterName:  string;
    chapterCount:      number;
    readAt:            number;
  }

  function buildSessions(entries: HistoryEntry[]): Session[] {
    if (!entries.length) return [];
    const sessions: Session[] = [];
    let i = 0;
    while (i < entries.length) {
      const anchor = entries[i];
      const group: HistoryEntry[] = [anchor];
      let j = i + 1;
      while (j < entries.length) {
        const next = entries[j];
        if (next.mangaId === anchor.mangaId && anchor.readAt - next.readAt <= SESSION_GAP_MS) {
          group.push(next); j++;
        } else break;
      }
      const latest = group[0], oldest = group[group.length - 1];
      sessions.push({
        mangaId:           latest.mangaId,
        mangaTitle:        latest.mangaTitle,
        thumbnailUrl:      latest.thumbnailUrl,
        latestChapterId:   latest.chapterId,
        latestChapterName: latest.chapterName,
        latestPageNumber:  latest.pageNumber,
        firstChapterName:  oldest.chapterName,
        chapterCount:      group.length,
        readAt:            latest.readAt,
      });
      i = j;
    }
    return sessions;
  }

  const filtered = $derived(search.trim()
    ? store.history.filter(e =>
        e.mangaTitle.toLowerCase().includes(search.toLowerCase()) ||
        e.chapterName.toLowerCase().includes(search.toLowerCase())
      )
    : store.history);

  const sessions = $derived(buildSessions(filtered));

  const groups = $derived.by(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions) {
      const l = dayLabel(s.readAt);
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(s);
    }
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  });

  function handleClear() {
    if (!confirmClear) { confirmClear = true; setTimeout(() => confirmClear = false, 3000); return; }
    clearHistory(); confirmClear = false;
  }
</script>

<div class="root anim-fade-in">

  <div class="header">
    <div class="heading-group">
      <ClockCounterClockwise size={13} weight="light" class="heading-icon" />
      <span class="heading">History</span>
    </div>
    <div class="header-right">
      <div class="search-wrap">
        <MagnifyingGlass size={11} class="search-icon" weight="light" />
        <input class="search" placeholder="Search…" bind:value={search} />
        {#if search}
          <button class="search-clear" onclick={() => search = ""}>×</button>
        {/if}
      </div>
      {#if store.history.length > 0}
        <button
          class="clear-btn"
          class:confirm={confirmClear}
          onclick={handleClear}
          title={confirmClear ? "Click again to confirm" : "Clear history"}
        >
          <Trash size={12} weight="light" />
          {#if confirmClear}<span class="clear-label">Confirm?</span>{/if}
        </button>
      {/if}
    </div>
  </div>

  {#if store.readingStats.totalChaptersRead > 0}
    <div class="stats-grid">
      <div class="stat-card streak">
        <div class="stat-icon-wrap fire">
          <Fire size={12} weight="fill" />
        </div>
        <div class="stat-body">
          <span class="stat-val">{store.readingStats.currentStreakDays}</span>
          <span class="stat-unit">day streak</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap">
          <BookOpen size={12} weight="light" />
        </div>
        <div class="stat-body">
          <span class="stat-val">{store.readingStats.totalChaptersRead}</span>
          <span class="stat-unit">chapters</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap">
          <Clock size={12} weight="light" />
        </div>
        <div class="stat-body">
          <span class="stat-val">{formatReadTime(store.readingStats.totalMinutesRead)}</span>
          <span class="stat-unit">read time</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap">
          <TrendUp size={12} weight="light" />
        </div>
        <div class="stat-body">
          <span class="stat-val">{store.readingStats.totalMangaRead}</span>
          <span class="stat-unit">series</span>
        </div>
      </div>
    </div>
  {/if}

  {#if store.history.length === 0}
    <div class="empty">
      <div class="empty-icon-wrap">
        <ClockCounterClockwise size={24} weight="light" />
      </div>
      <p class="empty-text">No reading history yet</p>
      <p class="empty-hint">Chapters you read will appear here</p>
    </div>
  {:else if sessions.length === 0}
    <div class="empty">
      <div class="empty-icon-wrap">
        <Books size={20} weight="light" />
      </div>
      <p class="empty-text">No results for "{search}"</p>
    </div>
  {:else}
    <div class="timeline">
      {#each groups as { label, items }}
        <div class="day-group">
          <div class="day-header">
            <span class="day-label">{label}</span>
            <div class="day-rule"></div>
          </div>
          <div class="session-list">
            {#each items as session (session.latestChapterId)}
              <button class="session-row" onclick={() => setPreviewManga({ id: session.mangaId, title: session.mangaTitle, thumbnailUrl: thumbFor(session.mangaId, session.thumbnailUrl) } as any)}>
                <div class="thumb-wrap">
                  <Thumbnail src={thumbFor(session.mangaId, session.thumbnailUrl)} alt={session.mangaTitle} class="thumb" />
                  {#if session.chapterCount > 1}
                    <span class="session-count">{session.chapterCount}</span>
                  {/if}
                </div>
                <div class="session-info">
                  <span class="session-title">{session.mangaTitle}</span>
                  <span class="session-chapter">
                    {#if session.chapterCount > 1}
                      {session.firstChapterName}<span class="ch-arrow">→</span>{session.latestChapterName}
                    {:else}
                      {session.latestChapterName}
                      {#if session.latestPageNumber > 1}
                        <span class="ch-page">· p.{session.latestPageNumber}</span>
                      {/if}
                    {/if}
                  </span>
                </div>
                <span class="session-time">{timeAgo(session.readAt)}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .root {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--sp-4) var(--sp-6);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }

  .heading-group {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  :global(.heading-icon) { color: var(--text-faint); }

  .heading {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--text-muted);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-wrap :global(.search-icon) {
    position: absolute;
    left: 8px;
    color: var(--text-faint);
    pointer-events: none;
  }

  .search {
    background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-md);
    padding: 4px 26px;
    color: var(--text-primary);
    font-size: var(--text-xs);
    width: 148px;
    outline: none;
    transition: border-color var(--t-base), width var(--t-base), background var(--t-base);
  }

  .search::placeholder { color: var(--text-faint); }

  .search:focus {
    border-color: var(--border-strong);
    background: var(--bg-elevated);
    width: 200px;
  }

  .search-clear {
    position: absolute;
    right: 8px;
    color: var(--text-faint);
    font-size: 13px;
    line-height: 1;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    transition: color var(--t-base);
  }

  .search-clear:hover { color: var(--text-muted); }

  .clear-btn {
    display: flex; align-items: center; gap: 4px;
    height: 30px; padding: 0 var(--sp-2);
    border-radius: var(--radius-md); border: 1px solid var(--border-dim);
    background: var(--bg-raised); color: var(--text-faint);
    cursor: pointer; font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide); flex-shrink: 0;
    transition: color var(--t-base), background var(--t-base), border-color var(--t-base);
  }
  .clear-btn:hover { color: var(--color-error); background: var(--color-error-bg); border-color: color-mix(in srgb, var(--color-error) 30%, transparent); }
  .clear-btn.confirm { color: var(--color-error); background: var(--color-error-bg); border-color: var(--color-error); }

  .clear-label { font-size: var(--text-2xs); }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px;
    background: var(--border-dim);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    background: var(--bg-base);
    transition: background var(--t-base);
  }

  .stat-card.streak .stat-icon-wrap { background: color-mix(in srgb, #f97316 12%, transparent); }
  .stat-card.streak .stat-val { color: #f97316; }

  .stat-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    background: var(--bg-raised);
    color: var(--text-faint);
    flex-shrink: 0;
  }

  .stat-icon-wrap.fire { color: #f97316; }

  .stat-body {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .stat-val {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    color: var(--text-secondary);
    line-height: 1;
    letter-spacing: -0.01em;
  }

  .stat-unit {
    font-family: var(--font-ui);
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .timeline {
    flex: 1;
    overflow-y: auto;
    padding: var(--sp-4) var(--sp-5) var(--sp-6);
    scrollbar-width: thin;
    scrollbar-color: var(--border-dim) transparent;
  }

  .day-group { margin-bottom: var(--sp-5); }

  .day-header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-bottom: var(--sp-2);
  }

  .day-label {
    font-family: var(--font-ui);
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .day-rule {
    flex: 1;
    height: 1px;
    background: var(--border-dim);
    opacity: 0.5;
  }

  .session-list {
    display: flex;
    flex-direction: column;
  }

  .session-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    padding: var(--sp-2) var(--sp-2);
    border-radius: var(--radius-md);
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background var(--t-fast);
  }

  .session-row:hover { background: var(--bg-raised); }
  .session-row:active { background: var(--bg-elevated); }

  .thumb-wrap {
    position: relative;
    flex-shrink: 0;
  }

  :global(.thumb) {
    width: 38px;
    height: 54px;
    object-fit: cover;
    display: block;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim);
  }

  .session-count {
    position: absolute;
    bottom: -4px;
    right: -6px;
    background: var(--accent-muted);
    border: 1px solid var(--accent-dim);
    color: var(--accent-fg);
    font-family: var(--font-ui);
    font-size: 8px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: var(--radius-sm);
    line-height: 1.3;
    pointer-events: none;
    letter-spacing: 0.02em;
  }

  .session-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow: hidden;
    min-width: 0;
  }

  .session-title {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .session-chapter {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .ch-arrow {
    color: var(--text-faint);
    opacity: 0.35;
    flex-shrink: 0;
  }

  .ch-page {
    color: var(--text-faint);
    opacity: 0.5;
    flex-shrink: 0;
  }

  .session-time {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    flex-shrink: 0;
    white-space: nowrap;
    opacity: 0.45;
  }

  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
  }

  .empty-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-lg);
    background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-faint);
    opacity: 0.5;
    margin-bottom: var(--sp-1);
  }

  .empty-text {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-muted);
  }

  .empty-hint {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
</style>