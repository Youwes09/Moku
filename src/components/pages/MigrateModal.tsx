import { useState, useEffect } from "react";
import { X, MagnifyingGlass, CircleNotch, ArrowRight, Check, Warning } from "@phosphor-icons/react";
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
}

export default function MigrateModal({ manga, currentChapters, onClose, onMigrated }: Props) {
  const [step, setStep]               = useState<Step>("source");
  const [sources, setSources]         = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [query, setQuery]             = useState(manga.title);
  const [results, setResults]         = useState<Manga[]>([]);
  const [searching, setSearching]     = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [migrating, setMigrating]     = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    gql<{ sources: { nodes: Source[] } }>(GET_SOURCES)
      .then((d) => setSources(d.sources.nodes.filter((s) => s.id !== "0" && s.id !== manga.source?.id)))
      .catch(console.error)
      .finally(() => setLoadingSources(false));
  }, []);

  async function searchSource() {
    if (!selectedSource || !query.trim()) return;
    setSearching(true);
    setResults([]);
    setError(null);
    try {
      const d = await gql<{ fetchSourceManga: { mangas: Manga[] } }>(FETCH_SOURCE_MANGA, {
        source: selectedSource.id, type: "SEARCH", page: 1, query: query.trim(),
      });
      setResults(d.fetchSourceManga.mangas);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function selectMatch(m: Manga) {
    setLoadingMatch(true);
    setError(null);
    try {
      const d = await gql<{ fetchChapters: { chapters: Chapter[] } }>(FETCH_CHAPTERS, { mangaId: m.id });
      const chapters = d.fetchChapters.chapters;
      const readCount = chapters.filter((c) => {
        const old = currentChapters.find((o) => Math.abs(o.chapterNumber - c.chapterNumber) < 0.01);
        return old?.isRead;
      }).length;
      setSelectedMatch({ manga: m, chapters, readCount });
      setStep("confirm");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMatch(false);
    }
  }

  async function migrate() {
    if (!selectedMatch) return;
    setMigrating(true);
    setError(null);
    try {
      const { manga: newManga, chapters: newChapters } = selectedMatch;

      // Build read/bookmark/progress maps from old chapters keyed by chapterNumber
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
        if ((old.lastPageRead ?? 0) > 0 && !old.isRead) {
          progressUpdates.push({ id: nc.id, lastPageRead: old.lastPageRead! });
        }
      }

      // Migrate read state
      if (toMarkRead.length) {
        await gql(UPDATE_CHAPTERS_PROGRESS, { ids: toMarkRead, isRead: true });
      }
      // Migrate bookmarks
      if (toMarkBookmarked.length) {
        await gql(UPDATE_CHAPTERS_PROGRESS, { ids: toMarkBookmarked, isBookmarked: true });
      }
      // Migrate in-progress pages one by one (different lastPageRead per chapter)
      for (const { id, lastPageRead } of progressUpdates) {
        await gql(UPDATE_CHAPTERS_PROGRESS, { ids: [id], lastPageRead });
      }

      // Add new to library, remove old
      await gql(UPDATE_MANGA, { id: newManga.id, inLibrary: true });
      await gql(UPDATE_MANGA, { id: manga.id, inLibrary: false });

      onMigrated({ ...newManga, inLibrary: true });
    } catch (e: any) {
      setError(e.message);
      setMigrating(false);
    }
  }

  const readCount   = currentChapters.filter((c) => c.isRead).length;
  const totalCount  = currentChapters.length;

  return (
    <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>
        <div className={s.modalHeader}>
          <div className={s.modalTitle}>
            <span className={s.modalTitleLabel}>Migrate source</span>
            <span className={s.modalTitleManga}>{manga.title}</span>
          </div>
          <button className={s.closeBtn} onClick={onClose}>
            <X size={14} weight="light" />
          </button>
        </div>

        {/* ── Step indicators ── */}
        <div className={s.steps}>
          {(["source", "search", "confirm"] as Step[]).map((st, i) => (
            <div key={st} className={[s.step, step === st ? s.stepActive : "", i < ["source","search","confirm"].indexOf(step) ? s.stepDone : ""].join(" ").trim()}>
              <span className={s.stepDot}>{i < ["source","search","confirm"].indexOf(step) ? <Check size={9} weight="bold" /> : i + 1}</span>
              <span className={s.stepLabel}>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
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
                  <button
                    key={src.id}
                    className={[s.sourceRow, selectedSource?.id === src.id ? s.sourceRowActive : ""].join(" ").trim()}
                    onClick={() => { setSelectedSource(src); setStep("search"); searchSource(); }}
                  >
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
              <div className={s.searchRow}>
                <div className={s.searchBar}>
                  <MagnifyingGlass size={13} weight="light" className={s.searchIcon} />
                  <input
                    className={s.searchInput}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchSource()}
                    autoFocus
                  />
                </div>
                <button className={s.searchBtn} onClick={searchSource} disabled={searching}>
                  {searching ? <CircleNotch size={13} weight="light" className="anim-spin" /> : "Search"}
                </button>
                <button className={s.backBtn} onClick={() => { setStep("source"); setResults([]); }}>
                  Back
                </button>
              </div>

              {error && <p className={s.error}><Warning size={13} weight="light" /> {error}</p>}

              <div className={s.results}>
                {searching && Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={s.skResult}>
                    <div className={["skeleton", s.skCover].join(" ")} />
                    <div className={s.skMeta}>
                      <div className={["skeleton", s.skTitle].join(" ")} />
                    </div>
                  </div>
                ))}
                {!searching && results.map((m) => (
                  <button
                    key={m.id}
                    className={s.resultRow}
                    onClick={() => selectMatch(m)}
                    disabled={loadingMatch}
                  >
                    <div className={s.resultCoverWrap}>
                      <img src={thumbUrl(m.thumbnailUrl)} alt={m.title} className={s.resultCover} />
                    </div>
                    <span className={s.resultTitle}>{m.title}</span>
                    {loadingMatch && <CircleNotch size={13} weight="light" className="anim-spin" style={{ color: "var(--text-faint)", marginLeft: "auto" }} />}
                  </button>
                ))}
                {!searching && results.length === 0 && query && (
                  <div className={s.centered}><span className={s.hint}>No results.</span></div>
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
                </div>

                <ArrowRight size={20} weight="light" className={s.confirmArrow} />

                <div className={s.confirmManga}>
                  <div className={s.confirmCoverWrap}>
                    <img src={thumbUrl(selectedMatch.manga.thumbnailUrl)} alt={selectedMatch.manga.title} className={s.confirmCover} />
                  </div>
                  <p className={s.confirmTitle}>{selectedMatch.manga.title}</p>
                  <p className={s.confirmSource}>{selectedSource?.displayName ?? "Unknown"}</p>
                </div>
              </div>

              <div className={s.confirmStats}>
                <div className={s.statRow}>
                  <span className={s.statLabel}>Chapters on new source</span>
                  <span className={s.statVal}>{selectedMatch.chapters.length}</span>
                </div>
                <div className={s.statRow}>
                  <span className={s.statLabel}>Read progress to migrate</span>
                  <span className={s.statVal}>{readCount} / {totalCount} chapters</span>
                </div>
                <div className={s.statRow}>
                  <span className={s.statLabel}>Matched chapters</span>
                  <span className={s.statVal}>{selectedMatch.readCount} will carry over</span>
                </div>
              </div>

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
                    : "Migrate"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}