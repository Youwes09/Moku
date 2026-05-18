/**
 * Runs an async task over every item in `items`, with at most `concurrency`
 * tasks in-flight at once. Respects the provided AbortSignal — each worker
 * exits early if the signal fires. Errors thrown by individual tasks are
 * swallowed so one failure does not cancel the whole batch.
 */
export async function runConcurrent<T>(
  items:       T[],
  fn:          (item: T) => Promise<void>,
  signal:      AbortSignal,
  concurrency  = 6,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      if (signal.aborted) return;
      const item = items[i++];
      await fn(item).catch(() => {});
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

/**
 * Deduplicates in-flight async calls by key.
 *
 * Two call signatures are supported:
 *
 * 1. Direct call — supply a key and a zero-arg factory each time:
 *      dedupeRequest("my-key", () => fetchSomething())
 *    If a request with that key is already pending, the existing Promise is
 *    returned and the factory is not called again.
 *
 * 2. Curried wrapper — supply a key-based fetcher once, get back a
 *    single-arg function you can call repeatedly:
 *      const get = dedupeRequest((key) => fetchSomething(key))
 *      get("my-key")
 */
const _inflight = new Map<string, Promise<unknown>>();

export function dedupeRequest<T>(key: string, factory: () => Promise<T>): Promise<T>;
export function dedupeRequest<T>(fn: (key: string) => Promise<T>): (key: string) => Promise<T>;
export function dedupeRequest<T>(
  keyOrFn: string | ((key: string) => Promise<T>),
  factory?: () => Promise<T>,
): Promise<T> | ((key: string) => Promise<T>) {
  // Curried wrapper form
  if (typeof keyOrFn === 'function') {
    const fn = keyOrFn;
    return (key: string) => dedupeRequest(key, () => fn(key));
  }

  // Direct call form
  const key = keyOrFn;
  if (_inflight.has(key)) return _inflight.get(key) as Promise<T>;
  const p = factory!().finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}