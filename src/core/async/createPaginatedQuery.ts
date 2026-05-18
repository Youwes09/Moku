export interface PaginatedQuery<T> {
  fetchPage(page: number): Promise<T[]>;
  reset(): void;
  hasMore(): boolean;
}

export interface PaginatedQueryConfig<T> {
  fetcher: (page: number) => Promise<{ items: T[]; hasNextPage: boolean }>;
}

export function createPaginatedQuery<T>(
  config: PaginatedQueryConfig<T>,
): PaginatedQuery<T> {
  let _hasMore = true;

  return {
    async fetchPage(page) {
      const { items, hasNextPage } = await config.fetcher(page);
      _hasMore = hasNextPage;
      return items;
    },
    reset()    { _hasMore = true; },
    hasMore()  { return _hasMore; },
  };
}
