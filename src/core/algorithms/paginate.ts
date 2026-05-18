export interface PaginationState {
  visible: number;
}

export interface PaginationResult<T> {
  items: T[];
  hasMore: boolean;
  remaining: number;
}

export function createPaginator<T>(pageSize: number) {
  return {
    slice(all: T[], visible: number): PaginationResult<T> {
      return {
        items:     all.slice(0, visible),
        hasMore:   all.length > visible,
        remaining: Math.max(0, all.length - visible),
      };
    },

    nextVisible(current: number): number {
      return current + pageSize;
    },

    reset(): number {
      return pageSize;
    },
  };
}
