<script lang="ts">
  let {
    dailyReadCounts,
  }: {
    dailyReadCounts: Record<string, number>;
  } = $props();

  function intensity(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    if (count === 1) return 1;
    if (count <= 3)  return 2;
    if (count <= 6)  return 3;
    return 4;
  }

  let tip: { text: string; x: number; y: number } | null = $state(null);

  function showTip(e: MouseEvent, cell: { dateStr: string; count: number }) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const label = cell.count === 0
      ? `No chapters — ${fmtDate(cell.dateStr)}`
      : `${cell.count} chapter${cell.count !== 1 ? "s" : ""} — ${fmtDate(cell.dateStr)}`;
    tip = { text: label, x: rect.left + rect.width / 2, y: rect.top - 6 };
  }

  function hideTip() { tip = null; }

  function fmtDate(d: string): string {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let wrapEl: HTMLElement;
  let cellSize = $state(12);
  let numWeeks = $state(26);

  const GAP        = 3;
  const DAY_GUTTER = 28;
  const LEGEND_H   = 20;
  const MONTH_H    = 14;
  const ROWS       = 7;

  $effect(() => {
    if (!wrapEl) return;
    const obs = new ResizeObserver(() => {
      const h  = wrapEl.clientHeight;
      const w  = wrapEl.clientWidth;
      const cs = Math.max(8, Math.floor((h - LEGEND_H - MONTH_H - 2 * GAP - (ROWS - 1) * GAP) / ROWS));
      cellSize = cs;
      numWeeks = Math.max(4, Math.floor((w - DAY_GUTTER - GAP * 3) / (cs + GAP)));
    });
    obs.observe(wrapEl);
    return () => obs.disconnect();
  });

  const visibleWeeks = $derived((() => {
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = localDateStr(today);
    const endDow   = today.getDay(); // 0=Sun ... 6=Sat
    const weekEnd  = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + (6 - endDow)); // advance to Saturday

    const weeks: { dateStr: string; count: number; isToday: boolean; isFuture: boolean }[][] = [];
    for (let wi = numWeeks - 1; wi >= 0; wi--) {
      const week: typeof weeks[0] = [];
      for (let di = 0; di < 7; di++) {
        const d = new Date(weekEnd);
        d.setDate(d.getDate() - wi * 7 - (6 - di));
        const dateStr = localDateStr(d);
        week.push({ dateStr, count: dailyReadCounts[dateStr] ?? 0, isToday: dateStr === todayStr, isFuture: d > today });
      }
      weeks.push(week);
    }
    return weeks;
  })());

  const monthLabels = $derived((() => {
    const labels: { label: string; colIndex: number }[] = [];
    let lastMonth = -1;
    visibleWeeks.forEach((week, ci) => {
      const first = week[0];
      if (!first) return;
      const m = new Date(first.dateStr + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        labels.push({ label: new Date(first.dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short" }), colIndex: ci });
        lastMonth = m;
      }
    });
    return labels;
  })());

  const DAY_LABELS = ["Sun", "", "Tue", "", "Thu", "", "Sat"];
</script>

<div class="heatmap-wrap" bind:this={wrapEl} style="--cell:{cellSize}px; --cols:{numWeeks};">

  <div class="month-row">
    <div class="day-gutter"></div>
    <div class="month-cells">
      {#each visibleWeeks as _week, ci}
        {@const lbl = monthLabels.find(l => l.colIndex === ci)}
        <div class="month-label">{lbl?.label ?? ""}</div>
      {/each}
    </div>
  </div>

  <div class="grid-row">
    <div class="day-labels">
      {#each DAY_LABELS as d}
        <span class="day-label">{d}</span>
      {/each}
    </div>
    <div class="cell-grid">
      {#each visibleWeeks as week}
        <div class="week-col">
          {#each week as cell}
            <!-- svelte-ignore a11y_mouse_events_have_key_events -->
            <button
              class="cell intensity-{intensity(cell.count)}"
              class:cell-today={cell.isToday}
              class:cell-future={cell.isFuture}
              onmouseover={(e) => showTip(e, cell)}
              onmouseleave={hideTip}
              aria-label="{cell.count} chapters on {cell.dateStr}"
            ></button>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <div class="legend">
    <span class="legend-label">Less</span>
    {#each [0, 1, 2, 3, 4] as lvl}
      <div class="legend-cell intensity-{lvl}"></div>
    {/each}
    <span class="legend-label">More</span>
  </div>

</div>

{#if tip}
  <div class="heatmap-tip" style="left:{tip.x}px; top:{tip.y}px;">{tip.text}</div>
{/if}

<style>
  .heatmap-wrap {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  .month-row {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  .day-gutter { width: 28px; flex-shrink: 0; }
  .month-cells {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell));
    gap: 3px;
    overflow: hidden;
  }
  .month-label {
    font-family: var(--font-ui);
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    padding-left: 1px;
    white-space: nowrap;
    overflow: hidden;
  }

  .grid-row {
    display: flex;
    gap: 4px;
    align-items: flex-start;
    flex-shrink: 0;
  }
  .day-labels {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex-shrink: 0;
    width: 28px;
  }
  .day-label {
    font-family: var(--font-ui);
    font-size: 8px;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    height: var(--cell);
    line-height: var(--cell);
    text-align: right;
  }

  .cell-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell));
    gap: 3px;
    overflow: visible;
    padding: 4px;
    margin: -4px;
  }
  .week-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cell {
    width: var(--cell);
    height: var(--cell);
    border-radius: 3px;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: filter var(--t-fast), transform var(--t-fast);
  }
  .cell:hover:not(.cell-future) {
    filter: brightness(1.5);
    transform: scale(1.2);
    z-index: 1;
    position: relative;
  }

  .intensity-0 { background: var(--bg-subtle);     border: 1px solid var(--border-dim); }
  .intensity-1 { background: var(--accent-muted);  border: 1px solid var(--accent-dim); }
  .intensity-2 { background: var(--accent-dim);    border: 1px solid var(--accent);     opacity: 0.7; }
  .intensity-3 { background: var(--accent);        border: 1px solid var(--accent-bright); opacity: 0.85; }
  .intensity-4 { background: var(--accent-bright); border: 1px solid var(--accent-fg); }

  .cell-today { outline: 1.5px solid var(--accent-fg); outline-offset: 1px; }
  .cell-future { opacity: 0.2; cursor: default; pointer-events: none; }

  .legend {
    display: flex;
    align-items: center;
    gap: 3px;
    justify-content: flex-end;
    flex-shrink: 0;
    padding-top: 2px;
  }
  .legend-cell {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .legend-label {
    font-family: var(--font-ui);
    font-size: 9px;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
  }

  .heatmap-tip {
    position: fixed;
    transform: translate(-50%, -100%);
    background: var(--bg-overlay);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-sm);
    padding: 4px 8px;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-secondary);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    pointer-events: none;
    z-index: 9999;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
</style>