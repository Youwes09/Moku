const DEFAULT_URL = "http://127.0.0.1:4567";

function getServerUrl(): string {
  try {
    const raw = localStorage.getItem("moku-store");
    if (raw) {
      const parsed = JSON.parse(raw);
      const url = parsed?.state?.settings?.serverUrl;
      if (typeof url === "string" && url.trim()) return url.replace(/\/$/, "");
    }
  } catch {}
  return DEFAULT_URL;
}

function gqlUrl(): string { return `${getServerUrl()}/api/graphql`; }

export function thumbUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${getServerUrl()}${path}`;
}

interface GQLResponse<T> {
  data: T;
  errors?: { message: string }[];
}

/** Sleep that resolves early if the signal is aborted — never blocks a cancelled request. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * Retry wrapper with these guarantees:
 * 1. AbortErrors always propagate immediately — no retry, no delay.
 * 2. Retry delays are abort-aware — closing a manga mid-delay doesn't hang.
 * 3. If the signal is already aborted before we even start, we bail instantly.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  retries = 3,
  delayMs = 300,
): Promise<Response> {
  // Bail immediately if already aborted before we start
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  for (let i = 0; i < retries; i++) {
    // Check abort at the top of every iteration
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      const res = await fetch(url, { ...init, signal });

      // Check abort again — fetch can return a response even after abort in some runtimes
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      return res;
    } catch (e: any) {
      // Never retry aborted requests
      const isAbort = e?.name === "AbortError" || signal?.aborted;
      if (isAbort) throw new DOMException("Aborted", "AbortError");

      // Last retry — give up
      if (i === retries - 1) throw e;

      // Abort-aware delay between retries
      await abortableSleep(delayMs * Math.pow(1.5, i), signal);
    }
  }
  throw new Error("unreachable");
}

export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetchWithRetry(gqlUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  }, signal);

  // Check abort before reading the body — avoids hanging on res.json() after cancel
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (!res.ok) throw new Error(`Suwayomi HTTP ${res.status}`);

  const json: GQLResponse<T> = await res.json();

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (json.errors?.length) throw new Error(json.errors[0].message);

  return json.data;
}