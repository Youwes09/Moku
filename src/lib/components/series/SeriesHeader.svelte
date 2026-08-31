<script lang="ts">
  import {
    ArrowLeft, BookmarkSimple, ArrowSquareOut, Play, CaretDown,
    ArrowsClockwise, LinkSimpleHorizontalBreak,
    Gear, Trash, Image, Broadcast, Database,
  } from 'phosphor-svelte'
  import { goto }          from '$app/navigation'
  import { page }          from '$app/stores'
  import { get }           from 'svelte/store'
  import Thumbnail         from '$lib/components/shared/manga/Thumbnail.svelte'
  import ExtensionIcon     from '$lib/components/extensions/ExtensionIcon.svelte'
  import { resolvedCover } from '$lib/core/cover/coverResolver'
  import type { Manga, Chapter } from '$lib/types'
  import type { Folder } from '$lib/server-adapters/types'

  import { seriesState }                                        from '$lib/state/series.svelte'
  import { setPreviewManga }                                    from '$lib/state/series.svelte'

  interface ContinueChapter {
    chapter:    Chapter
    type:       'start' | 'continue' | 'reread'
    resumePage: number | null
  }

  interface Props {
    manga:            Manga | null
    loadingManga:     boolean
    totalCount:       number
    readCount:        number
    progressPct:      number
    downloadedCount:  number
    deletingAll:      boolean
    continueChapter:  ContinueChapter | null
    hasAnyAutomation: boolean
    linkedIds:        string[]
    allMangaForLink:  Manga[]
    loadingLinkList:  boolean
    mangaFolders:     Folder[]
    togglingLibrary:  boolean
    trackLinkCount?:  number
    onRead:           (ch: ContinueChapter) => void
    onToggleLibrary:  () => void
    onDeleteAll:      () => void
    onMigrateOpen:    () => void
    onAutoOpen:       () => void
    onTrackerOpen:    () => void
    onMetadataOpen:   () => void
    onLinkPickerOpen: () => void
    onCoverPickerOpen:() => void
    onGenreClick:     (genre: string) => void
    isLocal?:         boolean
  }

  let {
    manga, loadingManga, totalCount, readCount, progressPct,
    downloadedCount, deletingAll, continueChapter, hasAnyAutomation,
    linkedIds, allMangaForLink, loadingLinkList,
    mangaFolders, togglingLibrary, trackLinkCount = 0,
    onRead, onToggleLibrary, onDeleteAll, onMigrateOpen,
    onAutoOpen, onTrackerOpen, onMetadataOpen, onLinkPickerOpen, onCoverPickerOpen,
    onGenreClick, isLocal = false,
  }: Props = $props()

  let manageOpen:     boolean = $state(false)
  let genresExpanded: boolean = $state(false)
  let descExpanded:   boolean = $state(false)
  let altOpen:        boolean = $state(false)

  const statusLabel = $derived(
    manga?.status ? manga.status.charAt(0) + manga.status.slice(1).toLowerCase() : null
  )

  const sourceLabel = $derived(
    manga?.sourceName || manga?.source?.displayName || manga?.source?.name || null
  )

  const hasCoverOverride = $derived(
    !!seriesState.settings.mangaPrefs?.[seriesState.activeManga?.id ?? ""]?.coverUrl
  )

  const altTitles = $derived(
    (manga as any)?.alternativeTitles ?? (manga as any)?.altTitles ?? []
  )

  function goBack() {
    const currentUrl = get(page).url.pathname
    history.back()
    setTimeout(() => {
      if (get(page).url.pathname === currentUrl) goto('/library')
    }, 100)
  }
</script>

