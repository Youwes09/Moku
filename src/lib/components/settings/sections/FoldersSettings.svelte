<script lang="ts">
  import { FolderSimple, Plus, Trash, Star, Eye, EyeSlash, ArrowsClockwise, ArrowsCounterClockwise, DownloadSimple, DotsSixVertical, CheckSquare, Lock } from 'phosphor-svelte'
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { libraryState } from '$lib/state/library.svelte'
  import type { Folder } from '$lib/server-adapters/types'

  let folders       = $state<Folder[]>([])
  let foldersLoading = $state(false)
  let foldersError   = $state<string | null>(null)
  let newFolderName  = $state('')
  let editingId      = $state<string | null>(null)
  let editingName    = $state('')

  let dragId       = $state<string | null>(null)
  let dragOverId   = $state<string | null>(null)
  let dropPosition = $state<'above' | 'below' | null>(null)

  const completedFolder = $derived(folders.find(f => f.systemKey === 'completed') ?? null)
  const customFolders   = $derived(folders.filter(f => f.kind === 'custom'))
  const sortedFolderIds = $derived(folders.filter(f => f.kind !== 'reading_status' || f.systemKey === 'completed').map(f => f.id))

  const orderedAllIds = $derived.by(() => {
    const order  = settingsState.settings.libraryPinnedTabOrder ?? []
    const allIds = ['library', 'downloaded', ...sortedFolderIds]
    const known  = new Set(allIds)
    return [...new Set([...order.filter(id => known.has(id)), ...allIds])]
  })

  function isHidden(id: string) {
    return (settingsState.settings.hiddenLibraryTabs ?? []).includes(id)
  }

  function toggleHidden(id: string) {
    const current = settingsState.settings.hiddenLibraryTabs ?? []
    updateSettings({ hiddenLibraryTabs: current.includes(id) ? current.filter(x => x !== id) : [...current, id] })
  }

  async function loadFolders() {
    foldersLoading = true; foldersError = null
    try {
      folders = await tsunagu.folders()
    } catch (e: any) {
      foldersError = e?.message ?? 'Failed to load folders'
    } finally { foldersLoading = false }
  }

  async function createFolder() {
    const name = newFolderName.trim()
    if (!name) return
    try {
      const f = await tsunagu.createFolder(name)
      folders = [...folders, f]
      newFolderName = ''
    } catch (e: any) { foldersError = e?.message ?? 'Failed to create folder' }
  }

  function startEdit(f: Folder) {
    if (f.kind !== 'custom') return
    editingId = f.id; editingName = f.name
  }

  async function commitEdit() {
    if (editingId !== null && editingName.trim()) {
      try {
        const updated = await tsunagu.renameFolder(editingId, editingName.trim())
        folders = folders.map(f => f.id === editingId ? updated : f)
      } catch (e: any) { foldersError = e?.message ?? 'Failed to rename' }
    }
    editingId = null; editingName = ''
  }

  async function deleteFolder(f: Folder) {
    if (f.kind !== 'custom') return
    try {
      await tsunagu.deleteFolder(f.id)
      folders = folders.filter(x => x.id !== f.id)
    } catch (e: any) { foldersError = e?.message ?? 'Failed to delete folder' }
  }

  async function toggleFolderFlag(f: Folder, flag: 'includeInUpdate' | 'includeInDownload') {
    const next = !f[flag]
    folders = folders.map(x => x.id === f.id ? { ...x, [flag]: next } : x)
    try {
      await tsunagu.updateFolderFlags(f.id, { [flag]: next })
    } catch (e: any) {
      folders = folders.map(x => x.id === f.id ? { ...x, [flag]: !next } : x)
      foldersError = e?.message ?? 'Failed to update folder'
    }
  }

  function applyReorder(fromId: string, toId: string) {
    const allIds  = ['library', 'downloaded', ...sortedFolderIds]
    const current = settingsState.settings.libraryPinnedTabOrder ?? []
    const base    = [...new Set([...current.filter(id => allIds.includes(id)), ...allIds])]
    const fromIdx = base.indexOf(fromId)
    const toIdx   = base.indexOf(toId)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
    base.splice(fromIdx, 1)
    base.splice(toIdx, 0, fromId)
    updateSettings({ libraryPinnedTabOrder: base })

    if (fromId !== 'library' && fromId !== 'downloaded') {
      const sortable = folders.filter(f => sortedFolderIds.includes(f.id)).sort((a, b) => a.sortOrder - b.sortOrder)
      const sFromIdx = sortable.findIndex(f => f.id === fromId)
      const sToIdx   = sortable.findIndex(f => f.id === toId)
      if (sFromIdx >= 0 && sToIdx >= 0 && sFromIdx !== sToIdx) {
        const reordered = [...sortable]
        const [moved]   = reordered.splice(sFromIdx, 1)
        reordered.splice(sToIdx, 0, moved)
        const optimistic = reordered.map((f, i) => ({ ...f, sortOrder: i + 1 }))
        folders = folders.map(f => optimistic.find(o => o.id === f.id) ?? f)
        const serverPosition = sToIdx + 1
        tsunagu.reorderFolder(fromId, serverPosition)
          .catch(async (e: any) => {
            foldersError = e?.message ?? 'Failed to reorder'
            await loadFolders()
          })
      }
    }
  }

  function onDragStart(e: DragEvent, id: string) {
    dragId = id
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) }
  }

  function onDragOver(e: DragEvent, id: string) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (dragId === id) return
    dragOverId = id
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dropPosition = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
  }

  function onDrop(e: DragEvent, id: string) {
    e.preventDefault()
    if (dragId !== null && dragId !== id) applyReorder(dragId, id)
    dragId = null; dragOverId = null; dropPosition = null
  }

  function onDragEnd() { dragId = null; dragOverId = null; dropPosition = null }

  function focusInput(node: HTMLElement) { node.focus() }

  $effect(() => {
    if (!folders.length && !foldersLoading) loadFolders()
  })
