<script lang="ts">
  import { untrack }             from "svelte";
  import { tsunagu }             from "$lib/server-adapters/tsunagu";
  import { settingsState }       from "$lib/state/settings.svelte";
  import { setPreviewManga }     from "$lib/state/series.svelte";
  import { dedupeMangaById, shouldHideNsfw } from "$lib/core/util";
  import Thumbnail               from "$lib/components/shared/manga/Thumbnail.svelte";
  import ContextMenu             from "$lib/components/shared/ui/ContextMenu.svelte";
  import { ArrowLeftIcon, BookmarkSimpleIcon, CircleNotchIcon } from "phosphor-svelte";
  import type { Manga, Source }  from "$lib/types";
  import { toBrowseManga, toSource } from "$lib/components/browse/lib/searchFilter";
  import {
    PAGE_SIZE, INITIAL_PAGES, MAX_SOURCES,
    parseTags, tagsLabel, matchesAllTags, runConcurrent,
  } from "$lib/components/browse/lib/searchFilter";

  interface MenuItem {
    label:      string;
    icon?:      any;
    onClick:    () => void;
    danger?:    boolean;
    disabled?:  boolean;
    separator?: never;
    children?:  MenuEntry[];
  }
  interface MenuSeparator { separator: true }
  type MenuEntry = MenuItem | MenuSeparator;

  interface Props {
    genre:  string;
    onBack: () => void;
  }
  let { genre, onBack }: Props = $props();

  const tags       = $derived(parseTags(genre));
  const primaryTag = $derived(tags[0] ?? "");
  const label      = $derived(tagsLabel(tags));

  let libraryManga: Manga[]  = $state([]);
  let sourceManga:  Manga[]  = $state([]);
  let loadingInitial         = $state(true);
  let loadingMore            = $state(false);
  let visibleCount           = $state(PAGE_SIZE);
  let ctx: { x: number; y: number; manga: Manga } | null = $state(null);

  const nextPageMap = new Map<string, number>();
  let sources: Source[]                  = $state([]);
  let abortCtrl: AbortController | null = null;

  const filtered = $derived.by(() => {
    const libMatches = libraryManga.filter((m) => matchesAllTags(m, tags) && !shouldHideNsfw(m as any, settingsState.settings));
    const libIds     = new Set(libMatches.map((m) => m.id));
    return dedupeMangaById([...libMatches, ...sourceManga.filter((m) => !libIds.has(m.id) && !shouldHideNsfw(m as any, settingsState.settings))]);
  });

  const visibleItems   = $derived(filtered.slice(0, visibleCount));
  const hasMoreVisible = $derived(visibleCount < filtered.length);
  const hasMoreNetwork = $derived(sources.some((s) => (nextPageMap.get(s.id) ?? -1) > 0));
  const hasMore        = $derived(hasMoreVisible || hasMoreNetwork);

  $effect(() => { const f = genre; if (f) untrack(() => load(f)); });

  async function load(filter: string) {
    abortCtrl?.abort();
    const ctrl = new AbortController();
    abortCtrl  = ctrl;
    loadingInitial = true;
    sourceManga    = [];
    libraryManga   = [];
    visibleCount   = PAGE_SIZE;
    nextPageMap.clear();

    const t  = parseTags(filter);
    const pt = t[0] ?? "";

    tsunagu.library().then((entries) => {
      if (ctrl.signal.aborted) return;
      libraryManga = entries.map((e) => ({
        id:            e.id,
        title:         e.title,
        thumbnailUrl:  e.thumbnailUrl ?? "",
        inLibrary:     true,
        unreadCount:   e.unreadCount,
        downloadCount: e.downloadCount,
        genre:         e.genres,
        status:        e.status,
        source:        e.source ? { id: e.source.id, name: e.source.name, displayName: e.source.displayName, isNsfw: e.source.isNsfw } : null,
      }));
    }).catch(() => {});

    tsunagu.installedExtensions().then(async (exts) => {
      if (ctrl.signal.aborted) return;
      const srcs = exts.filter((e) => e.installed).map(toSource).slice(0, MAX_SOURCES);
      sources    = srcs;
      for (const src of srcs) nextPageMap.set(src.id, -1);

      await runConcurrent(srcs, async (src) => {
        if (ctrl.signal.aborted) return;
        const pageItems: Manga[] = [];
        for (let page = 1; page <= INITIAL_PAGES; page++) {
          if (ctrl.signal.aborted) return;
          let result: Awaited<ReturnType<typeof tsunagu.search>> | null = null;
          try {
            result = await tsunagu.search(src.id, pt, page, undefined, ctrl.signal);
          } catch { break; }
          if (!result || ctrl.signal.aborted) break;
          const mapped = result.results.map((r) => toBrowseManga(r, src.id));
          pageItems.push(...mapped);
          if (!result.hasNextPage) { nextPageMap.set(src.id, -1); break; }
          else if (page === INITIAL_PAGES) nextPageMap.set(src.id, INITIAL_PAGES + 1);
        }
        if (!ctrl.signal.aborted && pageItems.length > 0) {
          sourceManga    = dedupeMangaById([...sourceManga, ...pageItems]);
          loadingInitial = false;
        }
      }, ctrl.signal);

      if (!ctrl.signal.aborted) loadingInitial = false;
    }).catch(() => { if (!ctrl.signal.aborted) loadingInitial = false; });
  }

  async function loadMore() {
    if (loadingMore) return;
    if (hasMoreVisible) { visibleCount += PAGE_SIZE; return; }
    const srcs = sources.filter((s) => (nextPageMap.get(s.id) ?? -1) > 0);
    if (!srcs.length) return;
    loadingMore = true;
    abortCtrl?.abort();
    const ctrl = new AbortController();
    abortCtrl  = ctrl;
    try {
      await runConcurrent(srcs, async (src) => {
        const page = nextPageMap.get(src.id)!;
        if (ctrl.signal.aborted) return;
        let result: Awaited<ReturnType<typeof tsunagu.search>> | null = null;
        try {
          result = await tsunagu.search(src.id, primaryTag, page, undefined, ctrl.signal);
        } catch { nextPageMap.set(src.id, -1); return; }
        if (!result || ctrl.signal.aborted) return;
        nextPageMap.set(src.id, result.hasNextPage ? page + 1 : -1);
        const mapped = result.results.map((r) => toBrowseManga(r, src.id));
        if (mapped.length > 0) sourceManga = dedupeMangaById([...sourceManga, ...mapped]);
      }, ctrl.signal);
    } finally {
      if (!ctrl.signal.aborted) { visibleCount += PAGE_SIZE; loadingMore = false; }
    }
  }

  function openCtx(e: MouseEvent, m: Manga) {
    e.preventDefault();
    ctx = { x: e.clientX, y: e.clientY, manga: m };
  }

  function buildCtxItems(m: Manga): MenuEntry[] {
    return [
      {
        label: m.inLibrary ? "In Library" : "Add to library",
        icon: BookmarkSimpleIcon,
        disabled: m.inLibrary,
        onClick: () => tsunagu.addToLibrary(m.id)
          .then(() => { sourceManga = sourceManga.map((x) => x.id === m.id ? { ...x, inLibrary: true } : x); })
          .catch(console.error),
      },
    ];
  }

  $effect(() => () => { abortCtrl?.abort(); });
