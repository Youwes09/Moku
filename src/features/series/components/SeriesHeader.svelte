<script lang="ts">
  import {
    ArrowLeft, BookmarkSimple, ArrowSquareOut, Play, CaretDown,
    Eye, ArrowsClockwise, LinkSimpleHorizontalBreak, ChartLineUp,
    MapPin, Gear, Trash, Image,
  } from "phosphor-svelte";
  import Thumbnail   from "@shared/manga/Thumbnail.svelte";
  import { resolvedCover } from "@core/cover/coverResolver";
  import type { Manga, Chapter, Category } from "@types";
  import type { MangaPrefs } from "@store/state.svelte";
  import { store, setActiveManga, setGenreFilter, setNavPage, setPreviewManga, linkManga, unlinkManga } from "@store/state.svelte";

  interface ContinueChapter {
    chapter:    Chapter;
    type:       "start" | "continue" | "reread";
    resumePage: number | null;
  }

  interface Props {
    manga:            Manga | null;
    loadingManga:     boolean;
    totalCount:       number;
    readCount:        number;
    progressPct:      number;
    downloadedCount:  number;
    deletingAll:      boolean;
    continueChapter:  ContinueChapter | null;
    hasAnyAutomation: boolean;
    markersOpen:      boolean;
    linkedIds:        number[];
    allMangaForLink:  Manga[];
    loadingLinkList:  boolean;
    mangaCategories:  Category[];
    onRead:           (ch: ContinueChapter) => void;
    onToggleLibrary:  () => void;
    onDeleteAll:      () => void;
    onMigrateOpen:    () => void;
    onTrackingOpen:   () => void;
    onAutoOpen:       () => void;
    onMarkersToggle:  () => void;
    onLinkPickerOpen: () => void;
    onCoverPickerOpen: () => void;
    togglingLibrary:  boolean;
  }

  let {
    manga, loadingManga, totalCount, readCount, progressPct,
    downloadedCount, deletingAll, continueChapter, hasAnyAutomation,
    markersOpen, linkedIds, allMangaForLink, loadingLinkList,
    mangaCategories,
    onRead, onToggleLibrary, onDeleteAll, onMigrateOpen,
    onTrackingOpen, onAutoOpen, onMarkersToggle, onLinkPickerOpen,
    onCoverPickerOpen, togglingLibrary,
  }: Props = $props();

  let manageOpen:     boolean = $state(false);
  let genresExpanded: boolean = $state(false);
  let altOpen:        boolean = $state(false);

  const statusLabel = $derived(
    manga?.status ? manga.status.charAt(0) + manga.status.slice(1).toLowerCase() : null
  );

  const markerCount = $derived(
    store.activeManga ? store.getMarkersForManga(store.activeManga.id).length : 0
  );

  const hasCoverOverride = $derived(
    !!store.settings.mangaPrefs?.[store.activeManga!.id]?.coverUrl
  );

  const altTitles = $derived(
    (manga as any)?.alternativeTitles ?? (manga as any)?.altTitles ?? []
  );
</script>

