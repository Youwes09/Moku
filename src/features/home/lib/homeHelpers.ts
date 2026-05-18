export function timeAgo(ts: number): string {
  const diff = Date.now() - ts, m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatReadTime(mins: number): string {
  if (mins < 1)  return `${Math.round(mins * 60)}s`;
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60), r = Math.round(mins % 60);
  if (h < 24) return r === 0 ? `${h}h` : `${h}h ${r}m`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
}

export function timeAgoRefresh(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts, m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function handleRowWheel(e: WheelEvent) {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  (e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
  e.stopPropagation();
}
