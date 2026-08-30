<script lang="ts">
  interface SkipBand { startPct: number; widthPct: number; kind: string }
  interface Props {
    pct:      number;
    label?:   string | null;
    onSeek:   (pct: number) => void;
    bands?:   SkipBand[];
  }
  let { pct, label = null, onSeek, bands = [] }: Props = $props();

  let hovering = $state(false);
  let hoverPct = $state<number | null>(null);

  const KIND_LABEL: Record<string, string> = { opening: "Opening", ending: "Ending", recap: "Recap" };

  function onMove(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverPct = r.width ? ((e.clientX - r.left) / r.width) * 100 : null;
  }

  const segments = $derived.by(() => {
    const sorted = bands
      .filter((b) => b.widthPct > 0)
      .map((b) => ({ s: Math.max(0, Math.min(100, b.startPct)), e: Math.max(0, Math.min(100, b.startPct + b.widthPct)), kind: b.kind }))
      .sort((a, b) => a.s - b.s);

    const out: { start: number; end: number; kind: string | null }[] = [];
    let cur = 0;
    for (const b of sorted) {
      const s = Math.max(cur, b.s);
      const e = Math.max(s, b.e);
      if (e <= cur) continue;
      if (s > cur) out.push({ start: cur, end: s, kind: null });
      out.push({ start: s, end: e, kind: b.kind });
      cur = e;
    }
    if (cur < 100) out.push({ start: cur, end: 100, kind: null });
    return out.length ? out : [{ start: 0, end: 100, kind: null }];
  });

  function fillOf(seg: { start: number; end: number }): number {
    const span = seg.end - seg.start;
    if (span <= 0) return pct >= seg.end ? 100 : 0;
    return Math.max(0, Math.min(100, ((pct - seg.start) / span) * 100));
  }

  const hoverKind = $derived(
    hoverPct == null ? null : segments.find((s) => s.kind && hoverPct! >= s.start && hoverPct! < s.end)?.kind ?? null,
  );
</script>

<div
  class="ms-wrap"
  role="presentation"
  onmouseenter={() => (hovering = true)}
  onmouseleave={() => { hovering = false; hoverPct = null; }}
  onmousemove={onMove}
>
  <div class="ms-track" aria-hidden="true">
    {#each segments as seg}
      <span
        class="ms-seg"
        style="left:calc({seg.start}% + 1.5px); width:calc({seg.end - seg.start}% - 3px); --seg-played:{fillOf(seg)}%"
      ></span>
    {/each}
  </div>

  <input
    class="h-range"
    type="range"
    min="0" max="100" step="0.1"
    value={pct}
    style="--pct:{pct}%"
    oninput={(e) => onSeek(Number((e.currentTarget as HTMLInputElement).value))}
  />
  {#if hovering && (hoverKind || label)}
    <div class="ms-tooltip" style="left:{Math.max(3, Math.min(97, hoverKind ? (hoverPct ?? pct) : pct))}%">
      {hoverKind ? KIND_LABEL[hoverKind] ?? hoverKind : label}
    </div>
  {/if}
</div>

<style>
  .ms-wrap { flex: 1; position: relative; display: flex; align-items: center; height: 34px; }

  .ms-track {
    position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%);
    height: 3px; z-index: 1; pointer-events: none;
    transition: height 0.15s ease;
  }
  .ms-wrap:hover .ms-track { height: 5px; }

  .ms-seg {
    position: absolute; top: 0; height: 100%;
    border-radius: 2px; overflow: hidden;
    background: var(--border-strong);
  }
  .ms-seg::before {
    content: ""; position: absolute; inset: 0;
    width: var(--seg-played, 0%);
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.08s linear;
  }

  .h-range { -webkit-appearance: none; appearance: none; width: 100%; height: 34px; background: transparent; cursor: pointer; position: relative; z-index: 2; margin: 0; padding: 0; }
  .h-range::-webkit-slider-runnable-track { height: 3px; background: transparent; border-radius: 2px; }
  .h-range::-moz-range-track { height: 3px; background: transparent; border-radius: 2px; }
  .h-range::-moz-range-progress { height: 3px; background: transparent; }
  .h-range::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px rgba(0,0,0,0.5); margin-top: -4.5px; transition: transform var(--t-fast); }
  .h-range:hover::-webkit-slider-thumb,
  .h-range:active::-webkit-slider-thumb { transform: scale(1.3); }
  .h-range::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 2px rgba(0,0,0,0.5); border: none; transition: transform var(--t-fast); }
  .h-range:hover::-moz-range-thumb,
  .h-range:active::-moz-range-thumb { transform: scale(1.3); }

  .ms-tooltip { position: absolute; bottom: calc(100% + 2px); transform: translateX(-50%); background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-sm); padding: 2px 6px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-secondary); white-space: nowrap; pointer-events: none; z-index: 10; letter-spacing: var(--tracking-wide); }
</style>
