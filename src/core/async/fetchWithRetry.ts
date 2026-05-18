export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?:  number;
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

export async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs  = 10_000,
    shouldRetry = () => true,
  } = options;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetcher();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !shouldRetry(err, attempt)) throw err;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
