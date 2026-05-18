<script lang="ts">
  import { Play, ArrowRight, ArrowLeft, BookOpen, Clock, ListBullets, PushPin, X as XIcon } from "phosphor-svelte";
  import type { Manga, Chapter } from "@types";
  import type { HistoryEntry } from "@store/state.svelte";
  import { store, setGenreFilter, setNavPage } from "@store/state.svelte";
  import { timeAgo } from "../lib/homeHelpers";

  interface HeroSlot {
    kind: "continue" | "pinned" | "empty";
    entry?: HistoryEntry;
    manga?: Manga;
    slotIndex: number;
  }

  let {
    resolvedSlots,
    activeIdx = $bindable(),
    heroThumb,
    heroTitle,
    heroManga,
    heroEntry,
    heroMangaId,
    heroChapters,
    heroNewChapter,
    loadingHeroChapters,
    resuming,
    onresume,
    onopenchapter,
    oncyclenext,
    oncycleprev,
    ongotoslot,
    onopenpicker,
    onunpin,
    onviewall,
  }: {
    resolvedSlots: HeroSlot[];
    activeIdx: number;
    heroThumb: string;
    heroTitle: string;
    heroManga: Manga | null | undefined;
    heroEntry: HistoryEntry | null;
    heroMangaId: number | null;
    heroChapters: Chapter[];
    heroNewChapter: Chapter | null;
    loadingHeroChapters: boolean;
    resuming: boolean;
    onresume: () => void;
    onopenchapter: (ch: Chapter) => void;
    oncyclenext: () => void;
    oncycleprev: () => void;
    ongotoslot: (i: number) => void;
    onopenpicker: (i: 1 | 2 | 3) => void;
    onunpin: (i: 1 | 2 | 3) => void;
    onviewall: () => void;
  } = $props();

  const activeSlot = $derived(resolvedSlots[activeIdx]);
  const TOTAL_SLOTS = 4;
</script>

