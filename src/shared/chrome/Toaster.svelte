<script lang="ts">
  import { store, dismissToast } from "@store/state.svelte";
  import type { Toast } from "@store/state.svelte";

  const EXIT_MS = 280;
  const leaving = new Set<string>();
  const timers  = new Map<string, ReturnType<typeof setTimeout>>();

  let detail = $state<Toast | null>(null);

  function schedule(t: Toast) {
    if (timers.has(t.id)) return;
    const dur = t.duration ?? 3500;
    if (dur === 0) return;
    timers.set(t.id, setTimeout(() => dismiss(t.id), dur));
  }

  function dismiss(id: string) {
    if (leaving.has(id)) return;
    leaving.add(id);
    if (timers.has(id)) { clearTimeout(timers.get(id)!); timers.delete(id); }
    const el = document.querySelector<HTMLElement>(`[data-toast-id="${id}"]`);
    if (!el) { finalize(id); return; }
    const h = el.offsetHeight;
    el.style.setProperty("--exit-h", `${h}px`);
    el.classList.add("leaving");
    setTimeout(() => finalize(id), EXIT_MS);
  }

  function finalize(id: string) {
    leaving.delete(id);
    dismissToast(id);
  }

  function openDetail(e: MouseEvent, t: Toast) {
    e.preventDefault();
    detail = t;
    if (timers.has(t.id)) { clearTimeout(timers.get(t.id)!); timers.delete(t.id); }
  }

  function closeDetail() {
    detail = null;
  }

  $effect(() => {
    const activeIds = new Set(store.toasts.map(t => t.id));
    store.toasts.forEach(schedule);
    for (const [id, timer] of timers) {
      if (!activeIds.has(id)) { clearTimeout(timer); timers.delete(id); }
    }
    if (detail && !activeIds.has(detail.id)) detail = null;
  });

  const icons: Record<Toast["kind"], string> = {
    success:  "M20 6L9 17l-5-5",
    error:    "M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    info:     "M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z",
    download: "M12 3v13M7 11l5 5 5-5M5 21h14",
  };
</script>

