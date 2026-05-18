<script lang="ts">
  import { X, MagnifyingGlass, CircleNotch, ArrowRight, Check, Warning, Sparkle } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { gql }     from "@api/client";
  import Thumbnail   from "@shared/manga/Thumbnail.svelte";
  import { resolvedCover } from "@core/cover/coverResolver";
  import { GET_SOURCES }           from "@api/queries/extensions";
  import { UPDATE_MANGA }          from "@api/mutations/manga";
  import { FETCH_SOURCE_MANGA }    from "@api/mutations/downloads";
  import { FETCH_CHAPTERS, UPDATE_CHAPTERS_PROGRESS } from "@api/mutations/chapters";
  import { store }              from "@store/state.svelte";
  import type { Manga, Chapter, Source } from "@types";

  interface Props {
    manga:           Manga;
    currentChapters: Chapter[];
    onClose:         () => void;
    onMigrated:      (newManga: Manga) => void;
  }
  let { manga, currentChapters, onClose, onMigrated }: Props = $props();

  type Step = "source" | "search" | "confirm";
  const STEPS = ["source", "search", "confirm"] as const satisfies Step[];

  interface Match {
    manga:      Manga;
    chapters:   Chapter[];
    readCount:  number;
    similarity: number;
  }

  function titleSimilarity(a: string, b: string): number {
    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
    const wordsA = new Set(norm(a));
    const wordsB = new Set(norm(b));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    return intersection / new Set([...wordsA, ...wordsB]).size;
  }

  function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }

  let step: Step                    = $state("source");
  let sources: Source[]             = $state([]);
  let loadingSources                = $state(true);
  let selectedSource: Source | null = $state(null);
  let selectedLang                  = $state("all");
  let langStripEl: HTMLDivElement | undefined = $state();

  const stepIdx        = $derived(STEPS.indexOf(step));
  const availableLangs = $derived.by(() => {
    const langs = Array.from(new Set<string>(sources.map(s => s.lang))).sort();
    const en = langs.indexOf("en");
    if (en > 0) { langs.splice(en, 1); langs.unshift("en"); }
    return langs;
  });
  const hasMultipleLangs = $derived(availableLangs.length > 1);
  const visibleSources   = $derived.by(() => {
    if (selectedLang !== "all") return sources.filter(s => s.lang === selectedLang);
    const map = new Map<string, Source>();
    for (const s of sources) {
      const existing = map.get(s.name);
      if (!existing || s.lang < existing.lang) map.set(s.name, s);
    }
    return Array.from(map.values());
  });

  let query          = $state(untrack(() => manga.title));
  let results: { manga: Manga; similarity: number }[] = $state([]);
  let searching      = $state(false);
  let selectedMatch: Match | null = $state(null);
  let loadingMatchId: number | null = $state(null);
  let migrating      = $state(false);
  let error: string | null = $state(null);

  const readCount   = $derived(currentChapters.filter(c => c.isRead).length);
  const totalCount  = $derived(currentChapters.length);
  const chapterDiff = $derived(selectedMatch ? selectedMatch.chapters.length - totalCount : 0);

  function scrollLangStrip(dir: -1 | 1) {
    if (!langStripEl) return;
    const chips   = Array.from(langStripEl.children) as HTMLElement[];
    const viewEnd = langStripEl.scrollLeft + langStripEl.clientWidth;
    if (dir === 1) {
      const next = chips.find(c => c.offsetLeft + c.offsetWidth > viewEnd + 2);
      if (next) langStripEl.scrollTo({ left: next.offsetLeft, behavior: "smooth" });
    } else {
      const prev = [...chips].reverse().find(c => c.offsetLeft < langStripEl!.scrollLeft - 2);
      if (prev) langStripEl.scrollTo({ left: prev.offsetLeft + prev.offsetWidth - langStripEl.clientWidth, behavior: "smooth" });
    }
  }

  $effect(() => {
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then(d => {
        const filtered = d.sources.nodes.filter(s => s.id !== "0" && s.id !== manga.source?.id);
        sources = filtered;
        const prefLang = store?.settings?.preferredExtensionLang ?? "";
        const langs    = new Set(filtered.map(s => s.lang));
        if (prefLang && langs.has(prefLang) && langs.size > 1) selectedLang = prefLang;
      })
      .catch(console.error)
      .finally(() => { loadingSources = false; });

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function searchSource(src: Source, q: string) {
    if (!src || !q.trim()) return;
    searching = true; results = []; error = null;
    try {
      const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
        source: src.id, type: "SEARCH", page: 1, query: q.trim(),
      });
      results = d.fetchSourceManga.mangas
        .map(m => ({ manga: m, similarity: titleSimilarity(manga.title, m.title) }))
        .sort((a, b) => b.similarity - a.similarity);
    } catch (e: any) {
      error = e.message;
    } finally {
      searching = false;
    }
  }

  function pickSource(src: Source) {
    selectedSource = src;
    step = "search";
    searchSource(src, query);
  }

  async function selectMatch(m: Manga, similarity: number) {
    loadingMatchId = m.id; error = null;
    try {
      const d        = await gql<{ fetchChapters: { chapters: Chapter[] } }>(FETCH_CHAPTERS, { mangaId: m.id });
      const chapters = d.fetchChapters.chapters;
      const matchReadCount = chapters.filter(c => {
        const old = currentChapters.find(o => Math.abs(o.chapterNumber - c.chapterNumber) < 0.01);
        return old?.isRead;
      }).length;
      selectedMatch = { manga: m, chapters, readCount: matchReadCount, similarity };
      step = "confirm";
    } catch (e: any) {
      error = e.message;
    } finally {
      loadingMatchId = null;
    }
  }

  async function migrate() {
    if (!selectedMatch) return;
    migrating = true; error = null;
    try {
      const { manga: newManga, chapters: newChapters } = selectedMatch;
      const oldByNum = new Map(currentChapters.map(c => [Math.round(c.chapterNumber * 100), c]));

      const toMarkRead:       number[]                               = [];
      const toMarkBookmarked: number[]                               = [];
      const progressUpdates:  { id: number; lastPageRead: number }[] = [];

      for (const nc of newChapters) {
        const old = oldByNum.get(Math.round(nc.chapterNumber * 100));
        if (!old) continue;
        if (old.isRead)       toMarkRead.push(nc.id);
        if (old.isBookmarked) toMarkBookmarked.push(nc.id);
        if ((old.lastPageRead ?? 0) > 0 && !old.isRead)
          progressUpdates.push({ id: nc.id, lastPageRead: old.lastPageRead! });
      }

      if (toMarkRead.length)       await gql(UPDATE_CHAPTERS_PROGRESS, { ids: toMarkRead,       isRead:       true });
      if (toMarkBookmarked.length) await gql(UPDATE_CHAPTERS_PROGRESS, { ids: toMarkBookmarked, isBookmarked: true });
      for (const { id, lastPageRead } of progressUpdates)
        await gql(UPDATE_CHAPTERS_PROGRESS, { ids: [id], lastPageRead });

      await gql(UPDATE_MANGA, { id: newManga.id, inLibrary: true  });
      await gql(UPDATE_MANGA, { id: manga.id,    inLibrary: false });

      onMigrated({ ...newManga, inLibrary: true });
    } catch (e: any) {
      error = e.message;
      migrating = false;
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="modal">

    <div class="modal-header">
      <div class="manga-context">
        <div class="manga-context-cover">
          <Thumbnail src={resolvedCover(manga.id, manga.thumbnailUrl)} alt={manga.title} class="ctx-cover" />
        </div>
        <div class="manga-context-info">
          <span class="modal-eyebrow">Migrate source</span>
          <span class="modal-title">{manga.title}</span>
          {#if manga.source?.displayName}
            <span class="modal-source">{manga.source.displayName}</span>
          {/if}
        </div>
      </div>
      <button class="close-btn" onclick={onClose}><X size={14} weight="light" /></button>
    </div>

    <div class="steps">
      {#each STEPS as st, i}
        <div class="step" class:step-active={step === st} class:step-done={i < stepIdx}>
          <span class="step-dot">
            {#if i < stepIdx}<Check size={9} weight="bold" />{:else}{i + 1}{/if}
          </span>
          <span class="step-label">
            {st === "source" ? "Pick source" : st === "search" ? (selectedSource?.displayName ?? "Search") : "Confirm"}
          </span>
        </div>
      {/each}
    </div>

    <div class="body">

      {#if step === "source"}
        {#if loadingSources}
          <div class="centered">
            <CircleNotch size={16} weight="light" class="anim-spin" style="color:var(--text-faint)" />
          </div>
        {:else if sources.length === 0}
          <div class="centered"><span class="hint">No other sources installed.</span></div>
        {:else}
          {#if hasMultipleLangs}
            <div class="src-lang-bar">
              <button class="src-lang-nav" onclick={() => scrollLangStrip(-1)}>‹</button>
              <div class="src-lang-chips" bind:this={langStripEl}>
                <button class="src-lang-chip" class:src-lang-chip-active={selectedLang === "all"} onclick={() => selectedLang = "all"}>All</button>
                {#each availableLangs as lang}
                  <button class="src-lang-chip" class:src-lang-chip-active={selectedLang === lang} onclick={() => selectedLang = lang}>
                    {lang.toUpperCase()}
                  </button>
                {/each}
              </div>
              <button class="src-lang-nav" onclick={() => scrollLangStrip(1)}>›</button>
            </div>
          {/if}
          <div class="source-list">
            {#each visibleSources as src}
              <button class="source-row" class:source-row-active={selectedSource?.id === src.id} onclick={() => pickSource(src)}>
                <div class="source-icon-wrap">
                  <Thumbnail src={src.iconUrl} alt={src.name} class="source-icon" onerror={(e) => (e.target as HTMLImageElement).style.display = "none"} />
                </div>
                <div class="source-info">
                  <span class="source-name">{src.displayName}</span>
                  <span class="source-meta">{src.lang.toUpperCase()}{src.isNsfw ? " · NSFW" : ""}</span>
                </div>
                <ArrowRight size={13} weight="light" class="source-arrow" />
              </button>
            {/each}
          </div>
        {/if}

      {:else if step === "search"}
        <div class="search-step">
          {#if selectedSource}
            <div class="search-context">
              <div class="source-icon-wrap" style="width:20px;height:20px;border-radius:var(--radius-sm)">
                <Thumbnail src={selectedSource.iconUrl} alt={selectedSource.name} class="search-context-icon" onerror={(e) => (e.target as HTMLImageElement).style.display = "none"} />
              </div>
              <span class="search-context-name">{selectedSource.displayName}</span>
              <button class="search-context-change" onclick={() => { step = "source"; results = []; }}>Change</button>
            </div>
          {/if}

          <div class="search-row">
            <div class="search-bar">
              <MagnifyingGlass size={13} weight="light" class="search-icon" />
              <input
                class="search-input"
                bind:value={query}
                onkeydown={(e) => e.key === "Enter" && selectedSource && searchSource(selectedSource, query)}
                placeholder="Search title…"
                autofocus />
            </div>
            <button class="search-btn"
              onclick={() => selectedSource && searchSource(selectedSource, query)}
              disabled={searching || !selectedSource}>
              {#if searching}
                <CircleNotch size={13} weight="light" class="anim-spin" />
              {:else}
                <MagnifyingGlass size={12} weight="bold" /> Search
              {/if}
            </button>
          </div>

          {#if error}<p class="error"><Warning size={13} weight="light" /> {error}</p>{/if}

          <div class="results">
            {#if searching}
              {#each Array(5) as _}
                <div class="sk-result">
                  <div class="skeleton sk-cover"></div>
                  <div class="sk-meta">
                    <div class="skeleton sk-line" style="width:60%"></div>
                    <div class="skeleton sk-line" style="width:35%"></div>
                  </div>
                </div>
              {/each}
            {:else}
              {#each results as { manga: m, similarity }, idx}
                <button class="result-row" onclick={() => selectMatch(m, similarity)} disabled={loadingMatchId !== null}>
                  <div class="result-cover-wrap">
                    <Thumbnail src={resolvedCover(m.id, m.thumbnailUrl)} alt={m.title} class="result-cover" />
                  </div>
                  <div class="result-info">
                    <span class="result-title">{m.title}</span>
                    <div class="result-meta">
                      {#if idx === 0 && similarity > 0.5}
                        <span class="best-match-badge"><Sparkle size={9} weight="fill" /> Best match</span>
                      {/if}
                      <span class="sim-bar"><span class="sim-fill" style="width:{Math.round(similarity * 100)}%"></span></span>
                      <span class="sim-label">{Math.round(similarity * 100)}%</span>
                    </div>
                  </div>
                  {#if loadingMatchId === m.id}
                    <CircleNotch size={13} weight="light" class="anim-spin" style="color:var(--text-faint);flex-shrink:0" />
                  {:else}
                    <ArrowRight size={13} weight="light" style="color:var(--text-faint);flex-shrink:0;opacity:0.4" />
                  {/if}
                </button>
              {/each}
              {#if results.length === 0 && !error && !searching}
                <div class="centered">
                  <span class="hint">{query ? "No results — try a different title." : "Enter a title to search."}</span>
                </div>
              {/if}
            {/if}
          </div>
        </div>

      {:else if step === "confirm" && selectedMatch}
        <div class="confirm-step">
          <div class="confirm-row">
            <div class="confirm-manga">
              <div class="confirm-cover-wrap">
                <Thumbnail src={resolvedCover(manga.id, manga.thumbnailUrl)} alt={manga.title} class="confirm-cover" />
              </div>
              <p class="confirm-title">{manga.title}</p>
              <p class="confirm-source">{manga.source?.displayName ?? "Unknown"}</p>
              <span class="confirm-tag">Current</span>
            </div>
            <div class="confirm-arrow-wrap">
              <ArrowRight size={18} weight="light" style="color:var(--text-faint)" />
            </div>
            <div class="confirm-manga">
              <div class="confirm-cover-wrap">
                <Thumbnail src={resolvedCover(selectedMatch.manga.id, selectedMatch.manga.thumbnailUrl)} alt={selectedMatch.manga.title} class="confirm-cover" />
              </div>
              <p class="confirm-title">{selectedMatch.manga.title}</p>
              <p class="confirm-source">{selectedSource?.displayName ?? "Unknown"}</p>
              <span class="confirm-tag confirm-tag-new">New</span>
            </div>
          </div>

          <div class="confirm-stats">
            <div class="stat-row">
              <span class="stat-label">Title match</span>
              <span class="stat-val"
                class:stat-good={selectedMatch.similarity > 0.7}
                class:stat-warn={selectedMatch.similarity > 0.4 && selectedMatch.similarity <= 0.7}
                class:stat-bad={selectedMatch.similarity <= 0.4}>
                {Math.round(selectedMatch.similarity * 100)}%
              </span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Chapters on new source</span>
              <span class="stat-val" class:stat-warn={chapterDiff < -5}>
                {selectedMatch.chapters.length}
                {#if chapterDiff !== 0}
                  <span class="chapter-diff">{chapterDiff > 0 ? `+${chapterDiff}` : chapterDiff} vs current</span>
                {/if}
              </span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Read progress to carry</span>
              <span class="stat-val">{selectedMatch.readCount} / {readCount}</span>
            </div>
          </div>

          {#if chapterDiff < -5}
            <div class="warn-box">
              <Warning size={13} weight="light" />
              New source has {Math.abs(chapterDiff)} fewer chapters — some content may be missing.
            </div>
          {/if}

          <p class="confirm-note">The current entry will be removed from your library. Downloads are not transferred.</p>

          {#if error}<p class="error"><Warning size={13} weight="light" /> {error}</p>{/if}

          <div class="confirm-actions">
            <button class="back-btn" onclick={() => step = "search"} disabled={migrating}>Back</button>
            <button class="migrate-btn" onclick={migrate} disabled={migrating}>
              {#if migrating}
                <CircleNotch size={13} weight="light" class="anim-spin" /> Migrating…
              {:else}
                <Check size={13} weight="bold" /> Migrate
              {/if}
            </button>
          </div>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 200; animation: fadeIn 0.1s ease both; }
  .modal { background: var(--bg-base); border: 1px solid var(--border-base); border-radius: var(--radius-xl); width: 520px; max-height: 82vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }

  .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .manga-context { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
  .manga-context-cover { width: 36px; height: 54px; border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; background: var(--bg-raised); border: 1px solid var(--border-dim); }
  :global(.ctx-cover) { width: 100%; height: 100%; object-fit: cover; }
  .manga-context-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .modal-eyebrow { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .modal-title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .modal-source { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .close-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-md); color: var(--text-faint); background: none; border: none; cursor: pointer; transition: color var(--t-base), background var(--t-base); flex-shrink: 0; margin-top: 2px; }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .steps { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-3) var(--sp-5); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .step { display: flex; align-items: center; gap: var(--sp-2); opacity: 0.35; transition: opacity var(--t-base); }
  .step + .step::before { content: "›"; color: var(--text-faint); margin-right: var(--sp-1); font-size: var(--text-sm); opacity: 0.5; }
  .step-active { opacity: 1; }
  .step-done   { opacity: 0.55; }
  .step-dot { width: 18px; height: 18px; border-radius: 50%; background: var(--bg-raised); border: 1px solid var(--border-base); display: flex; align-items: center; justify-content: center; font-family: var(--font-ui); font-size: 10px; color: var(--text-faint); flex-shrink: 0; }
  .step-active .step-dot { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
  .step-label { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-muted); }
  .step-active .step-label { color: var(--text-secondary); }

  .body { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
  .centered { flex: 1; display: flex; align-items: center; justify-content: center; padding: var(--sp-8); }
  .hint { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .src-lang-bar { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-2); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .src-lang-nav { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); font-size: 15px; line-height: 1; cursor: pointer; transition: color var(--t-base), background var(--t-base); }
  .src-lang-nav:hover { color: var(--text-muted); background: var(--bg-raised); }
  .src-lang-chips { display: flex; align-items: center; gap: var(--sp-1); flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .src-lang-chips::-webkit-scrollbar { display: none; }
  .src-lang-chip { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .src-lang-chip:hover { color: var(--text-muted); background: var(--bg-raised); }
  .src-lang-chip-active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .source-list { flex: 1; overflow-y: auto; padding: var(--sp-2); display: flex; flex-direction: column; gap: 1px; }
  .source-row { display: flex; align-items: center; gap: var(--sp-3); padding: 8px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; background: none; text-align: left; width: 100%; cursor: pointer; transition: background var(--t-fast), border-color var(--t-fast); }
  .source-row:hover { background: var(--bg-raised); border-color: var(--border-dim); }
  .source-row-active { background: var(--accent-muted); border-color: var(--accent-dim); }
  .source-icon-wrap { width: 28px; height: 28px; border-radius: var(--radius-md); overflow: hidden; flex-shrink: 0; background: var(--bg-raised); }
  :global(.source-icon) { width: 100%; height: 100%; object-fit: cover; }
  .source-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .source-name { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .source-meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  :global(.source-arrow) { color: var(--text-faint); opacity: 0; transition: opacity var(--t-base); flex-shrink: 0; }
  .source-row:hover :global(.source-arrow) { opacity: 1; }

  .search-step { flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); }
  .search-context { display: flex; align-items: center; gap: var(--sp-2); padding: 6px var(--sp-3); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); flex-shrink: 0; }
  :global(.search-context-icon) { width: 100%; height: 100%; object-fit: cover; }
  .search-context-name { flex: 1; font-size: var(--text-sm); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .search-context-change { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--accent-fg); background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; opacity: 0.8; transition: opacity var(--t-base); }
  .search-context-change:hover { opacity: 1; }
  .search-row { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
  .search-bar { flex: 1; display: flex; align-items: center; gap: var(--sp-2); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 0 var(--sp-3) 0 var(--sp-2); transition: border-color var(--t-base); }
  .search-bar:focus-within { border-color: var(--border-strong); }
  :global(.search-icon) { color: var(--text-faint); flex-shrink: 0; }
  .search-input { flex: 1; background: none; border: none; outline: none; color: var(--text-primary); font-size: var(--text-sm); padding: 7px 0; }
  .search-input::placeholder { color: var(--text-faint); }
  .search-btn { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 6px 12px; border-radius: var(--radius-md); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); cursor: pointer; flex-shrink: 0; display: flex; align-items: center; gap: var(--sp-1); transition: filter var(--t-base); }
  .search-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .search-btn:disabled { opacity: 0.4; cursor: default; }

  .results { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
  .result-row { display: flex; align-items: center; gap: var(--sp-3); padding: 6px var(--sp-2); border-radius: var(--radius-md); border: none; background: none; text-align: left; width: 100%; cursor: pointer; transition: background var(--t-fast); }
  .result-row:hover:not(:disabled) { background: var(--bg-raised); }
  .result-row:disabled { opacity: 0.5; cursor: default; }
  .result-cover-wrap { width: 36px; height: 54px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-raised); border: 1px solid var(--border-dim); flex-shrink: 0; }
  :global(.result-cover) { width: 100%; height: 100%; object-fit: cover; }
  .result-info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; min-width: 0; }
  .result-title { font-size: var(--text-sm); color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-meta { display: flex; align-items: center; gap: var(--sp-2); }
  .best-match-badge { display: inline-flex; align-items: center; gap: 3px; font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--accent-fg); background: var(--accent-muted); border: 1px solid var(--accent-dim); padding: 1px 5px; border-radius: var(--radius-sm); flex-shrink: 0; }
  .sim-bar { width: 40px; height: 3px; background: var(--bg-overlay); border-radius: var(--radius-full); overflow: hidden; flex-shrink: 0; }
  .sim-fill { display: block; height: 100%; background: var(--accent); border-radius: var(--radius-full); }
  .sim-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; }

  .sk-result { display: flex; align-items: center; gap: var(--sp-3); padding: 6px var(--sp-2); }
  .sk-cover  { width: 36px; height: 54px; border-radius: var(--radius-sm); flex-shrink: 0; }
  .sk-meta   { flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); }
  .sk-line   { height: 12px; border-radius: var(--radius-sm); }

  .confirm-step { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-4); padding: var(--sp-4) var(--sp-5); }
  .confirm-row { display: flex; align-items: flex-start; justify-content: center; gap: var(--sp-3); }
  .confirm-manga { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); flex: 1; max-width: 150px; }
  .confirm-cover-wrap { width: 100%; aspect-ratio: 2/3; border-radius: var(--radius-md); overflow: hidden; background: var(--bg-raised); border: 1px solid var(--border-dim); }
  :global(.confirm-cover) { width: 100%; height: 100%; object-fit: cover; }
  .confirm-title { font-size: var(--text-xs); color: var(--text-secondary); text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: var(--leading-snug); }
  .confirm-source { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); text-align: center; }
  .confirm-tag { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; padding: 2px 7px; border-radius: var(--radius-full); background: var(--bg-raised); border: 1px solid var(--border-dim); color: var(--text-faint); }
  .confirm-tag-new { background: var(--accent-muted); border-color: var(--accent-dim); color: var(--accent-fg); }
  .confirm-arrow-wrap { display: flex; align-items: center; padding-top: 48px; flex-shrink: 0; }

  .confirm-stats { display: flex; flex-direction: column; gap: var(--sp-2); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: var(--sp-3) var(--sp-4); }
  .stat-row { display: flex; justify-content: space-between; align-items: center; }
  .stat-label { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); }
  .stat-val { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary); letter-spacing: var(--tracking-wide); }
  .stat-good { color: var(--color-success) !important; }
  .stat-warn { color: #d97706 !important; }
  .stat-bad  { color: var(--color-error)   !important; }
  .chapter-diff { font-family: var(--font-ui); font-size: var(--text-2xs); color: #d97706; letter-spacing: var(--tracking-wide); margin-left: var(--sp-2); }

  .warn-box { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: rgba(217,119,6,0.08); border: 1px solid rgba(217,119,6,0.25); border-radius: var(--radius-md); font-size: var(--text-xs); color: #d97706; line-height: var(--leading-snug); flex-shrink: 0; }
  .confirm-note { font-size: var(--text-xs); color: var(--text-faint); line-height: var(--leading-base); }
  .confirm-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); flex-shrink: 0; margin-top: auto; }
  .back-btn { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 6px 10px; border-radius: var(--radius-md); background: none; color: var(--text-muted); border: 1px solid var(--border-dim); cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .back-btn:hover:not(:disabled) { color: var(--text-secondary); border-color: var(--border-strong); background: var(--bg-raised); }
  .back-btn:disabled { opacity: 0.4; cursor: default; }
  .migrate-btn { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 16px; border-radius: var(--radius-md); background: var(--accent-dim); border: 1px solid var(--accent); color: var(--accent-fg); cursor: pointer; transition: background var(--t-base), border-color var(--t-base); }
  .migrate-btn:hover:not(:disabled) { background: var(--accent-muted); border-color: var(--accent-bright); }
  .migrate-btn:disabled { opacity: 0.5; cursor: default; }

  .error { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--text-xs); color: var(--color-error); padding: var(--sp-2) var(--sp-3); background: rgba(180,60,60,0.08); border-radius: var(--radius-md); border: 1px solid rgba(180,60,60,0.2); flex-shrink: 0; }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>