</script>

<div class="s-panel">
  <div class="s-section">
    <p class="s-section-title">Manage Folders</p>
    <div class="s-section-body">
      <div class="s-row">
        <span class="s-desc">Folders sync across all clients connected to this server.</span>
      </div>

      {#if foldersError}
        <div class="s-banner s-banner-error">{foldersError}</div>
      {/if}

      {#if foldersLoading}
        <p class="s-empty">Loading folders…</p>
      {:else}
        <div class="s-folder-list" class:is-dragging={dragId !== null}>
          {#each orderedAllIds as id}
            {@const isBuiltin   = id === 'library' || id === 'downloaded'}
            {@const f           = isBuiltin ? null : (folders.find(x => x.id === id) ?? null)}
            {@const isCompleted = f?.systemKey === 'completed'}
            {@const hidden      = isHidden(id)}

            {#if isBuiltin || f}
              <div
                class="s-folder-row"
                role="listitem"
                class:dragging={dragId === id}
                class:drop-above={dragOverId === id && dragId !== id && dropPosition === 'above'}
                class:drop-below={dragOverId === id && dragId !== id && dropPosition === 'below'}
                draggable="true"
                ondragstart={(e) => onDragStart(e, id)}
                ondragover={(e) => onDragOver(e, id)}
                ondragleave={() => { if (dragOverId === id) { dragOverId = null; dropPosition = null } }}
                ondrop={(e) => onDrop(e, id)}
                ondragend={onDragEnd}
              >
                {#if isCompleted && f}
                  <span class="s-folder-icon">
                    <CheckSquare size={14} weight="light" />
                    <DotsSixVertical size={14} weight="bold" />
                  </span>
                  <span class="s-folder-name">{f.name}</span>
                  <span class="s-folder-count">{libraryState.counts[f.id] ?? 0} manga</span>
                  <span class="s-folder-badge">built-in</span>
                  <div class="s-folder-actions">
                    <button class="s-btn-icon" class:muted={hidden} onclick={() => toggleHidden(id)} title={hidden ? 'Show tab in library' : 'Hide tab from library'}>
                      {#if hidden}<EyeSlash size={13} weight="light" />{:else}<Eye size={13} weight="light" />{/if}
                    </button>
                    <button class="s-btn-icon s-btn-icon-lock" disabled title="Built-in folder, cannot be deleted"><Lock size={12} weight="light" /></button>
                  </div>

                {:else if isBuiltin}
                  <span class="s-folder-icon">
                    {#if id === 'library'}<Star size={14} weight="light" />{:else}<DownloadSimple size={14} weight="light" />{/if}
                    <DotsSixVertical size={14} weight="bold" />
                  </span>
                  <span class="s-folder-name">{id === 'library' ? 'Saved' : 'Downloaded'}</span>
                  <span class="s-folder-badge">built-in</span>
                  <div class="s-folder-actions">
                    <button class="s-btn-icon" class:muted={hidden} onclick={() => toggleHidden(id)} title={hidden ? 'Show tab in library' : 'Hide tab from library'}>
                      {#if hidden}<EyeSlash size={13} weight="light" />{:else}<Eye size={13} weight="light" />{/if}
                    </button>
                    <button class="s-btn-icon s-btn-icon-lock" disabled title="Built-in folder, cannot be deleted"><Lock size={12} weight="light" /></button>
                  </div>

                {:else if f}
                  {#if editingId === f.id}
                    <input class="s-input full" bind:value={editingName}
                      onkeydown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { editingId = null } }}
                      onblur={commitEdit} use:focusInput />
                    <button class="s-btn-icon" onclick={commitEdit} title="Save">✓</button>
                  {:else}
                    <div class="s-folder-identity" role="button" tabindex="0" draggable="true"
                      ondragstart={(e) => onDragStart(e, id)}
                      ondragend={onDragEnd}
                      onkeydown={(e) => e.key === 'Enter' && startEdit(f)}>
                      <span class="s-folder-icon">
                        <FolderSimple size={14} weight="light" />
                        <DotsSixVertical size={14} weight="bold" />
                      </span>
                      <button class="s-folder-name" onclick={(e) => { e.stopPropagation(); startEdit(f) }} title="Click to rename">{f.name}</button>
                    </div>
                    <span class="s-folder-count">{libraryState.counts[f.id] ?? 0} manga</span>
                    <div class="s-folder-actions">
                      <button class="s-btn-icon"
                        class:active={f.includeInUpdate !== false}
                        class:inactive={f.includeInUpdate === false}
                        onclick={() => toggleFolderFlag(f, 'includeInUpdate')}
                        title={f.includeInUpdate !== false ? 'Included in updates, click to exclude' : 'Excluded from updates, click to include'}>
                        {#if f.includeInUpdate !== false}<ArrowsClockwise size={13} weight="bold" />{:else}<ArrowsCounterClockwise size={13} weight="light" />{/if}
                      </button>
                      <button class="s-btn-icon"
                        class:active={f.includeInDownload !== false}
                        class:inactive={f.includeInDownload === false}
                        onclick={() => toggleFolderFlag(f, 'includeInDownload')}
                        title={f.includeInDownload !== false ? 'Included in auto-downloads, click to exclude' : 'Excluded from auto-downloads, click to include'}>
                        <DownloadSimple size={13} weight={f.includeInDownload !== false ? 'bold' : 'light'} />
                      </button>
                      <button class="s-btn-icon danger" onclick={() => deleteFolder(f)} title="Delete folder">
                        <Trash size={12} weight="light" />
                      </button>
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          {/each}
        </div>

        {#if customFolders.length === 0}
          <p class="s-empty">No custom folders yet. Create one below.</p>
        {/if}
      {/if}

      <div class="s-folder-create">
        <input class="s-input full" placeholder="New folder name…" bind:value={newFolderName}
          onkeydown={(e) => e.key === 'Enter' && createFolder()} />
        <button class="s-btn s-btn-accent" onclick={createFolder} disabled={!newFolderName.trim()}>
          <Plus size={13} weight="bold" /> Create
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .s-folder-list { display: contents; }

  .s-folder-list.is-dragging,
  .s-folder-list.is-dragging * { user-select: none; -webkit-user-select: none; }

  .s-folder-row { transition: opacity 0.15s, background 0.1s; position: relative; }
  .s-folder-row.dragging { opacity: 0.35; }

  .s-folder-row.drop-above::before,
  .s-folder-row.drop-below::after {
    content: '';
    position: absolute;
    left: 8px; right: 8px;
    height: 2px;
    background: var(--color-success, #4ade80);
    border-radius: 2px;
    pointer-events: none;
    z-index: 10;
  }
  .s-folder-row.drop-above::before { top: -1px; }
  .s-folder-row.drop-below::after  { bottom: -1px; }

  .s-folder-identity {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-primary);
    flex-shrink: 0;
    overflow: hidden;
    cursor: grab;
  }

  .s-folder-icon {
    display: grid;
    flex-shrink: 0;
    overflow: visible;
    padding: 1px;
  }
  .s-folder-icon > :global(*) { grid-area: 1 / 1; transition: opacity 0.12s; }
  .s-folder-icon > :global(*:last-child) { opacity: 0; }
  .s-folder-row:hover .s-folder-icon > :global(*:first-child) { opacity: 0; }
  .s-folder-row:hover .s-folder-icon > :global(*:last-child) { opacity: 1; }

  .s-folder-name {
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-primary);
  }
  .s-folder-name:hover { text-decoration: underline; text-underline-offset: 3px; }

  .s-folder-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; flex-shrink: 0; }

  .s-folder-badge {
    font-size: 10px;
    letter-spacing: 0.04em;
    color: var(--text-faint);
    background: var(--bg-subtle);
    border: 1px solid var(--border-dim);
    border-radius: 3px;
    padding: 1px 5px;
    flex-shrink: 0;
    margin-left: 6px;
  }

  .s-btn-icon.active   { color: var(--accent, #6c8ef5); }
  .s-btn-icon.inactive { color: var(--color-error, #f87171); opacity: 0.75; }
  .s-btn-icon.inactive:hover { opacity: 1; }
  .s-btn-icon.muted    { color: var(--text-faint); opacity: 0.5; }
  .s-btn-icon-lock     { opacity: 0.25; cursor: not-allowed; }
  .s-btn-icon-lock:hover { opacity: 0.25; color: inherit; }
</style>
