<script lang="ts">
  import { X } from "phosphor-svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Snippet } from "svelte";

  interface Props {
    title:        string;
    subtitle?:    string;
    barPosition?: "top" | "left" | "right";
    onClose:      () => void;
    children:     Snippet;
  }
  let { title, subtitle, barPosition = "top", onClose, children }: Props = $props();

  $effect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  });
</script>

<div class="msp-backdrop" role="button" tabindex="-1" aria-label="Close settings"
  onclick={onClose} onkeydown={(e) => e.key === "Enter" && onClose()}
  transition:fade={{ duration: 140 }}></div>

<div
  class="msp"
  class:pos-top={barPosition === "top"}
  class:pos-left={barPosition === "left"}
  class:pos-right={barPosition === "right"}
  role="dialog"
  aria-label={title}
  transition:fly={{ x: 28, duration: 200, easing: cubicOut }}
>
  <header class="msp-header">
    <span class="msp-title">{title}</span>
    {#if subtitle}<span class="msp-sub">{subtitle}</span>{/if}
    <button class="msp-close" aria-label="Close" onclick={onClose}><X size={14} weight="light" /></button>
  </header>

  <div class="msp-body">
    {@render children()}
  </div>
</div>

<style>
  .msp-backdrop {
    position: fixed; inset: 0;
    z-index: 39;
    background: rgba(0, 0, 0, 0.12);
  }

  .msp {
    position: fixed;
    right: var(--sp-3);
    width: 340px;
    max-width: calc(100vw - var(--sp-6));
    z-index: 41;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-lg);
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    backdrop-filter: var(--frost-blur);
    -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
    overflow: hidden;
  }
  .msp.pos-top {
    top: calc(var(--sp-3) + 44px + var(--sp-2));
    bottom: calc(var(--sp-4) + 54px + var(--sp-2));
  }
  .msp.pos-left  { top: var(--sp-3); bottom: var(--sp-3); }
  .msp.pos-right {
    top: var(--sp-3); bottom: var(--sp-3);
    right: calc(var(--sp-3) + 44px + var(--sp-2));
  }

  .msp-header {
    display: flex; align-items: center; gap: var(--sp-2);
    height: 44px; padding: 0 var(--sp-2) 0 var(--sp-4);
    border-bottom: 1px solid var(--frost-border);
    flex-shrink: 0;
  }
  .msp-title {
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--text-secondary); letter-spacing: var(--tracking-tight);
  }
  .msp-sub {
    flex: 1; min-width: 0; text-align: right;
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .msp-close {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--radius-sm);
    color: var(--text-muted); flex-shrink: 0;
    transition: color var(--t-base), background var(--t-base);
  }
  .msp-close:hover { color: var(--text-primary); background: color-mix(in srgb, #fff 8%, transparent); }

  .msp-body {
    flex: 1; overflow-y: auto;
    padding: var(--sp-4);
    display: flex; flex-direction: column; gap: var(--sp-5);
    scrollbar-width: thin;
    scrollbar-color: var(--border-dim) transparent;
  }

  :global(.msp-group) { display: flex; flex-direction: column; gap: var(--sp-2); }
  :global(.msp-label) {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider); text-transform: uppercase;
    color: var(--text-faint); margin: 0;
  }
  :global(.msp-row) {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--sp-3); min-height: 30px;
  }
  :global(.msp-row > span:first-child) {
    font-size: var(--text-xs); color: var(--text-muted); min-width: 0;
  }
  :global(.msp-readout) {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide);
    font-variant-numeric: tabular-nums;
  }
  :global(.msp-hr) { height: 1px; background: var(--frost-border); margin: 2px 0; }
  :global(.msp-badge) {
    font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide);
    text-transform: uppercase; color: var(--text-faint);
    border: 1px solid var(--frost-border); border-radius: 3px;
    padding: 1px 4px; margin-left: 6px; vertical-align: middle;
  }

  :global(.msp-seg) {
    display: flex; gap: 3px; padding: 3px;
    background: color-mix(in srgb, var(--bg-void) 45%, transparent);
    border: 1px solid var(--frost-border); border-radius: var(--radius-md);
  }
  :global(.msp-seg-btn) {
    flex: 1; padding: 5px 8px; border-radius: var(--radius-sm);
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide); text-transform: capitalize;
    color: var(--text-muted); background: none; border: none; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  :global(.msp-seg-btn:hover) { color: var(--text-primary); }
  :global(.msp-seg-btn.on) { background: var(--accent-muted); color: var(--accent-fg); }

  :global(.msp-tiles) { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  :global(.msp-tile) {
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 9px 4px; border-radius: var(--radius-md);
    border: 1px solid var(--frost-border); background: none;
    color: var(--text-faint); cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast);
  }
  :global(.msp-tile:hover) { color: var(--text-secondary); border-color: var(--border-base); }
  :global(.msp-tile.on) {
    color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim);
  }
  :global(.msp-tile-label) {
    font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide);
    text-transform: capitalize; line-height: 1;
  }

  :global(.msp-toggle) {
    position: relative; width: 34px; height: 19px; border-radius: 10px;
    background: var(--border-strong); border: none; cursor: pointer; flex-shrink: 0;
    transition: background var(--t-base);
  }
  :global(.msp-toggle.on) { background: var(--accent); }
  :global(.msp-toggle-knob) {
    position: absolute; top: 2px; left: 2px; width: 15px; height: 15px;
    border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: left var(--t-base);
  }
  :global(.msp-toggle.on .msp-toggle-knob) { left: 17px; }

  :global(.msp-stepper) { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  :global(.msp-stepper button) {
    width: 24px; height: 24px; border-radius: var(--radius-sm);
    border: 1px solid var(--frost-border);
    background: color-mix(in srgb, var(--bg-void) 45%, transparent);
    color: var(--text-muted); font-size: var(--text-base); line-height: 1; cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  :global(.msp-stepper button:hover:not(:disabled)) { color: var(--text-primary); border-color: var(--border-strong); }
  :global(.msp-stepper button:disabled) { opacity: 0.3; cursor: default; }
  :global(.msp-stepper .msp-val) {
    min-width: 44px; text-align: center; font-variant-numeric: tabular-nums;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-primary);
    letter-spacing: var(--tracking-wide);
  }

  :global(.msp-slider) {
    -webkit-appearance: none; appearance: none;
    flex: 1; height: 3px; border-radius: 2px; background: var(--border-strong);
    outline: none; cursor: pointer;
  }
  :global(.msp-slider::-webkit-slider-thumb) {
    -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
  }
  :global(.msp-slider::-moz-range-thumb) {
    width: 13px; height: 13px; border: none; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
  }
</style>
