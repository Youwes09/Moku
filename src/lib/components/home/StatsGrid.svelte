<script lang="ts">
  import { Fire, BookOpen, Clock, Books, CalendarCheck, CalendarBlank, TrendUp } from 'phosphor-svelte'
  import { formatReadTime, timeAgo } from '$lib/core/util'
  import type { ReadingStats, ReadSession, MediaKind } from '$lib/types/history'
  import type { Manga } from '$lib/types'

  let { stats, sessions, library }: { stats: ReadingStats; sessions: ReadSession[]; library: Manga[] } = $props()

  const sinceLabel = $derived(
    stats.firstReadAt
      ? new Date(stats.firstReadAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '—'
  )

  const TYPES: { key: MediaKind; label: string; color: string }[] = [
    { key: 'MANGA', label: 'Manga',  color: 'var(--accent)' },
    { key: 'NOVEL', label: 'Novels', color: '#7c7cf0' },
    { key: 'ANIME', label: 'Anime',  color: '#f0a05a' },
  ]

  const byType = $derived.by(() => {
    const m: Record<MediaKind, number> = { MANGA: 0, NOVEL: 0, ANIME: 0 }
    for (const item of library) {
      const total = item.chapters?.totalCount ?? 0
      const read  = Math.max(0, total - (item.unreadCount ?? 0))
      const kind  = (item.contentType as MediaKind) ?? 'MANGA'
      if (kind in m) m[kind] += read
    }
    const total = m.MANGA + m.NOVEL + m.ANIME
    return { m, total }
  })

  const R = 42
  const CIRC = 2 * Math.PI * R

  const arcs = $derived.by(() => {
    const { m, total } = byType
    if (total === 0) return []
    let offset = 0
    return TYPES.filter(t => m[t.key] > 0).map(t => {
      const frac = m[t.key] / total
      const arc = { ...t, count: m[t.key], pct: Math.round(frac * 100), len: frac * CIRC, off: offset }
      offset += frac * CIRC
      return arc
    })
  })

  const weekTotal = $derived.by(() => {
    const cut = Date.now() - 7 * 86_400_000
    return sessions.reduce((n, s) => n + (s.endedAt >= cut ? (s.chaptersSpanned || 0) : 0), 0)
  })

  const perDay = $derived.by(() => {
    if (!stats.firstReadAt || stats.totalChaptersRead === 0) return '0'
    const days = Math.max(1, Math.ceil((Date.now() - stats.firstReadAt) / 86_400_000))
    return (stats.totalChaptersRead / days).toFixed(1)
  })

  const tiles = $derived([
    { icon: BookOpen,      value: String(stats.totalChaptersRead), label: 'Chapters / episodes' },
    { icon: Clock,         value: formatReadTime(stats.totalMinutesRead), label: 'Read time' },
    { icon: CalendarBlank, value: String(weekTotal), label: 'This week' },
    { icon: TrendUp,       value: perDay, label: 'Per day' },
    { icon: Books,         value: String(stats.totalMangaRead), label: 'Series started' },
    { icon: CalendarCheck, value: sinceLabel, label: 'Reading since' },
  ])
</script>

<div class="stats">
  <div class="head">
    <span class="head-title"><TrendUp size={10} weight="bold" /> Your Stats</span>
  </div>

  <div class="streak">
    <div class="streak-flame"><Fire size={18} weight="fill" /></div>
    <div class="streak-body">
      <span class="streak-val">{stats.currentStreakDays}<span class="streak-unit">day{stats.currentStreakDays === 1 ? '' : 's'}</span></span>
      <span class="streak-label">Current streak</span>
    </div>
    <div class="streak-best">
      <span class="streak-best-val">{stats.longestStreakDays}d</span>
      <span class="streak-best-label">best</span>
    </div>
  </div>

  <div class="breakdown">
    <div class="section-head">
      <span class="section-label">Read by type</span>
    </div>
    {#if byType.total === 0}
      <p class="empty">No reading tracked yet.</p>
    {:else}
      <div class="donut-row">
        <svg class="donut" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="donut-track" cx="50" cy="50" r={R} />
          {#each arcs as a}
            <circle
              cx="50" cy="50" r={R}
              stroke={a.color}
              stroke-dasharray="{a.len} {CIRC - a.len}"
              stroke-dashoffset={-a.off}
            />
          {/each}
        </svg>
        <div class="legend">
          {#each arcs as a}
            <div class="legend-row">
              <span class="legend-dot" style="background:{a.color}"></span>
              <span class="legend-name">{a.label}</span>
              <span class="legend-count">{a.count}</span>
              <span class="legend-pct">{a.pct}%</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="grid">
    {#each tiles as t}
      <div class="tile">
        <div class="tile-icon"><t.icon size={14} weight="light" /></div>
        <div class="tile-body">
          <span class="tile-val">{t.value}</span>
          <span class="tile-label">{t.label}</span>
        </div>
      </div>
    {/each}
  </div>

  <div class="foot">
    Updated {stats.lastReadAt ? timeAgo(stats.lastReadAt) : '—'}
  </div>
</div>

<style>
  .stats {
    display: flex; flex-direction: column; gap: var(--sp-3);
    min-width: 0; min-height: 100%;
    justify-content: space-between;
  }

  .head { display: flex; align-items: center; }
  .head-title {
    display: inline-flex; align-items: center; gap: var(--sp-2);
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase;
  }
  .section-head { display: flex; align-items: baseline; gap: var(--sp-2); }
  .section-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase;
  }

  .streak {
    display: flex; align-items: center; gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    background: linear-gradient(90deg, rgba(251,146,60,0.12), rgba(251,146,60,0.03));
    border: 1px solid rgba(251,146,60,0.22);
    border-radius: var(--radius-md);
  }
  .streak-flame {
    display: flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: var(--radius-sm); flex-shrink: 0;
    background: rgba(251,146,60,0.18); color: #fb923c;
  }
  .streak-body { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .streak-val {
    font-family: var(--font-ui); font-size: 1.4rem; font-weight: var(--weight-medium);
    color: var(--text-primary); line-height: 1; display: flex; align-items: baseline; gap: 5px;
  }
  .streak-unit { font-size: var(--text-2xs); font-weight: var(--weight-normal); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .streak-label {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
  }
  .streak-best { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; flex-shrink: 0; }
  .streak-best-val { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-secondary); line-height: 1; }
  .streak-best-label {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); text-transform: uppercase;
  }

  .breakdown { display: flex; flex-direction: column; gap: var(--sp-3); }
  .empty {
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); margin: 0;
  }
  .donut-row { display: flex; align-items: center; gap: var(--sp-4); }
  .donut {
    width: 108px; height: 108px; flex-shrink: 0; transform: rotate(-90deg);
  }
  .donut circle {
    fill: none; stroke-width: 13;
    transition: stroke-dasharray var(--t-base);
  }
  .donut-track { stroke: var(--bg-raised); }

  .legend { display: flex; flex-direction: column; gap: var(--sp-2); flex: 1; min-width: 0; }
  .legend-row {
    display: flex; align-items: center; gap: var(--sp-2);
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
  }
  .legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .legend-name { color: var(--text-muted); flex: 1; min-width: 0; }
  .legend-count { color: var(--text-secondary); }
  .legend-pct { color: var(--text-faint); min-width: 30px; text-align: right; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); }

  .foot {
    padding-top: var(--sp-2); border-top: 1px solid var(--border-dim);
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide);
    text-align: right;
  }
  .tile {
    display: flex; align-items: center; gap: var(--sp-3);
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    border-radius: var(--radius-md); padding: var(--sp-3);
    transition: border-color var(--t-fast);
  }
  .tile:hover { border-color: var(--border-base); }
  .tile-icon {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: var(--radius-sm); flex-shrink: 0;
    background: var(--bg-overlay); color: var(--text-faint);
  }
  .tile-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .tile-val {
    font-family: var(--font-ui); font-size: var(--text-base);
    font-weight: var(--weight-medium); color: var(--text-secondary); line-height: 1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tile-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
