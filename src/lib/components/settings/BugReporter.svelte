<script lang="ts">
  import { Bug, Lightbulb, X, ArrowSquareOut, ClipboardText, Check, CaretDown, CaretRight } from 'phosphor-svelte'
  import { platformService } from '$lib/platform-service'
  import { tsunagu }  from '$lib/server-adapters/tsunagu'
  import { settingsState }   from '$lib/state/settings.svelte'
  import type { Settings }   from '$lib/types/settings'
  import {
    SETTINGS_GROUPS,
    buildEnvironmentBlock,
    buildSettingsBlock,
    buildIssueUrl,
    type ReportType,
    type BugFields,
    type FeatureFields,
  } from './lib/bugReport'

  interface Props { onClose: () => void }
  let { onClose }: Props = $props()

  type Step = 'type' | 'compose'

  let step:       Step       = $state('type')
  let reportType: ReportType = $state('bug')

  let title        = $state('')
  let description  = $state('')
  let steps        = $state('')
  let expected     = $state('')
  let actual       = $state('')
  let problem      = $state('')
  let solution     = $state('')
  let alternatives = $state('')

  let serverVersion = $state<string | undefined>(undefined)

  $effect(() => {
    tsunagu.about()
      .then(s => { serverVersion = s.version })
      .catch(() => {})
  })

  let selectedKeys   = $state<Set<keyof Settings>>(new Set())
  let expandedGroups = $state<Set<string>>(new Set(['Library', 'Reader']))

  function toggleGroup(label: string) {
    const next = new Set(expandedGroups)
    next.has(label) ? next.delete(label) : next.add(label)
    expandedGroups = next
  }

  function selectGroupAll(keys: (keyof Settings)[]) {
    const next   = new Set(selectedKeys)
    const allOn  = keys.every(k => next.has(k))
    keys.forEach(k => allOn ? next.delete(k) : next.add(k))
    selectedKeys = next
  }

  function toggleKey(k: keyof Settings) {
    const next = new Set(selectedKeys)
    next.has(k) ? next.delete(k) : next.add(k)
    selectedKeys = next
  }

  let copied = $state(false)

  function buildPreview(): string {
    const env  = buildEnvironmentBlock(serverVersion)
    const sets = buildSettingsBlock([...selectedKeys])

    if (reportType === 'bug') {
      return [
        `**Description**\n${description || '(empty)'}`,
        `**Steps to Reproduce**\n${steps || '(empty)'}`,
        `**Expected**\n${expected || '(empty)'}`,
        `**Actual**\n${actual || '(empty)'}`,
        `**Environment**\n${env}`,
        sets ? `**Relevant Settings**\n\`\`\`yaml\n${sets}\n\`\`\`` : null,
      ].filter(Boolean).join('\n\n')
    } else {
      return [
        `**Problem / Motivation**\n${problem || '(empty)'}`,
        `**Proposed Solution**\n${solution || '(empty)'}`,
        alternatives ? `**Alternatives**\n${alternatives}` : null,
        `**Environment**\n${env}`,
      ].filter(Boolean).join('\n\n')
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildPreview())
    copied = true
    setTimeout(() => (copied = false), 2000)
  }

  async function handleOpen() {
    const settingsBlock = buildSettingsBlock([...selectedKeys])
    const fields: BugFields | FeatureFields = reportType === 'bug'
      ? { description, steps, expected, actual }
      : { problem, solution, alternatives }
    const url = buildIssueUrl(reportType, settingsBlock, title, fields, serverVersion)
    await platformService.openExternal(url)
  }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }

  function formatKeyVal(key: keyof Settings): string {
    const v = settingsState.settings[key]
    if (v === undefined || v === null) return '~'
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (typeof v === 'string') return v === '' ? '""' : v.length > 18 ? v.slice(0, 18) + '…' : v
    if (typeof v === 'number') return String(v)
    return '…'
  }

  const envBlock = $derived(buildEnvironmentBlock(serverVersion))

  const canSubmit = $derived(
    reportType === 'bug'
      ? title.trim().length > 0 && description.trim().length > 0
      : title.trim().length > 0 && problem.trim().length > 0
  )

  function autoResize(node: HTMLTextAreaElement) {
    function resize() {
      node.style.height = 'auto'
      node.style.height = node.scrollHeight + 'px'
    }
    resize()
    node.addEventListener('input', resize)
    return { destroy() { node.removeEventListener('input', resize) } }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="br-backdrop"
  role="button" tabindex="-1" aria-label="Close"
  onclick={(e) => { if (e.target === e.currentTarget) onClose() }}
  onkeydown={(e) => e.key === 'Escape' && onClose()}>

  <div class="br-shell" role="dialog" aria-label="Report an issue"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}>

    <header class="br-header">
      <div class="br-header-left">
        {#if reportType === 'bug'}
          <Bug size={15} weight="duotone" class="br-header-icon bug" />
        {:else}
          <Lightbulb size={15} weight="duotone" class="br-header-icon feature" />
        {/if}
        <span class="br-title">
          {step === 'type' ? 'Report an Issue' : reportType === 'bug' ? 'Bug Report' : 'Feature Request'}
        </span>
      </div>
      <button class="br-close" onclick={onClose} aria-label="Close"><X size={14} weight="bold" /></button>
    </header>

    {#if step === 'type'}
      <div class="br-type-step">
        <p class="br-type-hint">What would you like to submit?</p>
        <div class="br-type-cards">
          <button class="br-type-card" class:selected={reportType === 'bug'}
            onclick={() => { reportType = 'bug'; step = 'compose' }}>
            <Bug size={28} weight="duotone" />
            <span class="br-type-name">Bug Report</span>
            <span class="br-type-desc">Something isn't working as expected</span>
          </button>
          <button class="br-type-card" class:selected={reportType === 'feature'}
            onclick={() => { reportType = 'feature'; step = 'compose' }}>
            <Lightbulb size={28} weight="duotone" />
            <span class="br-type-name">Feature Request</span>
            <span class="br-type-desc">Suggest an improvement or new idea</span>
          </button>
        </div>
      </div>

    {:else}
      <div class="br-compose">

        <div class="br-form">
          <div class="br-form-scroll">

            <div class="br-field">
              <label class="br-label" for="br-title">Title <span class="br-required">*</span></label>
              <input id="br-title" class="br-input" bind:value={title}
                placeholder={reportType === 'bug' ? 'Short summary of the bug' : 'Short summary of your idea'}
                maxlength={120} spellcheck />
            </div>

            {#if reportType === 'bug'}
              <div class="br-field">
                <label class="br-label" for="br-desc">Description <span class="br-required">*</span></label>
                <textarea id="br-desc" class="br-textarea" bind:value={description}
                  use:autoResize
                  placeholder="What's broken? A clear, concise summary." rows={3} spellcheck></textarea>
              </div>
              <div class="br-field">
                <label class="br-label" for="br-steps">Steps to Reproduce</label>
                <textarea id="br-steps" class="br-textarea" bind:value={steps}
                  use:autoResize
                  placeholder={"1. Open Settings → Library\n2. Enable \"Always show card stats\"\n3. Return to Library\n4. Unread counts are not visible"}
                  rows={4} spellcheck></textarea>
              </div>
              <div class="br-field-row">
                <div class="br-field">
                  <label class="br-label" for="br-expected">Expected</label>
                  <textarea id="br-expected" class="br-textarea" bind:value={expected}
                    use:autoResize
                    placeholder="What should have happened?" rows={2} spellcheck></textarea>
                </div>
                <div class="br-field">
                  <label class="br-label" for="br-actual">Actual</label>
                  <textarea id="br-actual" class="br-textarea" bind:value={actual}
                    use:autoResize
                    placeholder="What actually happened?" rows={2} spellcheck></textarea>
                </div>
              </div>
            {:else}
              <div class="br-field">
                <label class="br-label" for="br-problem">Problem / Motivation <span class="br-required">*</span></label>
                <textarea id="br-problem" class="br-textarea" bind:value={problem}
                  use:autoResize
                  placeholder="What gap or frustration does this address?" rows={3} spellcheck></textarea>
              </div>
              <div class="br-field">
                <label class="br-label" for="br-solution">Proposed Solution <span class="br-required">*</span></label>
                <textarea id="br-solution" class="br-textarea" bind:value={solution}
                  use:autoResize
                  placeholder="What would you like to see?" rows={3} spellcheck></textarea>
              </div>
              <div class="br-field">
                <label class="br-label" for="br-alt">Alternatives Considered</label>
                <textarea id="br-alt" class="br-textarea" bind:value={alternatives}
                  use:autoResize
                  placeholder="Any workarounds or other approaches?" rows={2} spellcheck></textarea>
              </div>
            {/if}

            <div class="br-field">
              <label class="br-label" for="br-env">Environment <span class="br-auto">auto-filled</span></label>
              <pre id="br-env" class="br-env-block">{envBlock}</pre>
            </div>

          </div>
        </div>

        {#if reportType === 'bug'}
          <div class="br-sidebar">
            <div class="br-sidebar-header">
              <span class="br-sidebar-title">Include Settings</span>
              <span class="br-sidebar-hint">Select groups relevant to the bug</span>
            </div>
            <div class="br-sidebar-scroll">
              {#each SETTINGS_GROUPS as group}
                {@const selectedInGroup = group.keys.filter(k => selectedKeys.has(k)).length}
                {@const allSelected     = selectedInGroup === group.keys.length}
                {@const expanded        = expandedGroups.has(group.label)}

                <div class="br-group">
                  <div class="br-group-row">
                    <button class="br-group-toggle" onclick={() => toggleGroup(group.label)}>
                      {#if expanded}
                        <CaretDown size={9} weight="bold" />
                      {:else}
                        <CaretRight size={9} weight="bold" />
                      {/if}
                      <span class="br-group-label">{group.label}</span>
                      {#if selectedInGroup > 0}
                        <span class="br-group-count">{selectedInGroup}</span>
                      {/if}
                    </button>
                    <button class="br-group-all"
                      class:active={allSelected}
                      onclick={() => selectGroupAll(group.keys)}
                      title={allSelected ? 'Deselect all' : 'Select all'}>
                      {allSelected ? 'none' : 'all'}
                    </button>
                  </div>

                  {#if expanded}
                    <div class="br-key-list">
                      {#each group.keys as key}
                        <label class="br-key-row">
                          <input type="checkbox"
                            checked={selectedKeys.has(key)}
                            onchange={() => toggleKey(key)}
                            class="br-checkbox" />
                          <span class="br-key-name">{key}</span>
                          <span class="br-key-val">{formatKeyVal(key)}</span>
                        </label>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

      </div>

      <footer class="br-footer">
        <button class="br-btn ghost" onclick={() => (step = 'type')}>Back</button>
        <div class="br-footer-right">
          <button class="br-btn secondary" onclick={handleCopy} title="Copy report to clipboard">
            {#if copied}
              <Check size={13} /><span>Copied!</span>
            {:else}
              <ClipboardText size={13} /><span>Copy</span>
            {/if}
          </button>
          <button class="br-btn primary" disabled={!canSubmit} onclick={handleOpen}>
            <ArrowSquareOut size={13} /><span>Open on GitHub</span>
          </button>
        </div>
      </footer>
    {/if}

  </div>
</div>

<style>
  .br-backdrop {
    position: fixed; inset: 0;
    z-index: calc(var(--z-settings) + 1);
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(4px);
    animation: br-fade 0.14s ease both;
  }

  @keyframes br-fade  { from { opacity: 0 }              to { opacity: 1 } }
  @keyframes br-scale { from { transform: scale(0.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }

  .br-shell {
    width: min(820px, calc(100vw - 32px));
    height: min(600px, calc(100vh - 64px));
    display: flex; flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-2xl);
    box-shadow: 0 0 0 1px var(--border-dim), 0 32px 80px rgba(0,0,0,0.7);
    overflow: hidden;
    animation: br-scale 0.2s cubic-bezier(0.16,1,0.3,1) both;
  }

  .br-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px var(--sp-5);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .br-header-left { display: flex; align-items: center; gap: var(--sp-2); }
  .br-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  :global(.br-header-icon.bug)     { color: var(--color-error); }
  :global(.br-header-icon.feature) { color: var(--accent-fg); }
  .br-close {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px;
    border-radius: var(--radius-md); border: none; background: none;
    color: var(--text-faint); cursor: pointer;
    transition: color var(--t-base), background var(--t-base);
  }
  .br-close:hover { color: var(--text-muted); background: var(--bg-raised); }

  .br-type-step {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: var(--sp-5); padding: var(--sp-6);
  }
  .br-type-hint {
    font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--text-faint); text-transform: uppercase;
  }
  .br-type-cards { display: flex; gap: var(--sp-4); }
  .br-type-card {
    display: flex; flex-direction: column; align-items: center;
    gap: var(--sp-2); padding: var(--sp-6) var(--sp-8);
    border-radius: var(--radius-xl);
    border: 1px solid var(--border-base);
    background: var(--bg-raised);
    cursor: pointer; color: var(--text-secondary);
    transition: border-color var(--t-base), background var(--t-base), color var(--t-base);
    min-width: 180px;
  }
  .br-type-card:hover { border-color: var(--border-strong); background: var(--bg-overlay); color: var(--text-primary); }
  .br-type-card.selected { border-color: var(--accent); background: var(--accent-muted); color: var(--accent-fg); }
  .br-type-name { font-size: var(--text-sm); font-weight: var(--weight-medium); }
  .br-type-desc {
    font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide); color: var(--text-faint);
    text-align: center;
  }

  .br-compose { flex: 1; display: flex; overflow: hidden; min-height: 0; }

  .br-form { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; border-right: 1px solid var(--border-dim); }
  .br-form-scroll { flex: 1; overflow-y: auto; padding: var(--sp-4) var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-3); }

  .br-field { display: flex; flex-direction: column; gap: 5px; }
  .br-field-row { display: flex; gap: var(--sp-3); }
  .br-field-row .br-field { flex: 1; }

  .br-label {
    font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--text-faint); display: flex; align-items: center; gap: var(--sp-1);
  }
  .br-required { color: var(--color-error); }
  .br-auto {
    font-size: var(--text-2xs); padding: 1px 6px;
    border-radius: var(--radius-full);
    background: var(--accent-muted); color: var(--accent-fg);
    border: 1px solid var(--accent-dim);
  }

  .br-input, .br-textarea {
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--text-primary);
    padding: 8px var(--sp-3); outline: none; resize: none;
    font-family: inherit; line-height: var(--leading-snug);
    transition: border-color var(--t-base);
    overflow: hidden;
  }
  .br-input:focus, .br-textarea:focus { border-color: var(--border-focus); }
  .br-input::placeholder, .br-textarea::placeholder { color: var(--text-faint); }

  .br-env-block {
    font-family: monospace; font-size: 11px;
    color: var(--text-faint); line-height: var(--leading-base);
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    border-radius: var(--radius-md); padding: var(--sp-3);
    white-space: pre-wrap; margin: 0;
  }

  .br-sidebar {
    width: 220px; flex-shrink: 0;
    display: flex; flex-direction: column;
    background: var(--bg-base);
  }
  .br-sidebar-header {
    padding: var(--sp-3) var(--sp-4) var(--sp-2);
    border-bottom: 1px solid var(--border-dim);
    display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
  }
  .br-sidebar-title {
    font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide); color: var(--text-secondary);
    font-weight: var(--weight-medium);
  }
  .br-sidebar-hint {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide); color: var(--text-faint);
  }
  .br-sidebar-scroll { flex: 1; overflow-y: auto; padding: var(--sp-1) 0 var(--sp-2); }

  .br-group { display: flex; flex-direction: column; }

  .br-group-row {
    display: flex; align-items: center;
    padding: 3px var(--sp-3) 3px var(--sp-3);
    gap: var(--sp-1);
  }
  .br-group-toggle {
    flex: 1; display: flex; align-items: center; gap: 5px;
    background: none; border: none; cursor: pointer;
    color: var(--text-faint); padding: 2px 0;
    transition: color var(--t-fast);
    min-width: 0;
  }
  .br-group-toggle:hover { color: var(--text-secondary); }
  .br-group-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider); text-transform: uppercase;
    color: inherit;
  }
  .br-group-count {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    padding: 0 5px; border-radius: var(--radius-full);
    background: var(--accent-muted); color: var(--accent-fg);
    border: 1px solid var(--accent-dim);
    line-height: 1.6;
  }
  .br-group-all {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    background: none; border: none; cursor: pointer;
    color: var(--text-faint); padding: 2px 6px;
    border-radius: var(--radius-sm);
    transition: color var(--t-fast), background var(--t-fast);
    flex-shrink: 0;
  }
  .br-group-all:hover, .br-group-all.active { color: var(--accent-fg); background: var(--accent-muted); }

  .br-key-list { display: flex; flex-direction: column; padding-bottom: var(--sp-1); }
  .br-key-row {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: 3px var(--sp-3) 3px 24px; cursor: pointer;
    transition: background var(--t-fast);
  }
  .br-key-row:hover { background: var(--bg-raised); }
  .br-checkbox { accent-color: var(--accent); flex-shrink: 0; cursor: pointer; }
  .br-key-name {
    flex: 1; font-family: monospace; font-size: 10px;
    color: var(--text-secondary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .br-key-val {
    font-family: monospace; font-size: 10px;
    color: var(--text-faint); flex-shrink: 0;
    max-width: 52px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .br-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--sp-3) var(--sp-5);
    border-top: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .br-footer-right { display: flex; gap: var(--sp-2); }

  .br-btn {
    display: flex; align-items: center; gap: var(--sp-1);
    font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    padding: 6px var(--sp-4); border-radius: var(--radius-md);
    cursor: pointer; border: 1px solid transparent;
    transition: background var(--t-base), color var(--t-base), border-color var(--t-base), opacity var(--t-base);
  }
  .br-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .br-btn.ghost { background: none; color: var(--text-faint); border-color: transparent; }
  .br-btn.ghost:hover { color: var(--text-secondary); background: var(--bg-raised); }
  .br-btn.secondary { background: none; color: var(--text-muted); border-color: var(--border-dim); }
  .br-btn.secondary:hover { border-color: var(--border-strong); color: var(--text-secondary); }
  .br-btn.primary { background: var(--accent-muted); color: var(--accent-fg); border-color: var(--accent-dim); }
  .br-btn.primary:not(:disabled):hover { filter: brightness(1.12); }
</style>