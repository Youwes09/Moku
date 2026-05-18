export interface SearchResult<T> {
  item:  T;
  score: number;
}

export function searchItems<T>(
  items: T[],
  query: string,
  getField: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(item => getField(item).toLowerCase().includes(q));
}

export function searchWithScore<T>(
  items: T[],
  query: string,
  getField: (item: T) => string,
): SearchResult<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.map(item => ({ item, score: 0 }));

  return items
    .map(item => {
      const field = getField(item).toLowerCase();
      if (!field.includes(q)) return null;
      const score = field === q ? 2 : field.startsWith(q) ? 1 : 0;
      return { item, score };
    })
    .filter((r): r is SearchResult<T> => r !== null)
    .sort((a, b) => b.score - a.score);
}
