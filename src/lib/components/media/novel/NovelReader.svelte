<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { goto } from "$app/navigation";
  import { TextT, BookmarkSimple } from "phosphor-svelte";
  import { seriesState, setPreviewManga } from "$lib/state/series.svelte";
  import { settingsState } from "$lib/state/settings.svelte";
  import { novelReaderState, resolvedNovelFont, type NovelSegment } from "$lib/state/novelReader.svelte";
  import { mediaViewState } from "$lib/state/mediaView.svelte";
  import { chapterNav } from "$lib/components/media/shared/useChapterNav";
  import { createMediaKeyHandler } from "$lib/components/media/shared/mediaKeybinds";
  import { createBarReveal } from "$lib/components/media/shared/barReveal.svelte";
  import { throttledProgressReporter } from "$lib/components/media/shared/progress";
  import { trackHistory } from "$lib/components/media/shared/historyTracking.svelte";
  import { markChapterRead } from "$lib/components/media/manga/lib/chapterActions";
  import { getChapterText } from "$lib/components/media/novel/lib/novelLoader";
  import { sanitizeNovelHtml } from "$lib/components/media/novel/lib/sanitizeHtml";
  import MediaChrome from "$lib/components/media/shared/MediaChrome.svelte";
  import MediaSlider from "$lib/components/media/shared/MediaSlider.svelte";
  import NovelSettingsPanel from "$lib/components/media/novel/NovelSettingsPanel.svelte";

  const nav        = chapterNav();
  const manga      = $derived(seriesState.activeManga);
  const chapter    = $derived(seriesState.activeChapter);
  const reportProg = throttledProgressReporter(4000);
  const markedRead = new Set<string>();

  let scrollEl = $state<HTMLDivElement | null>(null);

  const st = novelReaderState;
  const mediaId = $derived(manga?.mediaId ?? manga?.libraryEntryId ?? manga?.id ?? "");

  const activeSeg = $derived(st.segments.find(s => s.chapterId === chapter?.id) ?? st.segments[0]);
  const chapterLabel = $derived(
    activeSeg ? `Ch. ${activeSeg.chapterNumber}${activeSeg.name ? ` — ${activeSeg.name}` : ""}` : "",
  );
  const pctExact = $derived(st.scrollPct * 100);
  const readout  = $derived(`${Math.round(pctExact)}%`);

  trackHistory(() => pctExact);

  let cfgOpen = $state(false);

  const prefsKey = $derived(manga?.prefsKey ?? manga?.id ?? "");
  const isBookmarked = $derived(
    !!seriesState.bookmarks.find(b => b.mangaId === prefsKey && b.chapterId === chapter?.id),
  );
  function toggleBookmark() {
    const c = chapter, m = manga;
    if (!c || !m || !prefsKey) return;
    if (isBookmarked) {
      seriesState.removeBookmark(c.id);
    } else {
      seriesState.setBookmark({
        mangaId: prefsKey, mangaTitle: m.title, thumbnailUrl: m.thumbnailUrl ?? "",
        chapterId: c.id, chapterName: c.name, pageNumber: 0,
      });
    }
  }

  async function fetchSegment(chapterId: string, num: number, name: string): Promise<NovelSegment | null> {
    const res = await getChapterText(mediaId, chapterId);
    if (res.unsupported || res.text == null) return null;
    return {
      chapterId, chapterNumber: num, name,
      format: res.format ?? "text",
      body: res.format === "html" ? sanitizeNovelHtml(res.text) : res.text,
    };
  }

  async function loadInitial() {
    const c = chapter;
    if (!c || !mediaId) return;
    st.reset();
    const seg = await fetchSegment(c.id, c.chapterNumber, c.name);
    st.unsupported = seg == null;
    st.segments    = seg ? [seg] : [];
    st.loading     = false;
    mediaViewState.loading = false;
    await tick();
    scrollEl?.scrollTo(0, 0);
    st.scrollPct = 0;
  }

  async function appendNext() {
    if (st.appending) return;
    const list = seriesState.readerChapterList;
    const last = st.segments[st.segments.length - 1];
    if (!last) return;
    const i = list.findIndex(c => c.id === last.chapterId);
    const next = i >= 0 ? list[i + 1] : null;
    if (!next || st.hasSegment(next.id)) return;
    st.appending = true;
    try {
      const seg = await fetchSegment(next.id, next.chapterNumber, next.name);
      if (seg) st.segments = [...st.segments, seg];
    } finally {
      st.appending = false;
    }
  }

  function syncActiveSegment() {
    const el = scrollEl;
    if (!el || !st.segments.length) return;
    const centre = el.scrollTop + el.clientHeight / 2;
    const sections = Array.from(el.querySelectorAll<HTMLElement>("[data-cid]"));
    let currentId = st.segments[0].chapterId;
    for (const sec of sections) {
      if (sec.offsetTop <= centre) currentId = sec.dataset.cid!;
      else break;
    }

    const outgoingId = chapter?.id ?? null;
    if (currentId !== outgoingId) {
      const list = seriesState.readerChapterList;
      const ch = list.find(c => c.id === currentId);
      if (ch) {
        const from = st.segments.findIndex(s => s.chapterId === outgoingId);
        const to   = st.segments.findIndex(s => s.chapterId === currentId);
        if (from !== -1 && to > from) {
          for (let i = from; i < to; i++) {
            const cid = st.segments[i].chapterId;
            if (!markedRead.has(cid)) markChapterRead(cid, markedRead);
          }
        }
        lastChapterId = ch.id;
        seriesState.activeChapter = ch;
        goto(`/media/${encodeURIComponent(mediaId)}/${encodeURIComponent(ch.id)}`, { replaceState: true, noScroll: true });
      }
    }

    const activeSec = sections.find(s => s.dataset.cid === currentId);
    if (activeSec) {
      const within = (el.scrollTop + el.clientHeight - activeSec.offsetTop) / Math.max(1, activeSec.offsetHeight);
      const frac = Math.max(0, Math.min(1, within));
      reportProg(currentId, frac, { completed: frac >= 0.98 });
      if (frac >= 0.98 && !markedRead.has(currentId)) markChapterRead(currentId, markedRead);
    }
    for (const sec of sections) {
      const cid = sec.dataset.cid!;
      if (sec.offsetTop + sec.offsetHeight < el.scrollTop && !markedRead.has(cid)) {
        markChapterRead(cid, markedRead);
      }
    }
  }

  function onScroll() {
    const el = scrollEl;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    st.scrollPct = max > 0 ? el.scrollTop / max : 0;
    syncActiveSegment();
    if (max - el.scrollTop < 1500) void appendNext();
  }

  function seek(toPct: number) {
    const el = scrollEl;
    if (!el) return;
    el.scrollTo({ top: ((el.scrollHeight - el.clientHeight) * toPct) / 100 });
  }

  const bar = createBarReveal();

  const onKey = createMediaKeyHandler({ close: nav.close, next: nav.goNext, prev: nav.goPrev });

  onMount(() => { window.addEventListener("keydown", onKey); bar.show(); loadInitial(); });
  onDestroy(() => { window.removeEventListener("keydown", onKey); bar.destroy(); });

  let lastChapterId: string | null = null;
  $effect(() => {
    const id = chapter?.id ?? null;
    if (!id || id === lastChapterId) return;
    lastChapterId = id;
    if (st.hasSegment(id)) {
      tick().then(() => {
        const sec = scrollEl?.querySelector<HTMLElement>(`[data-cid="${id}"]`);
        if (sec && scrollEl) scrollEl.scrollTo({ top: sec.offsetTop });
      });
    } else {
      loadInitial();
    }
  });