<div class="hero-stage">
  {#key heroThumb}
    {#if heroThumb}
      <div class="hero-backdrop" style="background-image:url({heroThumb})"></div>
    {:else}
      <div class="hero-backdrop hero-bd-empty"></div>
    {/if}
  {/key}
  <div class="hero-scrim"></div>

  <button
    class="hero-cover-col"
    onclick={onresume}
    disabled={resuming || activeSlot?.kind === "empty"}
    aria-label={heroTitle ? `Resume ${heroTitle}` : "No manga selected"}
  >
    {#if heroThumb}
      <img src={heroThumb} alt={heroTitle} class="hero-cover" loading="eager" decoding="async" />
      {#if activeSlot?.kind === "continue"}
        <div class="cover-resume-hint"><Play size={20} weight="fill" /></div>
      {/if}
    {:else}
      <div class="hero-cover-empty"><BookOpen size={28} weight="light" /></div>
    {/if}
  </button>

  <div class="hero-details">
    {#if activeSlot?.kind === "empty"}
      <p class="hero-empty-title">Nothing here yet</p>
      <p class="hero-empty-sub">
        {activeSlot.slotIndex === 0
          ? "Read a manga to see it here"
          : "Pin a manga or keep reading to fill this slot"}
      </p>
      {#if activeSlot.slotIndex !== 0}
        <button class="hero-cta" onclick={() => onopenpicker(activeSlot.slotIndex as 1 | 2 | 3)}>
          <PushPin size={11} weight="fill" /> Pin manga
        </button>
      {/if}
    {:else}
      <div class="hero-tags">
        {#if activeSlot?.kind === "continue"}
          <span class="hero-tag hero-tag-reading"><Play size={8} weight="fill" /> Reading</span>
        {:else}
          <span class="hero-tag hero-tag-pinned"><PushPin size={8} weight="fill" /> Pinned</span>
        {/if}
        {#if heroNewChapter && !heroNewChapter.isRead}
          <span class="hero-tag hero-tag-new">New ch.{Math.floor(heroNewChapter.chapterNumber)}</span>
        {/if}
        {#each (heroManga?.genre ?? []).slice(0, 3) as g}
          <button
            class="hero-tag hero-tag-genre"
            onclick={() => { setGenreFilter(g); setNavPage("explore"); }}
          >{g}</button>
        {/each}
      </div>

      <h2 class="hero-title">{heroTitle}</h2>
      {#if heroManga?.author}<p class="hero-author">{heroManga.author}</p>{/if}

      {#if heroEntry}
        <p class="hero-progress">
          <Clock size={10} weight="light" />
          {heroEntry.chapterName}
          {#if heroEntry.pageNumber > 1}<span class="hero-prog-page"> · p.{heroEntry.pageNumber}</span>{/if}
          <span class="hero-prog-time">{timeAgo(heroEntry.readAt)}</span>
        </p>
      {/if}

      {#if heroManga?.description}
        <p class="hero-desc">{heroManga.description}</p>
      {/if}

      <div class="hero-actions">
        {#if activeSlot?.kind === "continue"}
          <button class="hero-cta" onclick={onresume} disabled={resuming}>
            <Play size={11} weight="fill" />{resuming ? "Loading…" : "Resume"}
          </button>
        {:else if heroManga}
          <button class="hero-cta" onclick={() => store.previewManga = heroManga!}>
            <BookOpen size={11} weight="light" /> View manga
          </button>
        {/if}
        {#if activeSlot?.slotIndex !== 0}
          {#if activeSlot?.kind === "pinned"}
            <button class="hero-cta-ghost" onclick={() => onunpin(activeSlot.slotIndex as 1 | 2 | 3)}>
              <XIcon size={10} weight="bold" /> Unpin
            </button>
          {:else}
            <button class="hero-cta-ghost" onclick={() => onopenpicker(activeSlot!.slotIndex as 1 | 2 | 3)}>
              <PushPin size={10} weight="light" /> Pin
            </button>
          {/if}
        {/if}
      </div>
    {/if}

    <div class="hero-nav-row">
      <button class="hero-nav-btn" onclick={oncycleprev} aria-label="Previous">
        <ArrowLeft size={12} weight="bold" />
      </button>
      <div class="hero-dots">
        {#each resolvedSlots as slot, i}
          <button
            class="hero-dot"
            class:active={activeIdx === i}
            class:pinned={slot.kind === "pinned"}
            onclick={() => ongotoslot(i)}
            aria-label="Slot {i + 1}"
          ></button>
        {/each}
      </div>
      <button class="hero-nav-btn" onclick={oncyclenext} aria-label="Next">
        <ArrowRight size={12} weight="bold" />
      </button>
      <span class="hero-counter">{activeIdx + 1}/{TOTAL_SLOTS}</span>
    </div>
  </div>

  <div class="hero-chapters">
    <div class="hero-chapters-header">
      <ListBullets size={11} weight="bold" /><span>Up Next</span>
    </div>

    {#if activeSlot?.kind === "empty"}
      <p class="hero-chapters-empty">No chapters to show</p>
    {:else if loadingHeroChapters}
      {#each Array(4) as _}
        <div class="chapter-row-sk">
          <div class="sk sk-num"></div>
          <div class="sk-info">
            <div class="sk sk-name"></div>
            <div class="sk sk-meta"></div>
          </div>
        </div>
      {/each}
    {:else if heroChapters.length === 0}
      <p class="hero-chapters-empty">No chapters available</p>
    {:else}
      {#each heroChapters as ch (ch.id)}
        {@const isCurrent = heroEntry?.chapterId === ch.id}
        <button
          class="chapter-row"
          class:chapter-row-current={isCurrent}
          class:chapter-row-read={ch.isRead && !isCurrent}
          onclick={() => onopenchapter(ch)}
        >
          <span class="ch-num">Ch.{ch.chapterNumber % 1 === 0 ? Math.floor(ch.chapterNumber) : ch.chapterNumber}</span>
          <div class="ch-info">
            <span class="ch-name">{ch.name}</span>
            {#if isCurrent && heroEntry && heroEntry.pageNumber > 1}
              <span class="ch-meta">p.{heroEntry.pageNumber} · in progress</span>
            {:else if ch.isRead}
              <span class="ch-meta ch-read">Read</span>
            {:else if ch.uploadDate}
              <span class="ch-meta">
                {new Date(Number(ch.uploadDate) > 1e10 ? Number(ch.uploadDate) : Number(ch.uploadDate) * 1000)
                  .toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            {/if}
          </div>
          {#if isCurrent}<Play size={10} weight="fill" class="ch-play-icon" />{/if}
        </button>
      {/each}
      {#if heroManga}
        <button class="ch-view-all" onclick={onviewall}>
          All chapters <ArrowRight size={9} weight="bold" />
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .hero-stage {
    position: relative;
    display: flex;
    align-items: stretch;
    height: 374px;
    overflow: hidden;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border-dim);
  }

  .hero-backdrop {
    position: absolute;
    inset: -14px;
    background-size: cover;
    background-position: center 25%;
    filter: blur(22px) saturate(2.4) brightness(0.4);
    transform: scale(1.07);
    pointer-events: none;
    z-index: 0;
    animation: backdropIn 0.5s ease both;
  }
  .hero-bd-empty { background: var(--bg-void); filter: none; }

  .hero-scrim {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background: linear-gradient(110deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.6) 100%);
  }

  .hero-cover-col {
    position: relative;
    z-index: 2;
    flex-shrink: 0;
    width: 256px;
    height: 374px;
    overflow: hidden;
    cursor: pointer;
    background: var(--bg-raised);
    padding: 0;
    border: none;
    border-right: 1px solid rgba(255, 255, 255, 0.07);
  }
  .hero-cover-col:hover .hero-cover { filter: brightness(1.1) saturate(1.05); }
  .hero-cover-col:hover .cover-resume-hint { opacity: 1; }
  .hero-cover { width: 100%; height: 100%; object-fit: cover; display: block; transition: filter 0.22s ease; }
  .hero-cover-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-overlay);
    color: var(--text-faint);
  }
  .cover-resume-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.38);
    opacity: 0;
    transition: opacity 0.18s ease;
    pointer-events: none;
  }

  .hero-details {
    position: relative;
    z-index: 2;
    flex: 1;
    min-width: 0;
    padding: var(--sp-5) var(--sp-5) var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    overflow: hidden;
    border-right: 1px solid rgba(255, 255, 255, 0.05);
  }

  .hero-tags { display: flex; flex-wrap: wrap; gap: 5px; flex-shrink: 0; }
  .hero-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-ui);
    font-size: 9px;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.13);
  }
  .hero-tag-reading { background: var(--accent-muted); color: var(--accent-fg); border-color: var(--accent-dim); }
  .hero-tag-pinned  { background: rgba(168, 132, 232, 0.18); color: #c4a8f0; border-color: rgba(168, 132, 232, 0.28); }
  .hero-tag-new     { background: rgba(74, 222, 128, 0.15); color: #86efac; border-color: rgba(74, 222, 128, 0.25); }
  .hero-tag-genre   { cursor: pointer; transition: background 0.15s, color 0.15s; }
  .hero-tag-genre:hover { background: rgba(255, 255, 255, 0.18); color: rgba(255, 255, 255, 0.9); }

  .hero-title {
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    color: #fff;
    line-height: var(--leading-tight);
    margin: 0;
    flex-shrink: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
    letter-spacing: -0.01em;
  }
  .hero-author {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: rgba(255, 255, 255, 0.45);
    letter-spacing: var(--tracking-wide);
    flex-shrink: 0;
  }
  .hero-progress {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: rgba(255, 255, 255, 0.55);
    letter-spacing: var(--tracking-wide);
  }
  .hero-prog-page { color: rgba(255, 255, 255, 0.35); }
  .hero-prog-time { margin-left: auto; color: rgba(255, 255, 255, 0.3); }

  .hero-desc {
    font-size: var(--text-xs);
    color: rgba(255, 255, 255, 0.38);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    flex-shrink: 0;
  }
  .hero-empty-title {
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    color: rgba(255, 255, 255, 0.48);
    flex-shrink: 0;
  }
  .hero-empty-sub {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: rgba(255, 255, 255, 0.26);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-snug);
  }

  .hero-actions { display: flex; gap: var(--sp-2); flex-shrink: 0; flex-wrap: wrap; margin-top: var(--sp-1); }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    padding: 7px 18px;
    border-radius: var(--radius-md);
    background: var(--accent-muted);
    border: 1px solid var(--accent-dim);
    color: var(--accent-fg);
    cursor: pointer;
    transition: filter var(--t-base);
    white-space: nowrap;
  }
  .hero-cta:hover:not(:disabled) { filter: brightness(1.18); }
  .hero-cta:disabled { opacity: 0.5; cursor: default; }

  .hero-cta-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    padding: 7px 14px;
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.11);
    color: rgba(255, 255, 255, 0.48);
    cursor: pointer;
    transition: background var(--t-base), color var(--t-base);
    white-space: nowrap;
  }
  .hero-cta-ghost:hover { background: rgba(255, 255, 255, 0.12); color: rgba(255, 255, 255, 0.82); }

  .hero-nav-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    flex-shrink: 0;
    margin-top: auto;
    padding-top: var(--sp-3);
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .hero-nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.11);
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--t-base), color var(--t-base);
  }
  .hero-nav-btn:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
  .hero-dots { display: flex; gap: 5px; align-items: center; }
  .hero-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background var(--t-base), transform var(--t-base), width var(--t-base);
  }
  .hero-dot:hover { background: rgba(255, 255, 255, 0.48); }
  .hero-dot.active { background: #fff; width: 14px; border-radius: 3px; }
  .hero-dot.pinned { background: rgba(168, 132, 232, 0.5); }
  .hero-dot.pinned.active { background: #c4a8f0; }
  .hero-counter {
    font-family: var(--font-ui);
    font-size: 10px;
    color: rgba(255, 255, 255, 0.28);
    letter-spacing: var(--tracking-wide);
    margin-left: auto;
  }

  .hero-chapters {
    position: relative;
    z-index: 2;
    width: clamp(180px, 30%, 232px);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    padding: var(--sp-4) var(--sp-3);
    gap: 1px;
    overflow: hidden;
  }
  .hero-chapters-header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    padding-bottom: var(--sp-2);
    margin-bottom: var(--sp-1);
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    flex-shrink: 0;
  }
  .hero-chapters-empty {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: rgba(255, 255, 255, 0.22);
    letter-spacing: var(--tracking-wide);
    padding: var(--sp-3) 0;
  }

  .chapter-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: 7px var(--sp-2);
    border-radius: var(--radius-sm);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background var(--t-fast);
  }
  .chapter-row:hover { background: rgba(255, 255, 255, 0.07); }
  .chapter-row-current { background: rgba(255, 255, 255, 0.1) !important; }

  .ch-num {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: rgba(255, 255, 255, 0.32);
    letter-spacing: var(--tracking-wide);
    flex-shrink: 0;
    min-width: 36px;
  }
  .chapter-row-current .ch-num { color: var(--accent-fg); }

  .ch-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; min-width: 0; }
  .ch-name {
    font-size: var(--text-xs);
    color: rgba(255, 255, 255, 0.72);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chapter-row-read .ch-name { color: rgba(255, 255, 255, 0.32); }
  .chapter-row-current .ch-name { color: #fff; font-weight: var(--weight-medium); }
  .ch-meta {
    font-family: var(--font-ui);
    font-size: 9px;
    color: rgba(255, 255, 255, 0.26);
    letter-spacing: var(--tracking-wide);
  }
  .ch-read { color: rgba(255, 255, 255, 0.18); }
  :global(.ch-play-icon) { color: var(--accent-fg); flex-shrink: 0; }

  .chapter-row-sk { display: flex; gap: var(--sp-2); padding: 7px var(--sp-2); align-items: center; }
  .sk-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
  .sk { background: rgba(255, 255, 255, 0.06); border-radius: var(--radius-sm); animation: pulse 1.6s ease-in-out infinite; }
  .sk-num { width: 32px; height: 10px; flex-shrink: 0; }
  .sk-name { height: 11px; width: 85%; }
  .sk-meta { height: 9px; width: 50%; }

  .ch-view-all {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: auto;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: rgba(255, 255, 255, 0.28);
    letter-spacing: var(--tracking-wide);
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--sp-2) var(--sp-2) 0;
    transition: color var(--t-base);
  }
  .ch-view-all:hover { color: var(--accent-fg); }

  @keyframes backdropIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes pulse { 0%, 100% { opacity: 0.4 } 50% { opacity: 0.7 } }
</style>