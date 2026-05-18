export type SortDir = "asc" | "desc";

export interface SortField<T> {
  key: string;
  comparator: (a: T, b: T, context?: Record<string, unknown>) => number;
}

export interface SortConfig<T> {
  fields: SortField<T>[];
  defaultField: string;
  defaultDir: SortDir;
}

export interface Sorter<T> {
  sort(items: T[], field: string, dir: SortDir, context?: Record<string, unknown>): T[];
}

export function createSorter<T>(config: SortConfig<T>): Sorter<T> {
  const fieldMap = new Map(config.fields.map(f => [f.key, f]));

  return {
    sort(items, field, dir, context) {
      const f = fieldMap.get(field) ?? fieldMap.get(config.defaultField);
      if (!f) return [...items];
      const d = dir ?? config.defaultDir;
      return [...items].sort((a, b) => {
        const cmp = f.comparator(a, b, context);
        return d === "asc" ? cmp : -cmp;
      });
    },
  };
}