</script>

<div class="root">
  <div class="header">
    <button class="back" onclick={onBack}>
      <ArrowLeftIcon size={13} weight="light" /><span>Back</span>
    </button>
    <span class="title">{label}</span>
    {#if !loadingInitial || filtered.length > 0}
      <span class="result-count">{visibleItems.length}{filtered.length > visibleCount ? "+" : ""} of {filtered.length}</span>
    {/if}
    {#if !loadingInitial && hasMoreNetwork}
      <span class="loading-hint">More loading…</span>
    {/if}
  </div>

  {#if loadingInitial && filtered.length === 0}
    <div class="grid">
      {#each Array(50) as _}
        <div class="card-skeleton">
          <div class="cover-skeleton skeleton"></div>
          <div class="title-skeleton skeleton"></div>
        </div>
      {/each}
    </div>
  {:else if filtered.length === 0}
    <div class="empty">No manga found for "{label}".</div>
  {:else}
    <div class="grid">
      {#each visibleItems as m, i (`${m.extensionId}-${m.sourceEntryId}`)}
        <button class="card" onclick={() => setPreviewManga(m)} oncontextmenu={(e) => { e.stopPropagation(); openCtx(e, m); }}>
          <div class="cover-wrap">
            <Thumbnail src={m.thumbnailUrl} alt={m.title} class="cover" priority={i < 12 ? 12 - i : 0} id={m.id} />
            {#if m.inLibrary}<span class="in-library-badge">Saved</span>{/if}
          </div>
          <p class="card-title">{m.title}</p>
        </button>
      {/each}
      {#if hasMore}
        <div class="show-more-cell">
          <button class="show-more-btn" onclick={loadMore} disabled={loadingMore}>
            {#if loadingMore}<CircleNotchIcon size={13} weight="light" class="anim-spin" /> Loading…{:else}Show more{/if}
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if ctx}
  <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.manga)} onClose={() => ctx = null} />
{/if}

<style>
  .root { display: flex; flex-direction: column; height: 100%; overflow: hidden; animation: fadeIn 0.14s ease both; }
  .header { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-4) var(--sp-6); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .back { display: flex; align-items: center; gap: var(--sp-2); color: var(--text-muted); font-size: var(--text-xs); font-family: var(--font-ui); letter-spacing: var(--tracking-wide); text-transform: uppercase; background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base); flex-shrink: 0; }
  .back:hover { color: var(--text-secondary); }
  .title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); letter-spacing: var(--tracking-tight); }
  .result-count, .loading-hint { margin-left: auto; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(100px,13vw,140px),1fr)); gap: var(--sp-4); padding: var(--sp-5) var(--sp-6) var(--sp-6); overflow-y: auto; flex: 1; align-content: start; will-change: scroll-position; -webkit-overflow-scrolling: touch; contain: layout style; }
  .card { background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
  .card:hover :global(.cover) { filter: brightness(1.06); }
  .card:hover .card-title { color: var(--text-primary); }
  .cover-wrap { position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim); transform: translateZ(0); }
  :global(.cover) { width: 100%; height: 100%; object-fit: cover; transition: filter var(--t-base); will-change: filter; }
  .in-library-badge { position: absolute; bottom: var(--sp-1); left: var(--sp-1); font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); padding: 2px 5px; border-radius: var(--radius-sm); }
  .card-title { margin-top: var(--sp-2); font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; transition: color var(--t-base); }
  .card-skeleton { padding: 0; }
  .cover-skeleton { aspect-ratio: 2/3; border-radius: var(--radius-md); }
  .title-skeleton { height: 11px; margin-top: var(--sp-2); width: 75%; }
  @keyframes shimmer { from { background-position: -200% 0 } to { background-position: 200% 0 } }
  .skeleton { border-radius: var(--radius-sm); background: linear-gradient(90deg, var(--bg-raised) 25%, var(--bg-overlay, color-mix(in srgb, var(--bg-raised) 80%, var(--text-primary) 6%)) 50%, var(--bg-raised) 75%); background-size: 200% 100%; animation: shimmer 1.6s ease-in-out infinite; }
  .empty { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); }
  .show-more-cell { grid-column: 1/-1; display: flex; justify-content: center; padding: var(--sp-2) 0 var(--sp-4); }
  .show-more-btn { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 20px; border-radius: var(--radius-md); background: var(--bg-raised); color: var(--text-muted); border: 1px solid var(--border-dim); cursor: pointer; transition: color var(--t-base), border-color var(--t-base); }
  .show-more-btn:hover:not(:disabled) { color: var(--text-secondary); border-color: var(--border-strong); }
  .show-more-btn:disabled { opacity: 0.5; cursor: default; }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>