interface WorkerMsg {
  focalTitle: string;
  focalId: number;
  allManga: { id: number; title: string }[];
  linkedIds: number[];
}

function titleSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const wa = new Set(norm(a));
  const wb = new Set(norm(b));
  if (!wa.size || !wb.size) return 0;
  const intersection = [...wa].filter(w => wb.has(w)).length;
  return intersection / new Set([...wa, ...wb]).size;
}

self.onmessage = (e: MessageEvent<WorkerMsg>) => {
  const { focalTitle, focalId, allManga, linkedIds } = e.data;
  const matches: number[] = [];

  for (const m of allManga) {
    if (m.id === focalId) continue;
    if (linkedIds.includes(m.id)) continue;
    if (titleSimilarity(focalTitle, m.title) >= 0.65) matches.push(m.id);
  }

  self.postMessage(matches);
};