</script>

<div class="root" class:ui-unzoom={!(settingsState.settings.readerContainerized ?? false)} role="presentation" onmousemove={bar.onMove}>
  <div
    class="novel novel-{st.theme}"
    role="presentation"
    bind:this={scrollEl}
    onscroll={onScroll}
    onclick={bar.onClick}
    ondblclick={bar.onDblClick}
  >
    <article
      class="col"
      style="font-family: {resolvedNovelFont(st)}; font-size: {st.fontScale}rem; line-height: {st.lineHeight}; max-width: {st.pageWidth}rem; text-align: {st.textAlign}; --para-gap: {st.paraSpacing}em;"
    >
      {#if st.loading}
        <p class="notice">Loading…</p>
      {:else if st.unsupported}
        <div class="notice">
          <p class="notice-title">Nothing to read here yet</p>
          <p>The server didn't return any text for this chapter. It may not be
             downloaded, or this source doesn't provide chapter text. Try
             downloading the chapter, or pick another source for this series.</p>
        </div>
      {:else if st.error}
        <p class="notice">{st.error}</p>
      {:else}
        {#each st.segments as seg (seg.chapterId)}
          <section data-cid={seg.chapterId} class="seg">
            <p class="seg-head">Ch. {seg.chapterNumber}{seg.name ? ` — ${seg.name}` : ""}</p>
            {#if seg.format === "html"}
              {@html seg.body}
            {:else}
              {#each seg.body.split(/\n{2,}/) as para}<p>{para}</p>{/each}
            {/if}
          </section>
        {/each}
        {#if st.appending}<p class="notice appending">Loading next chapter…</p>{/if}
      {/if}
    </article>
  </div>

  <MediaChrome
    title={manga?.title ?? ""}
    {chapterLabel}
    {readout}
    hasPrev={!!nav.prev}
    hasNext={!!nav.next}
    onPrev={nav.goPrev}
    onNext={nav.goNext}
    onClose={nav.close}
    onOpenPreview={() => { if (manga) setPreviewManga(manga); }}
  >
    {#snippet endControls()}
      <button class="icon-btn" class:active={isBookmarked}
        data-tip={isBookmarked ? "Remove bookmark" : "Bookmark"} aria-label="Bookmark" onclick={toggleBookmark}>
        <BookmarkSimple size={14} weight={isBookmarked ? "fill" : "regular"} />
      </button>

      <button class="icon-btn" class:active={cfgOpen} data-tip="Text options" aria-label="Text options"
        onclick={() => (cfgOpen = !cfgOpen)}>
        <TextT size={14} weight="regular" />
      </button>
    {/snippet}

    {#snippet slider()}
      <MediaSlider pct={pctExact} label={readout} onSeek={seek} />
    {/snippet}
  </MediaChrome>

  {#if cfgOpen}
    <NovelSettingsPanel onClose={() => (cfgOpen = false)} />
  {/if}
</div>

<style>
  .root { position: fixed; inset: 0; background: #000; z-index: var(--z-reader); }

  .novel { position: absolute; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .col {
    margin: 0 auto;
    padding: calc(44px + var(--sp-8)) var(--sp-6) calc(50px + var(--sp-8));
  }
  .seg { padding-bottom: var(--sp-10); }
  .seg-head {
    font-family: var(--font-ui); font-size: 0.72em; letter-spacing: var(--tracking-wider);
    text-transform: uppercase; opacity: 0.45; margin: 0 0 1.4em; padding-bottom: 0.5em;
    border-bottom: 1px solid currentColor;
  }
  .col :global(p) { margin: 0 0 var(--para-gap, 1.1em); }
  .col :global(h1), .col :global(h2), .col :global(h3),
  .col :global(h4), .col :global(h5), .col :global(h6) { margin: 1.6em 0 0.6em; font-weight: 700; line-height: 1.3; }
  .col :global(blockquote) { margin: 0 0 1.1em; padding-left: 1em; border-left: 2px solid currentColor; opacity: 0.8; }
  .col :global(ul), .col :global(ol) { margin: 0 0 1.1em 1.4em; }
  .col :global(hr) { border: none; border-top: 1px solid currentColor; opacity: 0.3; margin: 2em auto; width: 40%; }
  .notice { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-muted); line-height: 1.6; }
  .notice > :global(p) { margin: 0 0 0.6em; }
  .notice-title { color: var(--text-secondary); font-weight: var(--weight-medium); }
  .appending { text-align: center; opacity: 0.6; }

  .novel-paper { background: #f5f2e9; color: #2b2622; }
  .novel-sepia { background: #efe3c8; color: #4a3c28; }
  .novel-dark  { background: #14140f; color: #cbc6bd; }

  .icon-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    height: 30px; min-width: 30px; padding: 0 6px; border-radius: var(--radius-md);
    color: var(--text-muted); background: none; border: none; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .icon-btn:hover, .icon-btn.active { color: var(--text-primary); background: var(--bg-raised); }

</style>
