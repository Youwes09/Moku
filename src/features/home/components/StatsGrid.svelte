<script lang="ts">
  import { Fire, BookOpen, Clock, TrendUp, Bell, CalendarBlank } from "phosphor-svelte";
  import { formatReadTime } from "../lib/homeHelpers";

  let {
    stats,
    updateCount,
  }: {
    stats: {
      currentStreakDays: number;
      totalChaptersRead: number;
      totalMinutesRead: number;
      totalMangaRead: number;
      longestStreakDays: number;
    };
    updateCount: number;
  } = $props();
</script>

<div class="col">
  <div class="col-header">
    <span class="col-title"><TrendUp size={10} weight="bold" /> Your Stats</span>
  </div>
  <div class="grid">
    <div class="card">
      <div class="icon-wrap fire"><Fire size={15} weight="fill" /></div>
      <div class="body">
        <span class="val">{stats.currentStreakDays}</span>
        <span class="label">Day streak</span>
      </div>
    </div>
    <div class="card">
      <div class="icon-wrap accent"><BookOpen size={15} weight="light" /></div>
      <div class="body">
        <span class="val">{stats.totalChaptersRead}</span>
        <span class="label">Chapters read</span>
      </div>
    </div>
    <div class="card">
      <div class="icon-wrap neutral"><Clock size={15} weight="light" /></div>
      <div class="body">
        <span class="val">{formatReadTime(stats.totalMinutesRead)}</span>
        <span class="label">Read time</span>
      </div>
    </div>
    <div class="card">
      <div class="icon-wrap neutral"><TrendUp size={15} weight="light" /></div>
      <div class="body">
        <span class="val">{stats.totalMangaRead}</span>
        <span class="label">Series started</span>
      </div>
    </div>
    <div class="card">
      <div class="icon-wrap green"><Bell size={15} weight="light" /></div>
      <div class="body">
        <span class="val">{updateCount}</span>
        <span class="label">New updates</span>
      </div>
    </div>
    <div class="card">
      <div class="icon-wrap neutral"><CalendarBlank size={15} weight="light" /></div>
      <div class="body">
        <span class="val">{stats.longestStreakDays}d</span>
        <span class="label">Best streak</span>
      </div>
    </div>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; min-width: 0; }

  .col-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--sp-2);
  }
  .col-title {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); }

  .card {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    background: var(--bg-raised);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-md);
    padding: var(--sp-3);
    transition: border-color var(--t-fast);
  }
  .card:hover { border-color: var(--border-base); }

  .icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  .fire    { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
  .accent  { background: var(--accent-muted); color: var(--accent-fg); }
  .neutral { background: var(--bg-overlay); color: var(--text-faint); }
  .green   { background: rgba(34, 197, 94, 0.12); color: #22c55e; }

  .body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .val {
    font-family: var(--font-ui);
    font-size: var(--text-lg, 1.05rem);
    font-weight: var(--weight-medium);
    color: var(--text-secondary);
    line-height: 1;
  }
  .label {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
  }
</style>