<div class="sidebar">
  <button class="back" onclick={goBack}>
    <ArrowLeft size={13} weight="light" /> Back
  </button>

  <div class="cover-wrap">
    <button class="cover-btn" onclick={() => manga && setPreviewManga(manga)} title="Quick preview" disabled={!manga}>
      <Thumbnail src={resolvedCover(manga?.id ?? seriesState.activeManga?.id ?? "", manga?.thumbnailUrl ?? seriesState.activeManga?.thumbnailUrl ?? "")} alt={manga?.title ?? seriesState.activeManga?.title ?? ""} class="cover" id={manga?.id ?? seriesState.activeManga?.id} />
    </button>
  </div>

  {#if loadingManga}
    <div class="meta-skeleton">
      <div class="skeleton sk-line" style="width:90%;height:14px"></div>
      <div class="skeleton sk-line" style="width:60%;height:11px"></div>
    </div>
  {:else}
    <div class="meta">
      <button class="title" onclick={() => manga && setPreviewManga(manga)} disabled={!manga}>{manga?.title}</button>

      {#if manga?.author || manga?.artist}
        <p class="byline">{[manga?.author, manga?.artist].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</p>
      {/if}

      <div class="badges">
        {#if statusLabel}
          <span class="badge" class:badge-ongoing={manga?.status === 'ONGOING'} class:badge-ended={manga?.status !== 'ONGOING'}>{statusLabel}</span>
        {/if}
        {#if sourceLabel}
          <span class="badge badge-source">
            {#if manga?.source?.iconUrl}<ExtensionIcon src={manga.source.iconUrl} alt="" size={12} class="badge-source-icon" />{/if}
            {sourceLabel}
          </span>
        {/if}
      </div>

      {#if altTitles.length > 0}
        <div class="alttitles-section">
          <button class="row-toggle" onclick={() => altOpen = !altOpen}>
            <span>Also known as</span>
            <CaretDown size={10} weight="light" style="transform:{altOpen ? 'rotate(180deg)' : 'rotate(0)'};transition:transform 0.15s ease;flex-shrink:0" />
          </button>
          {#if altOpen}
            <div class="alttitles-list">
              {#each altTitles as t}<p class="alttitle">{t}</p>{/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if manga?.genre?.length}
        <div class="genres">
          {#each (genresExpanded ? manga.genre : manga.genre.slice(0, 3)) as g}
            <button class="genre" onclick={() => onGenreClick(g)}>{g}</button>
          {/each}
          {#if manga.genre.length > 3}
            <button class="genre-toggle" onclick={() => genresExpanded = !genresExpanded}>
              {genresExpanded ? 'less' : `+${manga.genre.length - 3}`}
            </button>
          {/if}
        </div>
      {/if}

      {#if manga?.description}
        <div class="desc-wrap">
          <p class="desc" class:desc-open={descExpanded}>{manga.description}</p>
          <button class="expand-toggle" onclick={() => descExpanded = !descExpanded}>{descExpanded ? 'Show less' : 'Read more'}</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="cta-section">
    {#if continueChapter}
      {@const isAnime = manga?.contentType === 'ANIME'}
      {@const unit    = isAnime ? 'Ep.' : 'Ch.'}
      {@const ref     = continueChapter.chapter.chapterNumber >= 0
        ? `${unit}${continueChapter.chapter.chapterNumber}`
        : (continueChapter.chapter.name || 'chapter')}
      <button class="read-btn" onclick={() => onRead(continueChapter!)}>
        <Play size={12} weight="fill" />
        {continueChapter.type === 'reread' ? (isAnime ? 'Watch again' : 'Read again')
          : continueChapter.type === 'start' ? (isAnime ? 'Start watching' : 'Start reading')
          : `Continue · ${ref}`}
      </button>
    {/if}
    <div class="actions">
      <button class="library-btn" class:active={manga?.inLibrary} onclick={onToggleLibrary} disabled={togglingLibrary || loadingManga}>
        <BookmarkSimple size={13} weight={manga?.inLibrary ? 'fill' : 'light'} />
        {manga?.inLibrary ? 'In Library' : 'Add to Library'}
      </button>
      {#if manga?.realUrl}
        <a href={manga.realUrl} target="_blank" rel="noreferrer" class="external-link">
          <ArrowSquareOut size={13} weight="light" />
        </a>
      {/if}
    </div>
  </div>

  {#if totalCount > 0}
    <div class="progress-section">
      <div class="progress-header">
        <span class="progress-label">{readCount} / {totalCount} read</span>
        <span class="progress-pct">{Math.round(progressPct)}%</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:{progressPct}%"></div></div>
    </div>
  {/if}

  {#if !loadingManga && manga}
    <div class="details-section">
      <button class="details-toggle" onclick={() => manageOpen = !manageOpen}>
        <span>Manage</span>
        <CaretDown size={11} weight="light" style="transform:{manageOpen ? 'rotate(180deg)' : 'rotate(0)'};transition:transform 0.15s ease" />
      </button>
      {#if manageOpen}
        <div class="details-body">
          <div class="detail-actions">
            {#if !isLocal}
              <button class="detail-action-btn" onclick={onMigrateOpen}>
                <ArrowsClockwise size={12} weight="light" /> Switch Source
              </button>
            {/if}
            <button class="detail-action-btn" class:detail-action-active={linkedIds.length > 0} onclick={onLinkPickerOpen}>
              <LinkSimpleHorizontalBreak size={12} weight={linkedIds.length > 0 ? 'fill' : 'light'} />
              Series Link{linkedIds.length > 0 ? ` (${linkedIds.length})` : ''}
            </button>
            <button class="detail-action-btn" class:detail-action-active={hasCoverOverride} onclick={onCoverPickerOpen}>
              <Image size={12} weight={hasCoverOverride ? 'fill' : 'light'} /> Cover Image
            </button>
            {#if !isLocal}
              <button class="detail-action-btn" class:detail-action-active={!!manga?.metadata} onclick={onMetadataOpen}>
                <Database size={12} weight={manga?.metadata ? 'fill' : 'light'} /> Metadata
              </button>
            {/if}
            {#if manga?.inLibrary && !isLocal}
              <button class="detail-action-btn" class:detail-action-active={hasAnyAutomation} onclick={onAutoOpen}>
                <Gear size={12} weight={hasAnyAutomation ? 'fill' : 'light'} /> Automation
              </button>
              <button class="detail-action-btn" class:detail-action-active={trackLinkCount > 0} onclick={onTrackerOpen}>
                <Broadcast size={12} weight={trackLinkCount > 0 ? 'fill' : 'light'} />
                Tracking{trackLinkCount > 0 ? ` (${trackLinkCount})` : ''}
              </button>
            {/if}
            {#if downloadedCount > 0 && !isLocal}
              <button class="detail-action-btn detail-action-danger" onclick={onDeleteAll} disabled={deletingAll}>
                <Trash size={12} weight="light" /> {deletingAll ? 'Deleting…' : `Delete Downloads (${downloadedCount})`}
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sidebar {
    width: 240px; flex-shrink: 0;
    padding: var(--sp-5); border-right: 1px solid var(--border-dim);
    overflow-y: auto; scrollbar-width: none;
    display: flex; flex-direction: column; gap: var(--sp-4);
    background: var(--bg-base);
  }
  .sidebar::-webkit-scrollbar { display: none; }

  .back {
    display: flex; align-items: center; gap: var(--sp-2);
    color: var(--text-muted); font-size: var(--text-xs); font-family: var(--font-ui);
    letter-spacing: var(--tracking-wide); text-transform: uppercase;
    transition: color var(--t-base);
  }
  .back:hover { color: var(--text-secondary); }

  .cover-wrap {
    width: 100%; aspect-ratio: 2/3; border-radius: var(--radius-md);
    overflow: hidden; background: var(--bg-raised);
    border: 1px solid var(--border-dim); flex-shrink: 0;
    position: relative;
  }
  .cover-btn {
    display: block; position: absolute; inset: 0;
    width: 100%; height: 100%;
    background: none; border: none; padding: 0; cursor: pointer;
    transition: filter var(--t-base);
  }
  .cover-btn:hover:not(:disabled) { filter: brightness(0.85); }
  .cover-btn:disabled { cursor: default; }
  :global(.cover) {
    display: block;
    position: absolute; inset: 0;
    width: 100%; height: 100%; object-fit: cover;
  }

  .meta-skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
  .sk-line { border-radius: var(--radius-sm); }

  .meta { display: flex; flex-direction: column; gap: var(--sp-3); }

  .title {
    font-size: var(--text-base); font-weight: var(--weight-medium);
    color: var(--text-primary); line-height: var(--leading-snug);
    letter-spacing: var(--tracking-tight);
    background: none; border: none; padding: 0; text-align: left; cursor: pointer;
    transition: color var(--t-base);
  }
  .title:hover:not(:disabled) { color: var(--accent-fg); }
  .title:disabled { cursor: default; }
  .byline { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-ui); }

  .badges { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
  .badge {
    display: inline-block; font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider); text-transform: uppercase;
    padding: 2px 7px; border-radius: var(--radius-sm); width: fit-content;
  }
  .badge-ongoing { background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); }
  .badge-ended   { background: var(--bg-raised); color: var(--text-faint); border: 1px solid var(--border-dim); }
  .badge-source  {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--bg-raised); color: var(--text-faint); border: 1px solid var(--border-dim);
    text-transform: none; letter-spacing: var(--tracking-normal);
  }
  :global(.badge-source-icon) { width: 12px; height: 12px; border-radius: 2px; object-fit: cover; }

  .alttitles-section { display: flex; flex-direction: column; gap: var(--sp-1); }
  .row-toggle {
    display: flex; align-items: center; justify-content: space-between; width: 100%;
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); padding: 2px 0; transition: color var(--t-base);
  }
  .row-toggle:hover { color: var(--text-muted); }
  .alttitles-list { display: flex; flex-direction: column; gap: 3px; padding-top: var(--sp-1); }
  .alttitle {
    font-size: var(--text-2xs); color: var(--text-faint); font-family: var(--font-ui);
    line-height: var(--leading-snug); padding-left: var(--sp-1);
    border-left: 1px solid var(--border-dim);
  }

  .genres { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
  .genre {
    font-size: var(--text-2xs); font-family: var(--font-ui); color: var(--text-faint);
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    border-radius: var(--radius-sm); padding: 1px 6px; letter-spacing: var(--tracking-wide);
    cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .genre:hover { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .genre-toggle {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    background: var(--bg-raised); border: 1px solid var(--border-dim);
    border-radius: var(--radius-sm); padding: 1px 6px; letter-spacing: var(--tracking-wide);
    cursor: pointer; transition: color var(--t-base), border-color var(--t-base);
  }
  .genre-toggle:hover { color: var(--accent-fg); border-color: var(--accent-dim); }

  .desc-wrap { display: flex; flex-direction: column; gap: var(--sp-1); }
  .desc {
    font-size: var(--text-xs); color: var(--text-muted); line-height: var(--leading-base);
    display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }
  .desc.desc-open { display: block; -webkit-line-clamp: unset; line-clamp: unset; overflow: visible; }
  .expand-toggle {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); align-self: flex-start; transition: color var(--t-base);
  }
  .expand-toggle:hover { color: var(--accent-fg); }

  .cta-section { display: flex; flex-direction: column; gap: var(--sp-2); }
  .read-btn {
    display: flex; align-items: center; justify-content: center; gap: var(--sp-2);
    width: 100%; padding: 9px var(--sp-3); border-radius: var(--radius-md);
    background: var(--accent); border: 1px solid var(--accent);
    color: var(--accent-contrast, #fff); font-size: var(--text-xs); font-family: var(--font-ui);
    letter-spacing: var(--tracking-wide); cursor: pointer; transition: opacity var(--t-base);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .read-btn:hover { opacity: 0.88; }

  .actions { display: flex; align-items: center; gap: var(--sp-2); }
  .library-btn {
    display: flex; align-items: center; gap: var(--sp-2);
    font-size: var(--text-xs); font-family: var(--font-ui); letter-spacing: var(--tracking-wide);
    padding: 5px 10px; border-radius: var(--radius-md); border: 1px solid var(--border-strong);
    color: var(--text-muted); background: var(--bg-raised);
    transition: border-color var(--t-base), color var(--t-base), background var(--t-base); flex: 1;
  }
  .library-btn:hover { border-color: var(--accent); color: var(--accent-fg); }
  .library-btn.active { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
  .library-btn:disabled { opacity: 0.4; cursor: default; }

  .external-link {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: var(--radius-md);
    border: 1px solid var(--border-dim); color: var(--text-faint); flex-shrink: 0;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .external-link:hover { color: var(--text-muted); border-color: var(--border-strong); }

  .progress-section { display: flex; flex-direction: column; gap: var(--sp-1); }
  .progress-header { display: flex; justify-content: space-between; align-items: center; }
  .progress-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .progress-pct   { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--accent-fg); letter-spacing: var(--tracking-wide); }
  .progress-track { height: 3px; background: var(--border-base); border-radius: var(--radius-full); overflow: hidden; }
  .progress-fill  { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.4s ease; }

  .details-section { display: flex; flex-direction: column; gap: 2px; }
  .details-toggle {
    display: flex; align-items: center; justify-content: space-between;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); padding: 4px 0; transition: color var(--t-base);
  }
  .details-toggle:hover { color: var(--text-muted); }
  .details-body { display: flex; flex-direction: column; gap: var(--sp-2); padding-top: var(--sp-2); }

  .detail-actions { display: flex; flex-direction: column; gap: var(--sp-1); padding-top: var(--sp-1); }
  .detail-action-btn {
    display: flex; align-items: center; gap: var(--sp-2); width: 100%;
    padding: 6px var(--sp-2); border-radius: var(--radius-md);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    color: var(--text-faint); background: none; border: 1px solid var(--border-dim); cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .detail-action-btn:hover { color: var(--text-muted); border-color: var(--border-strong); background: var(--bg-raised); }
  .detail-action-active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .detail-action-active:hover { color: var(--accent-fg); border-color: var(--accent); }
  .detail-action-danger { color: var(--color-error); }
  .detail-action-danger:hover:not(:disabled) { background: var(--color-error-bg); border-color: var(--color-error); color: var(--color-error); }
  .detail-action-danger:disabled { opacity: 0.4; cursor: default; }
</style>