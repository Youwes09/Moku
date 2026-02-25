import { useState, useEffect, useCallback } from "react";
import { X, MagnifyingGlass, CircleNotch, ArrowRight, Check, Warning, Sparkle } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import { GET_SOURCES, FETCH_SOURCE_MANGA, FETCH_CHAPTERS, UPDATE_MANGA, UPDATE_CHAPTERS_PROGRESS } from "../../lib/queries";
import type { Manga, Source, Chapter } from "../../lib/types";
import s from "./MigrateModal.module.css";

interface Props {
  manga: Manga;
  currentChapters: Chapter[];
  onClose: () => void;
  onMigrated: (newManga: Manga) => void;
}

type Step = "source" | "search" | "confirm";

interface Match {
  manga: Manga;
  chapters: Chapter[];
  readCount: number;
  similarity: number;
}

// Simple title similarity: normalise → word overlap / Jaccard
function titleSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const wordsA = new Set(norm(a));
  const wordsB = new Set(norm(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

export default function MigrateModal({ manga, currentChapters, onClose, onMigrated }: Props) {
  const [step, setStep]                     = useState<Step>("source");
  const [sources, setSources]               = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [query, setQuery]                   = useState(manga.title);
  const [results, setResults]               = useState<{ manga: Manga; similarity: number }[]>([]);
  const [searching, setSearching]           = useState(false);
  const [selectedMatch, setSelectedMatch]   = useState<Match | null>(null);
  const [loadingMatchId, setLoadingMatchId] = useState<number | null>(null);
  const [migrating, setMigrating]           = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => setSources(d.sources.nodes.filter((s) => s.id !== "0" && s.id !== manga.source?.id)))
      .catch(console.error)
      .finally(() => setLoadingSources(false));
  }, []);

  const searchSource = useCallback(async (src: Source, q: string) => {
    if (!src || !q.trim()) return;
    setSearching(true);
    setResults([]);
    setError(null);
    try {
      const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
        source: src.id, type: "SEARCH", page: 1, query: q.trim(),
      });
      const scored = d.fetchSourceManga.mangas.map((m) => ({
        manga: m,
        similarity: titleSimilarity(manga.title, m.title),
      }));
      // Sort by similarity desc so best matches float to top
      scored.sort((a, b) => b.similarity - a.similarity);
      setResults(scored);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }, [manga.title]);

  function pickSource(src: Source) {
    setSelectedSource(src);
    setStep("search");
    // Auto-search immediately with original title
    searchSource(src, query);
  }

  async function selectMatch(m: Manga, similarity: number) {
    setLoadingMatchId(m.id);
    setError(null);
    try {
      const d = await gql<{ fetchChapters: { chapters: Chapter[] } }>(FETCH_CHAPTERS, { mangaId: m.id });
      const chapters = d.fetchChapters.chapters;
      const readCount = chapters.filter((c) => {
        const old = currentChapters.find((o) => Math.abs(o.chapterNumber - c.chapterNumber) < 0.01);
        return old?.isRead;
      }).length;
      setSelectedMatch({ manga: m, chapters, readCount, similarity });
      setStep("confirm");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMatchId(null);
    }
  }

  async function migrate() {
    if (!selectedMatch) return;
    setMigrating(true);
    setError(null);
    try {
      const { manga: newManga, chapters: newChapters } = selectedMatch;
      const oldByNum = new Map(currentChapters.map((c) => [Math.round(c.chapterNumber * 100), c]));

      const toMarkRead: number[] = [];
      const toMarkBookmarked: number[] = [];
      const progressUpdates: { id: number; lastPageRead: number }[] = [];

      for (const nc of newChapters) {
        const key = Math.round(nc.chapterNumber * 100);
        const old = oldByNum.get(key);
        if (!old) continue;
        if (old.isRead) toMarkRead.push(nc.id);
        if (old.isBookmarked) toMarkBookmarked.push(nc.id);
        if ((old.lastPageRead ?? 0) > 0 && !old.isRead)
          progressUpdates.push({ id: nc.id, lastPageRead: old.lastPageRead! });
      }

      if (toMarkRead.length)
        await gql(UPDATE_CHAPTERS_PROGRESS, { ids: toMarkRead, isRead: true });
      if (toMarkBookmarked.length)
        await gql(UPDATE_CHAPTERS_PROGRESS, { ids: toMarkBookmarked, isBookmarked: true });
      for (const { id, lastPageRead } of progressUpdates)
        await gql(UPDATE_CHAPTERS_PROGRESS, { ids: [id], lastPageRead });

      await gql(UPDATE_MANGA, { id: newManga.id, inLibrary: true });
      await gql(UPDATE_MANGA, { id: manga.id, inLibrary: false });

      onMigrated({ ...newManga, inLibrary: true });
    } catch (e: any) {
      setError(e.message);
      setMigrating(false);
    }
  }

  const readCount  = currentChapters.filter((c) => c.isRead).length;
  const totalCount = currentChapters.length;

  const chapterDiff = selectedMatch
    ? selectedMatch.chapters.length - totalCount
    : 0;

  const STEPS: Step[] = ["source", "search", "confirm"];
  const stepIdx = STEPS.indexOf(step);

  return (
    <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>

        {/* ── Header ── */}
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>
            <span className={s.modalTitleLabel}>Migrate source</span>
            <span className={s.modalTitleManga}>{manga.title}</span>
          </div>
          <button className={s.closeBtn} onClick={onClose}><X size={14} weight="light" /></button>
        </div>

        {/* ── Step indicators ── */}
        <div className={s.steps}>
          {STEPS.map((st, i) => (
            <div key={st}
              className={[s.step, step === st ? s.stepActive : "", i < stepIdx ? s.stepDone : ""].join(" ").trim()}>
              <span className={s.stepDot}>
                {i < stepIdx ? <Check size={9} weight="bold" /> : i + 1}
              </span>
              <span className={s.stepLabel}>
                {st === "source" ? "Pick source"
                  : st === "search" ? (selectedSource ? selectedSource.displayName : "Search")
                  : "Confirm"}
              </span>
            </div>
          ))}
        </div>

        <div className={s.body}>

          {/* ── Step 1: Pick source ── */}
          {step === "source" && (
            <div className={s.sourceList}>
              {loadingSources ? (
                <div className={s.centered}>
                  <CircleNotch size={16} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
                </div>
              ) : sources.length === 0 ? (
                <div className={s.centered}><span className={s.hint}>No other sources installed.</span></div>
              ) : (
                sources.map((src) => (
                  <button key={src.id}
                    className={[s.sourceRow, selectedSource?.id === src.id ? s.sourceRowActive : ""].join(" ").trim()}
                    onClick={() => pickSource(src)}>
                    <img src={thumbUrl(src.iconUrl)} alt={src.name} className={s.sourceIcon}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className={s.sourceInfo}>
                      <span className={s.sourceName}>{src.displayName}</span>
                      <span className={s.sourceMeta}>{src.lang.toUpperCase()}{src.isNsfw ? " · NSFW" : ""}</span>
                    </div>
                    <ArrowRight size={13} weight="light" className={s.sourceArrow} />
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── Step 2: Search & pick match ── */}
          {step === "search" && (
            <div className={s.searchStep}>

              {/* Source context pill */}
              {selectedSource && (
                <div className={s.searchContext}>
                  <img src={thumbUrl(selectedSource.iconUrl)} alt="" className={s.searchContextIcon}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <span className={s.searchContextName}>{selectedSource.displayName}</span>
                  <button className={s.searchContextChange} onClick={() => { setStep("source"); setResults([]); }}>
                    Change
                  </button>
                </div>
              )}

              <div className={s.searchRow}>
                <div className={s.searchBar}>
                  <MagnifyingGlass size={13} weight="light" className={s.searchIcon} />
                  <input className={s.searchInput} value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && selectedSource && searchSource(selectedSource, query)}
                    placeholder="Search title…"
                    autoFocus />
                </div>
                <button className={s.searchBtn}
                  onClick={() => selectedSource && searchSource(selectedSource, query)}
                  disabled={searching || !selectedSource}>
                  {searching
                    ? <CircleNotch size={13} weight="light" className="anim-spin" />
                    : <><MagnifyingGlass size={12} weight="bold" /> Search</>}
                </button>
              </div>

              {error && <p className={s.error}><Warning size={13} weight="light" /> {error}</p>}

              <div className={s.results}>
                {searching && Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={s.skResult}>
                    <div className={["skeleton", s.skCover].join(" ")} />
                    <div className={s.skMeta}>
                      <div className={["skeleton", s.skTitle].join(" ")} />
                      <div className={["skeleton", s.skTitle].join(" ")} style={{ width: "40%" }} />
                    </div>
                  </div>
                ))}
                {!searching && results.map(({ manga: m, similarity }, idx) => (
                  <button key={m.id} className={s.resultRow}
                    onClick={() => selectMatch(m, similarity)}
                    disabled={loadingMatchId !== null}>
                    <div className={s.resultCoverWrap}>
                      <img src={thumbUrl(m.thumbnailUrl)} alt={m.title} className={s.resultCover} />
                    </div>
                    <div className={s.resultInfo}>
                      <span className={s.resultTitle}>{m.title}</span>
                      <div className={s.resultMeta}>
                        {idx === 0 && similarity > 0.5 && (
                          <span className={s.bestMatchBadge}>
                            <Sparkle size={9} weight="fill" /> Best match
                          </span>
                        )}
                        <span className={s.simBar}>
                          <span className={s.simFill} style={{ width: `${Math.round(similarity * 100)}%` }} />
                        </span>
                        <span className={s.simLabel}>{Math.round(similarity * 100)}% match</span>
                      </div>
                    </div>
                    {loadingMatchId === m.id
                      ? <CircleNotch size={13} weight="light" className="anim-spin" style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                      : <ArrowRight size={13} weight="light" style={{ color: "var(--text-faint)", flexShrink: 0, opacity: 0.5 }} />}
                  </button>
                ))}
                {!searching && results.length === 0 && !error && (
                  <div className={s.centered}>
                    <span className={s.hint}>{query ? "No results — try a different title." : "Enter a title to search."}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === "confirm" && selectedMatch && (
            <div className={s.confirmStep}>
              <div className={s.confirmRow}>
                <div className={s.confirmManga}>
                  <div className={s.confirmCoverWrap}>
                    <img src={thumbUrl(manga.thumbnailUrl)} alt={manga.title} className={s.confirmCover} />
                  </div>
                  <p className={s.confirmTitle}>{manga.title}</p>
                  <p className={s.confirmSource}>{manga.source?.displayName ?? "Unknown"}</p>
                  <span className={s.confirmTag}>Current</span>
                </div>

                <div className={s.confirmDivider}>
                  <ArrowRight size={16} weight="light" className={s.confirmArrow} />
                </div>

                <div className={s.confirmManga}>
                  <div className={s.confirmCoverWrap}>
                    <img src={thumbUrl(selectedMatch.manga.thumbnailUrl)} alt={selectedMatch.manga.title} className={s.confirmCover} />
                  </div>
                  <p className={s.confirmTitle}>{selectedMatch.manga.title}</p>
                  <p className={s.confirmSource}>{selectedSource?.displayName ?? "Unknown"}</p>
                  <span className={[s.confirmTag, s.confirmTagNew].join(" ")}>New</span>
                </div>
              </div>

              <div className={s.confirmStats}>
                <div className={s.statRow}>
                  <span className={s.statLabel}>Title match</span>
                  <span className={[s.statVal, selectedMatch.similarity > 0.7 ? s.statGood : selectedMatch.similarity > 0.4 ? s.statWarn : s.statBad].join(" ")}>
                    {Math.round(selectedMatch.similarity * 100)}%
                  </span>
                </div>
                <div className={s.statRow}>
                  <span className={s.statLabel}>Chapters on new source</span>
                  <span className={[s.statVal, chapterDiff < -5 ? s.statWarn : ""].join(" ").trim()}>
                    {selectedMatch.chapters.length}
                    {chapterDiff !== 0 && (
                      <span className={s.chapterDiff}>{chapterDiff > 0 ? `+${chapterDiff}` : chapterDiff} vs current</span>
                    )}
                  </span>
                </div>
                <div className={s.statRow}>
                  <span className={s.statLabel}>Read progress to carry over</span>
                  <span className={s.statVal}>{selectedMatch.readCount} / {readCount} chapters</span>
                </div>
              </div>

              {chapterDiff < -5 && (
                <div className={s.warnBox}>
                  <Warning size={13} weight="light" />
                  New source has {Math.abs(chapterDiff)} fewer chapters — some content may be missing.
                </div>
              )}

              <p className={s.confirmNote}>
                The current entry will be removed from your library. Downloads are not transferred.
              </p>

              {error && <p className={s.error}><Warning size={13} weight="light" /> {error}</p>}

              <div className={s.confirmActions}>
                <button className={s.backBtn} onClick={() => setStep("search")} disabled={migrating}>
                  Back
                </button>
                <button className={s.migrateBtn} onClick={migrate} disabled={migrating}>
                  {migrating
                    ? <><CircleNotch size={13} weight="light" className="anim-spin" /> Migrating…</>
                    : <><Check size={13} weight="bold" /> Migrate</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}