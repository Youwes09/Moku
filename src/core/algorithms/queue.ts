export interface AsyncQueue<T> {
  enqueue(item: T): void;
  drain(): void;
  clear(): void;
  size(): number;
}

export function createAsyncQueue<T>(
  worker: (item: T) => Promise<void>,
  concurrency = 1,
): AsyncQueue<T> {
  const queue: T[] = [];
  let active = 0;

  function next() {
    while (active < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      active++;
      worker(item).finally(() => { active--; next(); });
    }
  }

  return {
    enqueue(item) { queue.push(item); next(); },
    drain()       { next(); },
    clear()       { queue.length = 0; },
    size()        { return queue.length; },
  };
}
