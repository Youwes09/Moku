<script lang="ts">
  import { X, MagnifyingGlass, CircleNotch, ArrowRight, Check, Warning, Sparkle, Swap } from "phosphor-svelte";
  import { gql }       from "@api/client";
  import Thumbnail     from "@shared/manga/Thumbnail.svelte";
  import { resolvedCover } from "@core/cover/coverResolver";
  import { GET_SOURCES }            from "@api/queries/extensions";
  import { UPDATE_MANGA }           from "@api/mutations/manga";
  import { FETCH_SOURCE_MANGA }     from "@api/mutations/downloads";
  import { FETCH_CHAPTERS, UPDATE_CHAPTERS_PROGRESS } from "@api/mutations/chapters";
  import { store, addToast }        from "@store/state.svelte";
  import type { Manga, Chapter, Source } from "@types";
  import type { LibraryManga }          from "../lib/extensionLibrary";

  interface Props {
    sourceId:      string;
    sourceName:    string;
    sourceIconUrl: string;
    manga:         LibraryManga[];
    onClose:       () => void;
    onDone:        () => void;
  }
  let { sourceId, sourceName, sourceIconUrl, manga, onClose, onDone }: Props = $props();

  type Phase = "pick-target" | "review" | "migrating" | "done";

  interface EntryResult {
    manga:      LibraryManga;
    match:      Manga | null;
    chapters:   Chapter[];
    similarity: number;
    status:     "pending" | "searching" | "found" | "no-match" | "migrated" | "failed";
    error?:     string;
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

  function onKey(e: KeyboardEvent) { if (e.key === "Escape" && phase !== "migrating") onClose(); }

  let phase: Phase              = $state("pick-target");
  let allSources: Source[]      = $state([]);
  let loadingSources            = $state(true);
  let targetSource: Source | null = $state(null);
  let selectedLang              = $state("all");
  let langStripEl: HTMLDivElement | undefined = $state();

  let entries: EntryResult[]    = $state([]);
  let searchProgress            = $state({ done: 0, total: 0 });
  let migrateProgress           = $state({ done: 0, total: 0, failed: 0 });

  const availableLangs = $derived.by(() => {
    const langs = Array.from(new Set<string>(allSources.map(s => s.lang))).sort();
    const en = langs.indexOf("en");
    if (en > 0) { langs.splice(en, 1); langs.unshift("en"); }
    return langs;
  });
  const hasMultipleLangs = $derived(availableLangs.length > 1);
  const visibleSources   = $derived.by(() => {
    if (selectedLang !== "all") return allSources.filter(s => s.lang === selectedLang);
    const map = new Map<string, Source>();
    for (const s of allSources) {
      const existing = map.get(s.name);
      if (!existing || s.lang < existing.lang) map.set(s.name, s);
    }
    return Array.from(map.values());
  });

  const foundCount   = $derived(entries.filter(e => e.status === "found").length);
  const noMatchCount = $derived(entries.filter(e => e.status === "no-match").length);
  const migratedCount = $derived(entries.filter(e => e.status === "migrated").length);
  const failedCount  = $derived(entries.filter(e => e.status === "failed").length);

  $effect(() => {
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then(d => {
        allSources = d.sources.nodes.filter(s => s.id !== "0" && s.id !== sourceId);
        const prefLang = store?.settings?.preferredExtensionLang ?? "";
        const langs    = new Set(allSources.map(s => s.lang));
        if (prefLang && langs.has(prefLang) && langs.size > 1) selectedLang = prefLang;
      })
      .catch(console.error)
      .finally(() => { loadingSources = false; });

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  async function startSearch(target: Source) {
    targetSource = target;
    phase = "review";
    entries = manga.map(m => ({ manga: m, match: null, chapters: [], similarity: 0, status: "pending" }));
    searchProgress = { done: 0, total: manga.length };

    for (let i = 0; i < entries.length; i++) {
      entries[i] = { ...entries[i], status: "searching" };
      try {
        const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
          source: target.id, type: "SEARCH", page: 1, query: entries[i].manga.title,
        });
        const results = d.fetchSourceManga.mangas
          .map(m => ({ manga: m, similarity: titleSimilarity(entries[i].manga.title, m.title) }))
          .sort((a, b) => b.similarity - a.similarity);

        if (results.length > 0 && results[0].similarity > 0.3) {
          entries[i] = { ...entries[i], match: results[0].manga, similarity: results[0].similarity, status: "found" };
        } else {
          entries[i] = { ...entries[i], status: "no-match" };
        }
      } catch (e: any) {
        entries[i] = { ...entries[i], status: "no-match", error: e.message };
      }
      searchProgress = { done: i + 1, total: manga.length };
    }
  }

  function setEntryMatch(idx: number, match: Manga, similarity: number) {
    entries[idx] = { ...entries[idx], match, similarity, status: "found" };
  }

  function excludeEntry(idx: number) {
    entries[idx] = { ...entries[idx], status: "no-match", match: null };
  }

  async function startMigration() {
    const toMigrate = entries.filter(e => e.status === "found" && e.match);
    migrateProgress = { done: 0, total: toMigrate.length, failed: 0 };
    phase = "migrating";

    for (const entry of toMigrate) {
      const idx = entries.indexOf(entry);
      try {
        const d        = await gql<{ fetchChapters: { chapters: Chapter[] } }>(FETCH_CHAPTERS, { mangaId: entry.match!.id });
        const newChaps = d.fetchChapters.chapters;

        const toMarkRead:       number[] = [];
        const toMarkBookmarked: number[] = [];

        for (const nc of newChaps) {
          const oldIdx = entries[idx].manga;
          if (oldIdx) {
            toMarkRead.push(nc.id);
          }
        }

        if (toMarkRead.length)
          await gql(UPDATE_CHAPTERS_PROGRESS, { ids: toMarkRead, isRead: true });

        await gql(UPDATE_MANGA, { id: entry.match!.id,    inLibrary: true  });
        await gql(UPDATE_MANGA, { id: entry.manga.id,     inLibrary: false });

        entries[idx] = { ...entries[idx], status: "migrated" };
        migrateProgress = { ...migrateProgress, done: migrateProgress.done + 1 };
      } catch (e: any) {
        entries[idx] = { ...entries[idx], status: "failed", error: e.message };
        migrateProgress = { ...migrateProgress, done: migrateProgress.done + 1, failed: migrateProgress.failed + 1 };
      }
    }

    phase = "done";
    addToast({
      kind: "success",
      title: "Migration complete",
      body: `${migrateProgress.done - migrateProgress.failed} migrated, ${migrateProgress.failed} failed`,
    });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget && phase !== "migrating") onClose(); }}>
  <div class="modal">

    <div class="modal-header">
      <div class="source-context">
        <div class="source-icon-wrap">
          <Thumbnail src={sourceIconUrl} alt={sourceName} class="src-icon" onerror={(e) => (e.target as HTMLImageElement).style.display = "none"} />
        </div>
        <div class="source-context-info">
          <span class="modal-eyebrow">Source migration</span>
          <span class="modal-title">{sourceName}</span>
          <span class="modal-sub">{manga.length} {manga.length === 1 ? "title" : "titles"} in library</span>
        </div>
      </div>
      {#if phase !== "migrating"}
        <button class="close-btn" onclick={onClose}><X size={14} weight="light" /></button>
      {/if}
    </div>

    <div class="body">

      {#if phase === "pick-target"}
        <div class="phase-label-row">
          <span class="phase-label">Select destination source</span>
        </div>
        {#if loadingSources}
          <div class="centered"><CircleNotch size={16} weight="light" class="anim-spin" style="color:var(--text-faint)" /></div>
        {:else if allSources.length === 0}
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
              <button class="source-row" onclick={() => startSearch(src)}>
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

      {:else if phase === "review" || phase === "migrating" || phase === "done"}
        <div class="review-header">
          <div class="review-route">
            <div class="review-source">
              <div class="source-icon-wrap small">
                <Thumbnail src={sourceIconUrl} alt={sourceName} class="source-icon" onerror={(e) => (e.target as HTMLImageElement).style.display = "none"} />
              </div>
              <span class="review-source-name">{sourceName}</span>
            </div>
            <ArrowRight size={14} weight="light" style="color:var(--text-faint);flex-shrink:0" />
            {#if targetSource}
              <div class="review-source">
                <div class="source-icon-wrap small">
                  <Thumbnail src={targetSource.iconUrl} alt={targetSource.name} class="source-icon" onerror={(e) => (e.target as HTMLImageElement).style.display = "none"} />
                </div>
                <span class="review-source-name">{targetSource.displayName}</span>
              </div>
            {/if}
          </div>

          {#if phase === "review"}
            <div class="review-progress-row">
              <div class="review-progress-bar">
                <div class="review-progress-fill" style="width:{searchProgress.total ? (searchProgress.done / searchProgress.total) * 100 : 0}%"></div>
              </div>
              <span class="review-progress-label">
                {#if searchProgress.done < searchProgress.total}
                  Searching {searchProgress.done + 1} / {searchProgress.total}…
                {:else}
                  {foundCount} found · {noMatchCount} no match
                {/if}
              </span>
            </div>
          {:else if phase === "migrating"}
            <div class="review-progress-row">
              <div class="review-progress-bar">
                <div class="review-progress-fill" style="width:{migrateProgress.total ? (migrateProgress.done / migrateProgress.total) * 100 : 0}%"></div>
              </div>
              <span class="review-progress-label">Migrating {migrateProgress.done} / {migrateProgress.total}…</span>
            </div>
          {:else}
            <div class="done-summary">
              <Check size={13} weight="bold" style="color:var(--color-success)" />
              <span class="done-label">{migratedCount} migrated{failedCount > 0 ? ` · ${failedCount} failed` : ""}</span>
            </div>
          {/if}
        </div>

        <div class="entry-list">
          {#each entries as entry, idx}
            <div class="entry-row" class:entry-migrated={entry.status === "migrated"} class:entry-failed={entry.status === "failed"}>
              <div class="entry-cover-wrap">
                <Thumbnail src={resolvedCover(entry.manga.id, entry.manga.thumbnailUrl)} alt={entry.manga.title} class="entry-cover" />
              </div>

              <div class="entry-info">
                <span class="entry-title">{entry.manga.title}</span>
                {#if entry.status === "found" && entry.match}
                  <span class="entry-match">
                    <Sparkle size={9} weight="fill" style="color:var(--accent-fg);flex-shrink:0" />
                    {entry.match.title}
                    <span class="entry-sim">{Math.round(entry.similarity * 100)}%</span>
                  </span>
                {:else if entry.status === "no-match"}
                  <span class="entry-no-match">No match found</span>
                {:else if entry.status === "searching"}
                  <span class="entry-searching">Searching…</span>
                {:else if entry.status === "migrated"}
                  <span class="entry-done">Migrated</span>
                {:else if entry.status === "failed"}
                  <span class="entry-fail">{entry.error ?? "Failed"}</span>
                {/if}
              </div>

              <div class="entry-status">
                {#if entry.status === "searching"}
                  <CircleNotch size={13} weight="light" class="anim-spin" style="color:var(--text-faint)" />
                {:else if entry.status === "found"}
                  <div class="entry-cover-match">
                    <Thumbnail src={resolvedCover(entry.match!.id, entry.match!.thumbnailUrl)} alt={entry.match!.title} class="entry-match-cover" />
                  </div>
                  {#if phase === "review"}
                    <button class="entry-exclude-btn" onclick={() => excludeEntry(idx)} title="Exclude from migration">
                      <X size={10} weight="bold" />
                    </button>
                  {/if}
                {:else if entry.status === "migrated"}
                  <Check size={13} weight="bold" style="color:var(--color-success)" />
                {:else if entry.status === "failed"}
                  <Warning size={13} weight="light" style="color:var(--color-error)" />
                {/if}
              </div>
            </div>
          {/each}
        </div>

        {#if phase === "review" && searchProgress.done === searchProgress.total}
          <div class="review-actions">
            <button class="back-btn" onclick={() => { phase = "pick-target"; entries = []; }}>Change source</button>
            <button class="migrate-btn" onclick={startMigration} disabled={foundCount === 0}>
              <Swap size={13} weight="bold" />
              Migrate {foundCount} {foundCount === 1 ? "title" : "titles"}
            </button>
          </div>
        {/if}

        {#if phase === "done"}
          <div class="review-actions">
            <button class="migrate-btn" onclick={onDone}><Check size={13} weight="bold" /> Done</button>
          </div>
        {/if}
      {/if}

    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 200; animation: fadeIn 0.1s ease both; }
  .modal { background: var(--bg-base); border: 1px solid var(--border-base); border-radius: var(--radius-xl); width: 560px; max-height: 84vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }

  .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .source-context { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
  .source-icon-wrap { width: 36px; height: 36px; border-radius: var(--radius-md); overflow: hidden; flex-shrink: 0; background: var(--bg-raised); border: 1px solid var(--border-dim); }
  .source-icon-wrap.small { width: 20px; height: 20px; border-radius: var(--radius-sm); }
  :global(.src-icon) { width: 100%; height: 100%; object-fit: cover; }
  :global(.source-icon) { width: 100%; height: 100%; object-fit: cover; }
  .source-context-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .modal-eyebrow { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .modal-title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); }
  .modal-sub { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .close-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-md); color: var(--text-faint); background: none; border: none; cursor: pointer; transition: color var(--t-base), background var(--t-base); flex-shrink: 0; margin-top: 2px; }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .body { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }

  .phase-label-row { padding: var(--sp-3) var(--sp-4) var(--sp-2); flex-shrink: 0; }
  .phase-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-widest); text-transform: uppercase; }
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
  .source-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .source-name { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .source-meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  :global(.source-arrow) { color: var(--text-faint); opacity: 0; transition: opacity var(--t-base); flex-shrink: 0; }
  .source-row:hover :global(.source-arrow) { opacity: 1; }

  .review-header { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
  .review-route { display: flex; align-items: center; gap: var(--sp-2); }
  .review-source { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
  .review-source-name { font-size: var(--text-xs); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: var(--weight-medium); }
  .review-progress-row { display: flex; align-items: center; gap: var(--sp-3); }
  .review-progress-bar { flex: 1; height: 3px; background: var(--bg-overlay); border-radius: var(--radius-full); overflow: hidden; }
  .review-progress-fill { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.3s ease; }
  .review-progress-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; flex-shrink: 0; }
  .done-summary { display: flex; align-items: center; gap: var(--sp-2); }
  .done-label { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary); letter-spacing: var(--tracking-wide); }

  .entry-list { flex: 1; overflow-y: auto; padding: var(--sp-2); display: flex; flex-direction: column; gap: 1px; }
  .entry-row { display: flex; align-items: center; gap: var(--sp-3); padding: 7px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; transition: background var(--t-fast); }
  .entry-row:hover { background: var(--bg-raised); }
  .entry-migrated { opacity: 0.5; }
  .entry-failed { border-color: rgba(180,60,60,0.15); background: rgba(180,60,60,0.04); }
  .entry-cover-wrap { width: 28px; height: 42px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-raised); border: 1px solid var(--border-dim); flex-shrink: 0; }
  :global(.entry-cover) { width: 100%; height: 100%; object-fit: cover; }
  .entry-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow: hidden; }
  .entry-title { font-size: var(--text-sm); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-match { display: flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-sim { background: var(--bg-overlay); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); padding: 0 4px; font-size: 9px; flex-shrink: 0; }
  .entry-no-match { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .entry-searching { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .entry-done { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--color-success); letter-spacing: var(--tracking-wide); }
  .entry-fail { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--color-error); letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-status { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
  .entry-cover-match { width: 24px; height: 36px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-raised); border: 1px solid var(--border-dim); flex-shrink: 0; }
  :global(.entry-match-cover) { width: 100%; height: 100%; object-fit: cover; }
  .entry-exclude-btn { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; transition: color var(--t-base), background var(--t-base); flex-shrink: 0; }
  .entry-exclude-btn:hover { color: var(--color-error); background: var(--bg-raised); }

  .review-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border-dim); flex-shrink: 0; }
  .back-btn { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 6px 10px; border-radius: var(--radius-md); background: none; color: var(--text-muted); border: 1px solid var(--border-dim); cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .back-btn:hover { color: var(--text-secondary); border-color: var(--border-strong); background: var(--bg-raised); }
  .migrate-btn { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 16px; border-radius: var(--radius-md); background: var(--accent-dim); border: 1px solid var(--accent); color: var(--accent-fg); cursor: pointer; transition: background var(--t-base), border-color var(--t-base); }
  .migrate-btn:hover:not(:disabled) { background: var(--accent-muted); border-color: var(--accent-bright); }
  .migrate-btn:disabled { opacity: 0.4; cursor: default; }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>