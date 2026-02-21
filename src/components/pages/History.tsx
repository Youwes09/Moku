import { useMemo, useState } from "react";
import { ClockCounterClockwise, Trash, MagnifyingGlass, Play } from "@phosphor-icons/react";
import { thumbUrl } from "../../lib/client";
import { useStore, type HistoryEntry } from "../../store";
import s from "./History.module.css";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "Just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Group entries by day
function groupByDay(entries: HistoryEntry[]): { label: string; items: HistoryEntry[] }[] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const d   = new Date(e.readAt);
    const now = new Date();
    let label: string;
    if (d.toDateString() === now.toDateString()) label = "Today";
    else {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
      else label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(e);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export default function History() {
  const history       = useStore((s) => s.history);
  const clearHistory  = useStore((s) => s.clearHistory);
  const setActiveManga = useStore((s) => s.setActiveManga);
  const setNavPage     = useStore((s) => s.setNavPage);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    search.trim()
      ? history.filter((e) =>
          e.mangaTitle.toLowerCase().includes(search.toLowerCase()) ||
          e.chapterName.toLowerCase().includes(search.toLowerCase()))
      : history,
    [history, search]
  );

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  function resumeReading(entry: HistoryEntry) {
    // Navigate to manga detail — user can continue from there
    setActiveManga({
      id: entry.mangaId,
      title: entry.mangaTitle,
      thumbnailUrl: entry.thumbnailUrl,
    } as any);
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
          <p className={s.emptyText}>No reading history yet.</p>
          <p className={s.emptyHint}>Chapters you read will appear here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <p className={s.emptyText}>No results for "{search}"</p>
        </div>
      ) : (
        <div className={s.list}>
          {groups.map(({ label, items }) => (
            <div key={label} className={s.group}>
              <p className={s.groupLabel}>{label}</p>
              {items.map((entry) => (
                <button key={`${entry.chapterId}-${entry.readAt}`}
                  className={s.row} onClick={() => resumeReading(entry)}>
                  <img src={thumbUrl(entry.thumbnailUrl)} alt={entry.mangaTitle}
                    className={s.thumb} />
                  <div className={s.info}>
                    <span className={s.mangaTitle}>{entry.mangaTitle}</span>
                    <span className={s.chapterName}>{entry.chapterName}
                      {entry.pageNumber > 1 && (
                        <span className={s.pageBadge}>p.{entry.pageNumber}</span>
                      )}
                    </span>
                  </div>
                  <span className={s.time}>{timeAgo(entry.readAt)}</span>
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