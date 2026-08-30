<script lang="ts">
  import { onMount } from 'svelte'
  import { CircleNotch } from 'phosphor-svelte'
  import { trackingState } from '$lib/state/tracking.svelte'
  import { statusesFor } from '$lib/state/trackers.svelte'
  import {
    flattenRecords, filterRecords, sortRecords, dedupeStatuses,
    type FlatRecord, type SortKey,
  } from '$lib/components/tracking/lib/trackingSync'
  import TrackingToolbar from './TrackingToolbar.svelte'
  import TrackingCard    from './TrackingCard.svelte'
  import TrackingPreview from './TrackingPreview.svelte'

  let activeTrackerKey = $state<string | 'all'>('all')
  let statusFilter     = $state<number | 'all'>('all')
  let searchQuery      = $state('')
  let sortBy           = $state<SortKey>('title')
  let selectedRecord   = $state<FlatRecord | null>(null)

  onMount(() => { trackingState.loadAll(true) })

  const loggedIn   = $derived(trackingState.allTrackers.filter((t) => t.isLoggedIn))
  const allRecords = $derived(flattenRecords(trackingState.media, trackingState.allTrackers))
  const totalCount = $derived(allRecords.length)

  const countFor = (key: string | 'all') =>
    key === 'all' ? allRecords.length : allRecords.filter((r) => r.tracker.key === key).length

  const statusOptions = $derived(
    activeTrackerKey === 'all'
      ? dedupeStatuses(trackingState.allTrackers)
      : (() => {
          const t = loggedIn.find((x) => x.key === activeTrackerKey)
          return t ? statusesFor(t).map((s) => ({ value: s.value, name: s.label })) : []
        })(),
  )

  const filtered = $derived(
    sortRecords(filterRecords(allRecords, activeTrackerKey, statusFilter, searchQuery), sortBy),
  )
</script>

<div class="page">
  <TrackingToolbar
    {loggedIn}
    {totalCount}
    {activeTrackerKey}
    {statusFilter}
    {statusOptions}
    {searchQuery}
    {sortBy}
    {countFor}
    loading={trackingState.loadingAll}
    onRefresh={() => trackingState.loadAll(true)}
    onTrackerChange={(key) => { activeTrackerKey = key; statusFilter = 'all' }}
    onStatusChange={(v) => statusFilter = v}
    onSearchChange={(v) => searchQuery = v}
    onSortChange={(v) => sortBy = v}
  />

  <div class="body">
    {#if trackingState.loadingAll && trackingState.media.length === 0}
      <div class="state">
        <CircleNotch size={18} weight="light" class="anim-spin" style="color:var(--text-faint)" />
      </div>

    {:else if trackingState.error}
      <div class="state">
        <span class="state-error">{trackingState.error}</span>
        <button class="ghost-btn" onclick={() => trackingState.loadAll(true)}>Retry</button>
      </div>

    {:else if loggedIn.length === 0}
      <div class="state">
        <span class="state-text">No trackers connected.</span>
        <span class="state-hint">Settings → Tracking to connect AniList.</span>
      </div>

    {:else if filtered.length === 0}
      <div class="state">
        <span class="state-text">{searchQuery || statusFilter !== 'all' ? 'No results.' : 'Nothing tracked yet.'}</span>
        {#if searchQuery || statusFilter !== 'all'}
          <button class="ghost-btn" onclick={() => { searchQuery = ''; statusFilter = 'all' }}>Clear filters</button>
        {/if}
      </div>

    {:else}
      <div class="grid">
        {#each filtered as record (record.tracker.key + ':' + record.id)}
          <TrackingCard
            {record}
            active={selectedRecord?.id === record.id && selectedRecord?.tracker.key === record.tracker.key}
            onSelect={(r) => selectedRecord = r}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if selectedRecord}
  {#key selectedRecord.id}
    <TrackingPreview record={selectedRecord} onClose={() => selectedRecord = null} />
  {/key}
{/if}

<style>
  .page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .body {
    flex: 1; overflow-y: auto; padding: var(--sp-5);
    scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;
  }

  .state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: var(--sp-3); height: 100%; text-align: center;
  }
  .state-text  { font-size: var(--text-sm); color: var(--text-muted); }
  .state-hint  { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); max-width: 260px; line-height: 1.5; }
  .state-error { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-error); letter-spacing: var(--tracking-wide); }

  .ghost-btn {
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    padding: 5px 14px; border-radius: var(--radius-md);
    border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base);
  }
  .ghost-btn:hover { color: var(--accent-fg); border-color: var(--accent-dim); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
    gap: var(--sp-4); align-content: start;
  }
</style>
