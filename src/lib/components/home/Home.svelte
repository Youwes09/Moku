<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { goto } from '$app/navigation'
  import { libraryState, loadLibrary } from '$lib/state/library.svelte'
  import { homeState, setHeroSlot } from '$lib/state/home.svelte'
  import { seriesState, resolveMediaId, seriesHref }   from '$lib/state/series.svelte'
  import { buildChapterList }       from '$lib/components/series/lib/chapterList'
  import { settingsState }          from '$lib/state/settings.svelte'
  import { DEFAULT_MANGA_PREFS } from '$lib/types/settings'
  import { historyState } from '$lib/state/history.svelte'
  import type { ReadSession } from '$lib/types/history'
  import HeroStage       from '$lib/components/home/HeroStage.svelte'
  import HeroSlotPicker  from '$lib/components/home/HeroSlotPicker.svelte'
  import ActivityFeed    from '$lib/components/home/ActivityFeed.svelte'
  import ActivityHeatmap from '$lib/components/home/ActivityHeatmap.svelte'
  import StatsGrid       from '$lib/components/home/StatsGrid.svelte'
  import { Clock } from 'phosphor-svelte'
  import type { Manga, Chapter } from '$lib/types'

  const TOTAL_SLOTS = 4

  interface HeroSlot {
    kind: 'continue' | 'pinned' | 'empty'
    entry?: ReadSession
    manga?: Manga
    slotIndex: number
  }

  onMount(() => { loadLibrary() })

  const manga = $derived(libraryState.items)

  const continueReading = $derived((() => {
    const seen = new Set<string>()
    const out: ReadSession[] = []
    for (const e of historyState.sessions) {
      if (seen.has(e.mangaId)) continue
      seen.add(e.mangaId)
      out.push(e)
      if (out.length >= 10) break
    }
    return out
  })())

  const resolvedSlots = $derived((() => {
    const pins  = homeState.heroSlots
    const slots: HeroSlot[] = []
    const first = continueReading[0]
    slots.push(first ? { kind: 'continue', entry: first, slotIndex: 0 } : { kind: 'empty', slotIndex: 0 })
    let hi = 1
    for (let i = 1; i < TOTAL_SLOTS; i++) {
      const pinId = pins[i]
      if (pinId != null) {
        const m = manga.find(m => m.id === pinId)
        if (m) { slots.push({ kind: 'pinned', manga: m, slotIndex: i }); continue }
      }
      const entry = continueReading[hi++]
      slots.push(entry ? { kind: 'continue', entry, slotIndex: i } : { kind: 'empty', slotIndex: i })
    }
    return slots
  })())

  let activeIdx = $state(0)

  const activeSlot   = $derived(resolvedSlots[activeIdx])
  const heroManga    = $derived(
    activeSlot?.kind === 'pinned'   ? activeSlot.manga :
    activeSlot?.kind === 'continue' ? manga.find(m => m.id === activeSlot.entry?.mangaId) : null
  )
  const heroEntry    = $derived(activeSlot?.kind === 'continue' ? activeSlot.entry ?? null : null)
  const heroMangaId  = $derived(heroManga?.id ?? heroEntry?.mangaId ?? null)
  const heroTitle    = $derived(heroManga?.title ?? heroEntry?.mangaTitle ?? '')
  const heroThumbSrc = $derived(
    heroManga?.thumbnailUrl ??
    (activeSlot?.kind === 'continue' ? activeSlot.entry?.thumbnailUrl : undefined) ??
    ''
  )

  let heroThumb = $state('')
  $effect(() => {
    const path = heroThumbSrc
    if (!path) { heroThumb = ''; return }
    heroThumb = path
  })

  const heroUnread = $derived(heroManga?.unreadCount ?? 0)

  let heroChapters:    Chapter[] = $state([])
  let heroAllChapters: Chapter[] = $state([])
  let loadingHeroChapters = $state(false)
  let heroChaptersFor: string | null = null

  $effect(() => {
    const id = heroMangaId
    if (id) untrack(() => { void loadHeroChapters(id) })
  })

  async function loadHeroChapters(rawId: string) {
    heroChaptersFor     = rawId
    loadingHeroChapters = true
    heroChapters        = []
    heroAllChapters     = []
    try {
      const mangaId = await resolveMediaId(rawId)
      if (heroChaptersFor !== rawId) return
      await seriesState.loadChapters(mangaId, { mediaId: mangaId })
      if (heroChaptersFor !== rawId) return
      const chapters = seriesState.chaptersFor(mangaId)
      const prefs = settingsState.settings.mangaPrefs?.[mangaId] ?? {}
      const all = buildChapterList(chapters, {
        sortMode:           'source',
        sortDir:            'asc',
        preferredScanlator: prefs.preferredScanlator  ?? DEFAULT_MANGA_PREFS.preferredScanlator,
        scanlatorFilter:    prefs.scanlatorFilter     ?? DEFAULT_MANGA_PREFS.scanlatorFilter,
        scanlatorBlacklist: prefs.scanlatorBlacklist  ?? DEFAULT_MANGA_PREFS.scanlatorBlacklist,
        scanlatorForce:     prefs.scanlatorForce      ?? DEFAULT_MANGA_PREFS.scanlatorForce,
      })
      heroAllChapters = all
      const lastReadIdx = heroEntry
        ? all.findLastIndex(c => c.id === heroEntry!.endChapterId)
        : all.findLastIndex(c => c.read)
      const startIdx = Math.max(0, lastReadIdx)
      heroChapters = all.slice(startIdx, startIdx + 5)
    } catch {
      heroChapters    = []
      heroAllChapters = []
    } finally {
      loadingHeroChapters = false
    }
  }

  let resuming = $state(false)

  async function openChapter(chapter: Chapter) {
    if (!heroMangaId) return
    goto(`/media/${encodeURIComponent(heroMangaId)}/${encodeURIComponent(chapter.id)}`)
  }

  async function resumeActive() {
    if (heroEntry) {
      goto(`/media/${encodeURIComponent(heroEntry.mangaId)}/${encodeURIComponent(heroEntry.endChapterId)}`)
      return
    }
    viewSeries()
  }

  function viewSeries() {
    if (heroManga) { goto(seriesHref(heroManga)); return }
    if (heroMangaId) goto(seriesHref({ mediaId: heroMangaId }))
  }

  function cycleNext() { activeIdx = (activeIdx + 1) % TOTAL_SLOTS; heroChapters = []; heroAllChapters = [] }
  function cyclePrev() { activeIdx = (activeIdx - 1 + TOTAL_SLOTS) % TOTAL_SLOTS; heroChapters = []; heroAllChapters = [] }
  function goToSlot(i: number) { if (i !== activeIdx) { activeIdx = i; heroChapters = []; heroAllChapters = [] } }

  let pickerOpen      = $state(false)
  let pickerSlotIndex: 1 | 2 | 3 | null = $state(null)

  function openPicker(i: 1 | 2 | 3) { pickerSlotIndex = i; pickerOpen = true }
  function closePicker() { pickerOpen = false; pickerSlotIndex = null }
  function pinManga(m: Manga) { if (pickerSlotIndex !== null) { setHeroSlot(pickerSlotIndex, m.id); closePicker() } }
  function unpinSlot(i: 1 | 2 | 3) { setHeroSlot(i, null) }

  function resumeEntry(entry: ReadSession) {
    goto(`/media/${encodeURIComponent(entry.mangaId)}/${encodeURIComponent(entry.endChapterId)}`)
  }
