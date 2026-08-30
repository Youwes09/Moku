<script lang="ts">
  import { Books, ClockCounterClockwise, Clock, BookOpen, Fire, TrendUp, Trash, CaretDown, CaretRight } from 'phosphor-svelte'
  import Thumbnail from '$lib/components/shared/manga/Thumbnail.svelte'
  import { timeAgo, formatReadTime } from '$lib/core/util'
  import type { HistoryGroup, MangaHistoryEntry } from './lib/recentHistory'

  interface Stats {
    currentStreakDays:  number
    totalChaptersRead: number
    totalMinutesRead:  number
    totalMangaRead:    number
  }

  interface Props {
    groups:               HistoryGroup[]
    hasHistory:           boolean
    historySearch:        string
    stats:                Stats
    thumbFor:             (mangaId: string, fallback: string) => string
    onOpenChapter:        (mangaId: string, chapterId: string) => void
    onDeleteMangaHistory: (mangaId: string) => void
  }

  let { groups, hasHistory, historySearch, stats, thumbFor, onOpenChapter, onDeleteMangaHistory }: Props = $props()

  let confirmDelete: { id: string; title: string } | null = $state(null)
  let expandedMangaIds: Set<string> = $state(new Set())

  function toggleExpand(mangaId: string, e: MouseEvent) {
    e.stopPropagation()
    const next = new Set(expandedMangaIds)
    if (next.has(mangaId)) next.delete(mangaId)
    else next.add(mangaId)
    expandedMangaIds = next
  }

  function formatDuration(ms: number): string {
    const totalMin = Math.round(ms / 60_000)
    if (totalMin < 1)  return '< 1 min'
    if (totalMin < 60) return `${totalMin} min`
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  const unitPlural = (k: MangaHistoryEntry['contentType']) =>
    k === 'ANIME' ? 'episodes' : 'chapters'

  function posLabel(k: MangaHistoryEntry['contentType'], v: number): string {
    if (k === 'NOVEL') return v >= 1 ? `${Math.round(v)}%` : ''
    if (k === 'ANIME') {
      if (v < 5) return ''
      const s = Math.round(v)
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }
    return v > 1 ? `p.${v}` : ''
  }
</script>

<div class="root">
  {#if !hasHistory}
    <div class="empty">
      <div class="empty-icon-wrap"><ClockCounterClockwise size={24} weight="light" /></div>
      <p class="empty-text">No reading history yet</p>
      <p class="empty-hint">Chapters you read will appear here</p>
    </div>

  {:else if groups.length === 0}
    <div class="empty">
      <div class="empty-icon-wrap"><Books size={20} weight="light" /></div>
      <p class="empty-text">No results for "{historySearch}"</p>
    </div>

  {:else}
    <div class="timeline">
      {#if stats.totalChaptersRead > 0}
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon-wrap fire"><Fire size={14} weight="fill" /></div>
            <div class="stat-body">
              <span class="stat-val">{stats.currentStreakDays}</span>
              <span class="stat-label">Day streak</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrap accent"><BookOpen size={14} weight="light" /></div>
            <div class="stat-body">
              <span class="stat-val">{stats.totalChaptersRead}</span>
              <span class="stat-label">Chapters read</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrap neutral"><Clock size={14} weight="light" /></div>
            <div class="stat-body">
              <span class="stat-val">{formatReadTime(stats.totalMinutesRead)}</span>
              <span class="stat-label">Read time</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon-wrap neutral"><TrendUp size={14} weight="light" /></div>
            <div class="stat-body">
              <span class="stat-val">{stats.totalMangaRead}</span>
              <span class="stat-label">Series read</span>
            </div>
          </div>
        </div>
      {/if}

      {#each groups as { label, items } (label)}
        <div class="day-group">
          <div class="day-header">
            <span class="day-label">{label}</span>
            <div class="day-rule"></div>
          </div>
          <div class="session-list">
            {#each items as item (item.mangaId)}
              {@const isExpanded = expandedMangaIds.has(item.mangaId)}
              <div class="manga-card-wrap">
                <div
                  class="session-row"
                  role="button"
                  tabindex="0"
                  onclick={() => onOpenChapter(item.mangaId, item.latestChapterId)}
                  onkeydown={(e) => e.key === 'Enter' && onOpenChapter(item.mangaId, item.latestChapterId)}
                >
                  <button
                    class="expand-btn"
                    class:expanded={isExpanded}
                    onclick={(e) => toggleExpand(item.mangaId, e)}
                    title={isExpanded ? 'Collapse chapters' : 'Expand chapters'}
                  >
                    {#if isExpanded}
                      <CaretDown size={12} weight="bold" />
                    {:else}
                      <CaretRight size={12} weight="bold" />
                    {/if}
                  </button>
                  <div class="thumb-wrap">
                    <Thumbnail
                      src={thumbFor(item.mangaId, item.thumbnailUrl)}
                      alt={item.mangaTitle}
                      class="thumb"
                    />
                    {#if item.chaptersSpanned > 1}
                      <span class="session-count">{item.chaptersSpanned}</span>
                    {/if}
                  </div>
                  <div class="session-info">
                    <span class="session-title">{item.mangaTitle}</span>
                    <span class="session-chapter">
                      {item.latestChapterName}
                      {#if item.chaptersSpanned > 1}
                        <span class="ch-page">· {item.chaptersSpanned} {unitPlural(item.contentType)} read</span>
                      {/if}
                      {#if item.durationMs >= 60_000}
                        <span class="ch-duration">· {formatDuration(item.durationMs)}</span>
                      {/if}
                    </span>
                  </div>
                  <span class="session-time">{timeAgo(item.endedAt)}</span>
                  <button
                    class="delete-btn"
                    onclick={(e) => { e.stopPropagation(); confirmDelete = { id: item.mangaId, title: item.mangaTitle } }}
                    title="Clear history for this series"
                  >
                    <Trash size={13} weight="light" />
                  </button>
                </div>

                {#if isExpanded}
                  <div class="sub-chapter-list">
                    {#each item.chapters as ch (ch.chapterId)}
                      <div
                        class="sub-chapter-row"
                        role="button"
                        tabindex="0"
                        onclick={(e) => { e.stopPropagation(); onOpenChapter(item.mangaId, ch.chapterId) }}
                        onkeydown={(e) => e.key === 'Enter' && (e.stopPropagation(), onOpenChapter(item.mangaId, ch.chapterId))}
                      >
                        <div class="sub-chapter-info">
                          <span class="sub-chapter-name">
                            {ch.chapterName}
                            {#if posLabel(item.contentType, ch.endPage)}
                              <span class="ch-page">· {posLabel(item.contentType, ch.endPage)}</span>
                            {/if}
                          </span>
                          {#if ch.durationMs >= 60_000}
                            <span class="sub-chapter-meta">{formatDuration(ch.durationMs)}</span>
                          {/if}
                        </div>
                        <span class="sub-chapter-time">{timeAgo(ch.endedAt)}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if confirmDelete}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={() => confirmDelete = null}
    onkeydown={(e) => e.key === 'Escape' && (confirmDelete = null)}
  >
    <div class="modal-card" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <span class="modal-title">Clear history?</span>
      </div>
      <div class="modal-body">
        <p class="modal-msg">Remove all reading history for <strong>{confirmDelete.title}</strong>?</p>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick={() => confirmDelete = null}>Cancel</button>
        <button
          class="btn-danger"
          onclick={() => {
            if (confirmDelete) onDeleteMangaHistory(confirmDelete.id)
            confirmDelete = null
          }}
        >
          Clear
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .timeline {
    flex: 1; overflow-y: auto; scrollbar-width: thin;
    scrollbar-color: var(--border-dim) transparent;
    padding: var(--sp-4) var(--sp-6) var(--sp-6);
    display: flex; flex-direction: column; gap: var(--sp-5);
  }

  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: var(--sp-2); }

  .stat-card {
    display: flex; align-items: center; gap: var(--sp-3);
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    border-radius: var(--radius-md); padding: var(--sp-3);
    transition: border-color var(--t-fast);
  }
  .stat-card:hover { border-color: var(--border-base); }
  .stat-icon-wrap {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: var(--radius-sm); flex-shrink: 0;
  }
  .fire    { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
  .accent  { background: var(--accent-muted); color: var(--accent-fg); }
  .neutral { background: var(--bg-overlay); color: var(--text-faint); }
  .stat-body  { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .stat-val   { font-family: var(--font-ui); font-size: var(--text-lg, 1.05rem); font-weight: var(--weight-medium); color: var(--text-secondary); line-height: 1; }
  .stat-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; }

  .day-group  { display: flex; flex-direction: column; gap: var(--sp-3); }
  .day-header { display: flex; align-items: center; gap: var(--sp-3); }
  .day-label  { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; flex-shrink: 0; }
  .day-rule   { flex: 1; height: 1px; background: var(--border-dim); }
  .session-list { display: flex; flex-direction: column; gap: var(--sp-2); }

  .manga-card-wrap { display: flex; flex-direction: column; gap: 2px; }

  .session-row {
    position: relative;
    display: flex; align-items: center; gap: var(--sp-3);
    width: 100%; padding: var(--sp-3); border-radius: var(--radius-md);
    border: 1px solid var(--border-dim); background: var(--bg-raised);
    text-align: left; cursor: pointer;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .session-row:hover { border-color: var(--border-strong); background: var(--bg-elevated); }
  .session-row:hover .delete-btn { opacity: 1; }

  .expand-btn {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-faint);
    cursor: pointer; flex-shrink: 0;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .expand-btn:hover { color: var(--text-primary); background: var(--bg-overlay); }
  .expand-btn.expanded { color: var(--accent-fg); }

  .thumb-wrap { position: relative; flex-shrink: 0; }
  :global(.thumb) { width: 38px; height: 54px; object-fit: cover; display: block; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); }
  .session-count {
    position: absolute; bottom: -4px; right: -6px;
    background: var(--accent-muted); border: 1px solid var(--accent-dim); color: var(--accent-fg);
    font-family: var(--font-ui); font-size: 8px; font-weight: 700;
    padding: 1px 3px; border-radius: var(--radius-sm); line-height: 1.3;
    pointer-events: none; letter-spacing: 0.02em;
  }

  .session-info    { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; min-width: 0; }
  .session-title   { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
  .session-chapter {
    display: flex; align-items: center; gap: 4px;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted);
    letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
  }
  .ch-page     { color: var(--text-faint); opacity: 0.5;  flex-shrink: 0; }
  .ch-duration { color: var(--text-faint); opacity: 0.5;  flex-shrink: 0; }
  .session-time {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); flex-shrink: 0; white-space: nowrap; opacity: 0.45;
  }

  .delete-btn {
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-faint);
    cursor: pointer; opacity: 0; flex-shrink: 0;
    transition: opacity var(--t-fast), color var(--t-fast), background var(--t-fast);
  }
  .delete-btn:hover {
    color: var(--color-error);
    background: var(--color-error-bg);
  }

  .sub-chapter-list {
    margin-left: 28px; margin-top: 2px;
    padding-left: var(--sp-3); border-left: 2px solid var(--border-dim);
    display: flex; flex-direction: column; gap: 2px;
  }

  .sub-chapter-row {
    display: flex; align-items: center; gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3); border-radius: var(--radius-sm);
    background: var(--bg-surface); border: 1px solid var(--border-dim);
    cursor: pointer; text-align: left;
    transition: background var(--t-fast), border-color var(--t-fast);
  }
  .sub-chapter-row:hover { background: var(--bg-raised); border-color: var(--border-strong); }

  .sub-chapter-info { flex: 1; display: flex; align-items: center; gap: var(--sp-2); min-width: 0; overflow: hidden; }
  .sub-chapter-name {
    font-family: var(--font-ui); font-size: var(--text-xs);
    font-weight: var(--weight-medium); color: var(--text-secondary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sub-chapter-meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); opacity: 0.5; flex-shrink: 0; }
  .sub-chapter-time { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); opacity: 0.45; flex-shrink: 0; }

  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-2); }
  .empty-icon-wrap {
    width: 44px; height: 44px; border-radius: var(--radius-lg);
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    display: flex; align-items: center; justify-content: center;
    color: var(--text-faint); opacity: 0.5; margin-bottom: var(--sp-1);
  }
  .empty-text { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-muted); }
  .empty-hint { font-size: var(--text-xs); color: var(--text-faint); }

  .modal-backdrop {
    position: fixed; inset: 0; z-index: var(--z-settings, 1000);
    background: rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.12s ease both;
  }
  .modal-card {
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-lg); width: 340px; max-width: 90vw;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); overflow: hidden;
    display: flex; flex-direction: column;
  }
  .modal-header { padding: var(--sp-4) var(--sp-4) var(--sp-2); }
  .modal-title  { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  .modal-body   { padding: 0 var(--sp-4) var(--sp-4); }
  .modal-msg    { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); line-height: 1.4; margin: 0; }
  .modal-actions {
    display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border-dim); background: var(--bg-raised);
  }
  .btn-cancel, .btn-danger {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 12px; border-radius: var(--radius-sm); cursor: pointer;
    transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
  }
  .btn-cancel { border: 1px solid var(--border-dim); background: none; color: var(--text-muted); }
  .btn-cancel:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .btn-danger {
    border: 1px solid color-mix(in srgb, var(--color-error) 40%, transparent);
    background: var(--color-error-bg); color: var(--color-error);
  }
  .btn-danger:hover {
    background: color-mix(in srgb, var(--color-error) 20%, transparent);
    border-color: var(--color-error);
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