{#if store.toasts.length}
  <div class="toaster" aria-live="polite">
    {#each store.toasts as t (t.id)}
      <button class="toast toast-{t.kind}" data-toast-id={t.id} aria-label="{t.title}{t.body ? ': ' + t.body : ''}"
        onclick={() => dismiss(t.id)}
        oncontextmenu={(e) => openDetail(e, t)}
      >
        <div class="accent-bar"></div>
        <span class="icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d={icons[t.kind]} />
          </svg>
        </span>
        <div class="body">
          <p class="title">{t.title}</p>
          <p class="sub">{t.body ?? '\u00a0'}</p>
        </div>
      </button>
    {/each}
  </div>
{/if}

{#if detail}
  <div class="detail-backdrop" role="presentation" onclick={closeDetail} oncontextmenu={(e) => e.preventDefault()}>
    <div class="detail-panel detail-{detail.kind}" role="dialog" onclick={(e) => e.stopPropagation()}>
      <div class="detail-accent"></div>
      <div class="detail-body">
        <div class="detail-header">
          <span class="detail-kind">{detail.kind}</span>
          <button class="detail-close" onclick={closeDetail} aria-label="Close">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <p class="detail-title">{detail.title}</p>
        {#if detail.body}
          <pre class="detail-text">{detail.body}</pre>
        {/if}
        <div class="detail-actions">
          <button class="detail-copy" onclick={() => navigator.clipboard.writeText(`${detail!.title}${detail!.body ? '\n' + detail!.body : ''}`)}>
            Copy
          </button>
          <button class="detail-dismiss" onclick={() => { dismiss(detail!.id); closeDetail(); }}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .toaster { position: fixed; bottom: var(--sp-5); right: var(--sp-5); z-index: 9999; display: flex; flex-direction: column; gap: 5px; pointer-events: none; }

  .toast {
    display: flex; align-items: center; gap: 10px; padding: 12px var(--sp-3) 12px 0;
    border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
    pointer-events: all; width: 280px; overflow: hidden; cursor: pointer;
    font-family: inherit; font-size: inherit; color: inherit; text-align: left;
    will-change: transform, opacity;
    animation: slideIn 0.35s cubic-bezier(0.16,1,0.3,1) both;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }
  .toast:hover  { border-color: var(--border-base); box-shadow: 0 12px 40px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset; transform: translateX(-3px); }
  .toast:active { transform: translateX(0) scale(0.98); }

  :global(.toast.leaving) { animation: slideOut 0.28s cubic-bezier(0.4,0,1,1) forwards !important; pointer-events: none; }

  @keyframes slideIn  { from { opacity:0; transform:translateX(20px) scale(0.96) } to { opacity:1; transform:translateX(0) scale(1) } }
  @keyframes slideOut {
    0%   { opacity:1; transform:translateX(0) scale(1);       max-height:var(--exit-h,80px); margin-bottom:0; }
    40%  { opacity:0; transform:translateX(14px) scale(0.96); max-height:var(--exit-h,80px); margin-bottom:0; }
    100% { opacity:0; transform:translateX(14px) scale(0.96); max-height:0;                  margin-bottom:-5px; }
  }

  .accent-bar { width: 3px; align-self: stretch; flex-shrink: 0; border-radius: 0 2px 2px 0; }
  .toast-success  .accent-bar { background: var(--accent-fg); }
  .toast-error    .accent-bar { background: var(--color-error); }
  .toast-info     .accent-bar { background: var(--text-faint); }
  .toast-download .accent-bar { background: var(--accent-fg); }

  .icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
  .toast-success  .icon { color: var(--accent-fg); }
  .toast-error    .icon { color: var(--color-error); }
  .toast-info     .icon { color: var(--text-muted); }
  .toast-download .icon { color: var(--accent-fg); }

  .body  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  .title { font-size: var(--text-xs); font-family: var(--font-ui); color: var(--text-secondary); font-weight: var(--weight-medium); letter-spacing: var(--tracking-wide); line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub   { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .detail-backdrop {
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.15s ease both;
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

  .detail-panel {
    display: flex; width: 420px; max-width: calc(100vw - 32px); max-height: 60vh;
    border-radius: var(--radius-lg); background: var(--bg-raised);
    border: 1px solid var(--border-base);
    box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.05) inset;
    overflow: hidden;
    animation: popIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes popIn { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }

  .detail-accent { width: 3px; flex-shrink: 0; }
  .detail-error   .detail-accent { background: var(--color-error); }
  .detail-success .detail-accent { background: var(--accent-fg); }
  .detail-info    .detail-accent { background: var(--text-faint); }
  .detail-download .detail-accent { background: var(--accent-fg); }

  .detail-body { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: var(--sp-3); gap: var(--sp-2); overflow: hidden; }

  .detail-header { display: flex; align-items: center; justify-content: space-between; }
  .detail-kind {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider);
    text-transform: uppercase; color: var(--text-faint);
  }
  .detail-error   .detail-kind { color: var(--color-error); }

  .detail-close {
    display: flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: var(--radius-sm);
    background: none; border: none; color: var(--text-faint); cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .detail-close:hover { color: var(--text-primary); background: var(--bg-overlay); }

  .detail-title {
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--text-secondary); font-weight: var(--weight-medium);
    line-height: var(--leading-snug); word-break: break-word;
  }

  .detail-text {
    flex: 1; min-height: 0; overflow-y: auto;
    font-family: var(--font-mono, monospace); font-size: var(--text-xs);
    color: var(--text-muted); line-height: var(--leading-relaxed);
    white-space: pre-wrap; word-break: break-all;
    background: var(--bg-void); border: 1px solid var(--border-dim);
    border-radius: var(--radius-sm); padding: var(--sp-2) var(--sp-3);
    scrollbar-width: thin;
    margin: 0;
  }

  .detail-actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-1); }
  .detail-copy, .detail-dismiss {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 5px var(--sp-3); border-radius: var(--radius-sm); cursor: pointer;
    transition: color var(--t-base), background var(--t-base), border-color var(--t-base);
  }
  .detail-copy {
    border: 1px solid var(--border-dim); background: none; color: var(--text-muted);
  }
  .detail-copy:hover { color: var(--text-primary); border-color: var(--border-strong); background: var(--bg-overlay); }
  .detail-dismiss {
    border: 1px solid color-mix(in srgb, var(--color-error) 40%, transparent);
    background: color-mix(in srgb, var(--color-error) 10%, transparent);
    color: var(--color-error);
  }
  .detail-dismiss:hover { background: color-mix(in srgb, var(--color-error) 18%, transparent); }
</style>