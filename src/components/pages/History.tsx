import { useMemo, useState } from "react";
import { ClockCounterClockwise, Trash, MagnifyingGlass, Play, Books } from "@phosphor-icons/react";
import { thumbUrl } from "../../lib/client";
import { useStore, type HistoryEntry } from "../../store";
import s from "./History.module.css";

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayLabel(ts: number): string {
  const d   = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ── Session grouping ──────────────────────────────────────────────────────────
// Consecutive entries for the same manga within SESSION_GAP_MS are collapsed
// into one session card showing the chapter range read.

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min

export interface ReadingSession {
  mangaId:           number;
  mangaTitle:        string;
  thumbnailUrl:      string;
  latestChapterId:   number;
  latestChapterName: string;
  latestPageNumber:  number;
  firstChapterName:  string;
  chapterCount:      number;
  readAt:            number;
}

function buildSessions(entries: HistoryEntry[]): ReadingSession[] {
  if (!entries.length) return [];
  const sessions: ReadingSession[] = [];
  let i = 0;
  while (i < entries.length) {
    const anchor = entries[i];
    const group: HistoryEntry[] = [anchor];
    let j = i + 1;
    while (j < entries.length) {
      const next = entries[j];
      if (next.mangaId === anchor.mangaId && anchor.readAt - next.readAt <= SESSION_GAP_MS) {
        group.push(next);
        j++;
      } else {
        break;
      }
    }
    const latest = group[0];
    const oldest = group[group.length - 1];
    sessions.push({
      mangaId:           latest.mangaId,
      mangaTitle:        latest.mangaTitle,
      thumbnailUrl:      latest.thumbnailUrl,
      latestChapterId:   latest.chapterId,
      latestChapterName: latest.chapterName,
      latestPageNumber:  latest.pageNumber,
      firstChapterName:  oldest.chapterName,
      chapterCount:      group.length,
      readAt:            latest.readAt,
    });
    i = j;
  }
  return sessions;
}

function groupSessionsByDay(sessions: ReadingSession[]): { label: string; items: ReadingSession[] }[] {
  const groups = new Map<string, ReadingSession[]>();
  for (const sess of sessions) {
    const label = dayLabel(sess.readAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(sess);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function History() {
  const history        = useStore((s) => s.history);
  const clearHistory   = useStore((s) => s.clearHistory);
  const setActiveManga = useStore((s) => s.setActiveManga);
  const setNavPage     = useStore((s) => s.setNavPage);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (e) => e.mangaTitle.toLowerCase().includes(q) || e.chapterName.toLowerCase().includes(q)
    );
  }, [history, search]);

  const sessions = useMemo(() => buildSessions(filtered), [filtered]);
  const groups   = useMemo(() => groupSessionsByDay(sessions), [sessions]);

  function resumeReading(session: ReadingSession) {
    setActiveManga({ id: session.mangaId, title: session.mangaTitle, thumbnailUrl: session.thumbnailUrl } as any);
    setNavPage("library");
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h1 className={s.heading}>History</h1>
        <div className={s.headerRight}>
          <div className={s.searchWrap}>
            <MagnifyingGlass size={12} className={s.searchIcon} weight="light" />
            <input className={s.search} placeholder="Search history…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && (
              <button className={s.searchClear} onClick={() => setSearch("")} title="Clear">×</button>
            )}
          </div>
          {history.length > 0 && (
            <button className={s.clearBtn} onClick={clearHistory} title="Clear all history">
              <Trash size={14} weight="light" />
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className={s.empty}>
          <ClockCounterClockwise size={32} weight="light" className={s.emptyIcon} />
          <p className={s.emptyText}>No reading history yet</p>
          <p className={s.emptyHint}>Chapters you read will appear here</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className={s.empty}>
          <Books size={28} weight="light" className={s.emptyIcon} />
          <p className={s.emptyText}>No results for "{search}"</p>
        </div>
      ) : (
        <div className={s.list}>
          {groups.map(({ label, items }) => (
            <div key={label} className={s.group}>
              <p className={s.groupLabel}>{label}</p>
              {items.map((session) => (
                <button
                  key={`${session.latestChapterId}-${session.readAt}`}
                  className={s.row}
                  onClick={() => resumeReading(session)}
                >
                  <div className={s.thumbWrap}>
                    <img src={thumbUrl(session.thumbnailUrl)} alt={session.mangaTitle} className={s.thumb} />
                    {session.chapterCount > 1 && (
                      <span className={s.sessionBadge}>{session.chapterCount}</span>
                    )}
                  </div>
                  <div className={s.info}>
                    <span className={s.mangaTitle}>{session.mangaTitle}</span>
                    <span className={s.chapterName}>
                      {session.chapterCount > 1 ? (
                        <span className={s.chapterRange}>
                          {session.firstChapterName}
                          <span className={s.rangeSep}>→</span>
                          {session.latestChapterName}
                        </span>
                      ) : (
                        <>
                          {session.latestChapterName}
                          {session.latestPageNumber > 1 && (
                            <span className={s.pageBadge}>p.{session.latestPageNumber}</span>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                  <span className={s.time}>{timeAgo(session.readAt)}</span>
                  <Play size={12} weight="fill" className={s.playIcon} />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}