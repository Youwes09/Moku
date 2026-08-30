<script lang="ts">
  interface Props {
    onConfirm: () => void;
    onCancel:  () => void;
  }

  const { onConfirm, onCancel }: Props = $props();
</script>

<div
  class="backdrop"
  role="dialog"
  aria-modal="true"
  aria-labelledby="storage-dialog-title"
  tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
  onkeydown={(e) => { if (e.key === "Escape") onCancel(); }}
>
  <div class="panel">
    <div class="panel-header">
      <p id="storage-dialog-title" class="panel-title">Low disk space</p>
    </div>
    <div class="panel-body">
      <p class="panel-message">
        The download queue is estimated to exceed 95% of your available storage. Download anyway?
      </p>
    </div>
    <div class="panel-footer">
      <button class="btn-cancel"  onclick={onCancel}>Cancel</button>
      <button class="btn-confirm" onclick={onConfirm}>Download anyway</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 10000;
    background: rgba(0, 0, 0, 0.5);
    display: flex; align-items: center; justify-content: center;
    animation: s-fade-in 0.15s ease both;
  }

  .panel {
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-2xl);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    width: min(380px, calc(100vw - 40px));
    overflow: hidden;
    animation: s-scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .panel-header {
    padding: var(--sp-4) var(--sp-5) var(--sp-3);
    border-bottom: 1px solid var(--border-dim);
  }
  .panel-title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-primary);
    letter-spacing: 0.01em;
  }

  .panel-body { padding: var(--sp-4) var(--sp-5); }
  .panel-message {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-muted);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-snug);
  }

  .panel-footer {
    padding: var(--sp-3) var(--sp-5);
    border-top: 1px solid var(--border-dim);
    display: flex; justify-content: flex-end; gap: var(--sp-2);
  }

  .btn-cancel, .btn-confirm {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    padding: 5px var(--sp-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--t-base), color var(--t-base), border-color var(--t-base);
  }
  .btn-cancel {
    border: 1px solid var(--border-dim);
    background: none;
    color: var(--text-muted);
  }
  .btn-cancel:hover { color: var(--text-primary); border-color: var(--border-strong); }

  .btn-confirm {
    border: 1px solid color-mix(in srgb, var(--color-error) 40%, transparent);
    background: color-mix(in srgb, var(--color-error) 10%, transparent);
    color: var(--color-error);
  }
  .btn-confirm:hover {
    background: color-mix(in srgb, var(--color-error) 18%, transparent);
    border-color: color-mix(in srgb, var(--color-error) 60%, transparent);
  }
</style>