<div class="sidebar">
  <button class="back" onclick={() => setActiveManga(null)}>
    <ArrowLeft size={13} weight="light" /> Back
  </button>

  <button class="cover-wrap" onclick={() => setPreviewManga(manga)}>
    <Thumbnail src={resolvedCover(store.activeManga!.id, store.activeManga!.thumbnailUrl)} alt={store.activeManga!.title} class="cover" />
  </button>

  {#if loadingManga}
    <div class="meta-skeleton">
      <div class="skeleton sk-line" style="width:90%;height:14px"></div>
      <div class="skeleton sk-line" style="width:60%;height:11px"></div>
    </div>
  {:else}
    <div class="meta">
      <p class="title">{manga?.title}</p>

      {#if manga?.author || manga?.artist}
        <p class="byline">{[manga?.author, manga?.artist].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</p>
      {/if}

      <div class="badges">
        {#if statusLabel}
          <span class="badge" class:badge-ongoing={manga?.status === "ONGOING"} class:badge-ended={manga?.status !== "ONGOING"}>{statusLabel}</span>
        {/if}
        {#if manga?.source?.displayName ?? (manga as any)?.source?.name}
          <span class="badge badge-source">{manga?.source?.displayName ?? (manga as any)?.source?.name}</span>
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
              {#each altTitles as t}
                <p class="alttitle">{t}</p>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if manga?.genre?.length}
        <div class="genres">
          {#each (genresExpanded ? manga.genre : manga.genre.slice(0, 3)) as g}
            <button class="genre" onclick={() => { setGenreFilter(g); setNavPage("search"); setActiveManga(null); }}>{g}</button>
          {/each}
          {#if manga.genre.length > 3}
            <button class="genre-toggle" onclick={() => genresExpanded = !genresExpanded}>
              {genresExpanded ? "less" : `+${manga.genre.length - 3}`}
            </button>
          {/if}
        </div>
      {/if}

      {#if manga?.description}
        <div class="desc-wrap">
          <p class="desc">{manga.description}</p>
          <button class="expand-toggle" onclick={() => setPreviewManga(manga)}>Read more</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="cta-section">
    {#if continueChapter}
      <button class="read-btn" onclick={() => onRead(continueChapter!)}>
        <Play size={12} weight="fill" />
        {continueChapter.type === "reread" ? "Read again"
          : continueChapter.type === "start" ? "Start reading"
          : `Continue · Ch.${continueChapter.chapter.chapterNumber}${continueChapter.resumePage ? ` p.${continueChapter.resumePage}` : ""}`}
      </button>
    {/if}
    <div class="actions">
      <button class="library-btn" class:active={manga?.inLibrary} onclick={onToggleLibrary} disabled={togglingLibrary || loadingManga}>
        <BookmarkSimple size={13} weight={manga?.inLibrary ? "fill" : "light"} />
        {manga?.inLibrary ? "In Library" : "Add to Library"}
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
            <button class="detail-action-btn" onclick={() => setPreviewManga(manga)}>
              <Eye size={12} weight="light" /> Preview
            </button>
            <button class="detail-action-btn" onclick={onMigrateOpen}>
              <ArrowsClockwise size={12} weight="light" /> Switch Source
            </button>
            <button class="detail-action-btn" class:detail-action-active={linkedIds.length > 0} onclick={onLinkPickerOpen}>
              <LinkSimpleHorizontalBreak size={12} weight={linkedIds.length > 0 ? "fill" : "light"} />
              Series Link{linkedIds.length > 0 ? ` (${linkedIds.length})` : ""}
            </button>
            <button class="detail-action-btn" class:detail-action-active={hasCoverOverride} onclick={onCoverPickerOpen}>
              <Image size={12} weight={hasCoverOverride ? "fill" : "light"} /> Cover Image
            </button>
            <button class="detail-action-btn" onclick={onTrackingOpen}>
              <ChartLineUp size={12} weight="light" /> Tracking
            </button>
            <button class="detail-action-btn" class:detail-action-active={markersOpen} onclick={onMarkersToggle}>
              <MapPin size={12} weight={markersOpen ? "fill" : "light"} />
              Markers{markerCount > 0 ? ` (${markerCount})` : ""}
            </button>
            {#if manga?.inLibrary}
              <button class="detail-action-btn" class:detail-action-active={hasAnyAutomation} onclick={onAutoOpen}>
                <Gear size={12} weight={hasAnyAutomation ? "fill" : "light"} /> Automation
              </button>
            {/if}
            {#if downloadedCount > 0}
              <button class="detail-action-btn detail-action-danger" onclick={onDeleteAll} disabled={deletingAll}>
                <Trash size={12} weight="light" /> {deletingAll ? "Deleting…" : `Delete Downloads (${downloadedCount})`}
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
    width: 240px;
    flex-shrink: 0;
    padding: var(--sp-5);
    border-right: 1px solid var(--border-dim);
    overflow-y: auto;
    scrollbar-width: none;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
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
    cursor: pointer; transition: opacity var(--t-base);
    padding: 0;
  }
  .cover-wrap:hover { opacity: 0.88; }
  :global(.cover) { width: 100%; height: 100%; object-fit: cover; }

  .meta-skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
  .sk-line { border-radius: var(--radius-sm); }

  .meta { display: flex; flex-direction: column; gap: var(--sp-3); }

  .title {
    font-size: var(--text-base); font-weight: var(--weight-medium);
    color: var(--text-primary); line-height: var(--leading-snug);
    letter-spacing: var(--tracking-tight);
  }
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
    background: var(--bg-raised); color: var(--text-faint); border: 1px solid var(--border-dim);
    text-transform: none; letter-spacing: var(--tracking-normal);
  }

  .alttitles-section { display: flex; flex-direction: column; gap: var(--sp-1); }
  .row-toggle {
    display: flex; align-items: center; justify-content: space-between; width: 100%;
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); padding: 2px 0;
    transition: color var(--t-base);
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
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
  }
  .expand-toggle {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); align-self: flex-start;
    transition: color var(--t-base);
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
  .progress-pct { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--accent-fg); letter-spacing: var(--tracking-wide); }
  .progress-track { height: 3px; background: var(--border-base); border-radius: var(--radius-full); overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.4s ease; }

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