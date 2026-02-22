const DEFAULT_URL = "http://127.0.0.1:4567";

function getServerUrl(): string {
  // Read from persisted Zustand store if available, fall back to default
  try {
    const raw = localStorage.getItem("moku-settings");
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

// Retry with exponential backoff — Suwayomi may not be ready on first load
async function fetchWithRetry(url: string, init: RequestInit, retries = 8, delayMs = 500): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(1.5, i)));
    }
  }
  throw new Error("unreachable");
}

export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetchWithRetry(gqlUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Suwayomi HTTP ${res.status}`);
  }

  const json: GQLResponse<T> = await res.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data;
}