</script>

<div class="root">
  <div class="hero-shrink-guard">
    <HeroStage
      {resolvedSlots}
      bind:activeIdx
      {heroThumb}
      {heroTitle}
      {heroManga}
      {heroEntry}
      {heroMangaId}
      {heroChapters}
      {heroUnread}
      {loadingHeroChapters}
      {resuming}
      onresume={resumeActive}
      onviewseries={viewSeries}
      onopenchapter={openChapter}
      oncyclenext={cycleNext}
      oncycleprev={cyclePrev}
      ongotoslot={goToSlot}
      onopenpicker={openPicker}
      onunpin={unpinSlot}
      onviewall={viewSeries}
    />
  </div>

  <div class="scroll-body">
    <div class="home-grid">
      <div class="left-col">
        <ActivityFeed
          onresume={resumeEntry}
          onviewhistory={() => goto('/recent')}
          onopenlibrary={() => goto('/library')}
        />
        <div class="col-divider"></div>
        <div class="activity-panel">
          <span class="panel-label"><Clock size={10} weight="bold" /> Activity</span>
          <ActivityHeatmap dailyReadCounts={historyState.dailyReadCounts} />
        </div>
      </div>

      <div class="col-divider col-divider-v"></div>

      <div class="right-col">
        <StatsGrid stats={historyState.stats} sessions={historyState.sessions} library={libraryState.items} />
      </div>
    </div>
  </div>
</div>

{#if pickerOpen && pickerSlotIndex !== null}
  <HeroSlotPicker
    slotIndex={pickerSlotIndex}
    libraryManga={manga}
    loading={libraryState.loading}
    onpin={pinManga}
    onclose={closePicker}
  />
{/if}

<style>
  .root {
    display: flex; flex-direction: column;
    height: 100%; overflow: hidden;
    animation: fadeIn 0.4s ease both;
  }
  .hero-shrink-guard { flex-shrink: 0; }
  .scroll-body {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    min-height: 0; scrollbar-width: none;
  }
  .scroll-body::-webkit-scrollbar { display: none; }

  .home-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) 1px minmax(0, 1fr);
    align-items: stretch;
    border-top: 1px solid var(--border-dim); flex: 1; min-height: 0;
  }
  .left-col { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .left-col :global(.section) { border-top: none; }
  .right-col {
    padding: var(--sp-4) var(--sp-5) var(--sp-5);
    min-width: 0; min-height: 0; overflow-y: auto; scrollbar-width: none;
  }
  .right-col::-webkit-scrollbar { display: none; }

  .col-divider { background: var(--border-dim); flex-shrink: 0; }
  .col-divider:not(.col-divider-v) { height: 1px; margin: 0 var(--sp-4); }
  .col-divider-v { background: var(--border-base); }

  .activity-panel {
    display: flex; flex-direction: column; gap: var(--sp-2);
    padding: var(--sp-4) var(--sp-4) var(--sp-5);
    flex: 1; min-height: 220px;
  }
  .panel-label {
    display: inline-flex; align-items: center; gap: var(--sp-2);
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase;
  }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
</style>
