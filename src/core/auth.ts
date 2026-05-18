import { store, updateSettings } from "@store/state.svelte";

export type AuthMode = "NONE" | "BASIC_AUTH" | "UI_LOGIN";

export class AuthRequiredError extends Error {
  constructor(msg = "Authentication required") {
    super(msg);
    this.name = "AuthRequiredError";
  }
}

const TOKEN_KEY = "moku_access_token";
let _accessToken: string | null = sessionStorage.getItem(TOKEN_KEY);

export const uiAuth = {
  getToken:   () => _accessToken,
  setToken:   (t: string) => { _accessToken = t; sessionStorage.setItem(TOKEN_KEY, t); },
  clearToken: () => { _accessToken = null; sessionStorage.removeItem(TOKEN_KEY); },
};

export const authSession = {
  clearTokens() { uiAuth.clearToken(); },
  hasSession(): boolean {
    const mode = store.settings.serverAuthMode ?? "NONE";
    if (mode === "UI_LOGIN") return _accessToken !== null;
    return true;
  },
};

function getServerBase(): string {
  const url = store.settings.serverUrl;
  return typeof url === "string" && url.trim() ? url.replace(/\/$/, "") : "http://127.0.0.1:4567";
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function basicHeader(user: string, pass: string): Record<string, string> {
  return { Authorization: `Basic ${btoa(`${user}:${pass}`)}` };
}

function bearerHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function gqlBody(query: string, variables?: Record<string, unknown>): string {
  return JSON.stringify({ query, ...(variables ? { variables } : {}) });
}

export async function fetchAuthenticated(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
  skipped = false,
): Promise<Response> {
  const mode        = store.settings.serverAuthMode ?? "NONE";
  const baseHeaders = (init.headers ?? {}) as Record<string, string>;

  if (mode === "BASIC_AUTH") {
    const user = store.settings.serverAuthUser?.trim() ?? "";
    const pass = store.settings.serverAuthPass?.trim() ?? "";
    return fetch(url, {
      ...init, signal, credentials: "omit",
      headers: { ...baseHeaders, ...(user && pass ? basicHeader(user, pass) : {}) },
    });
  }

  if (mode === "UI_LOGIN") {
    const token = uiAuth.getToken();
    if (!token) {
      if (skipped) return fetch(url, { ...init, signal, credentials: "omit", headers: baseHeaders });
      throw new AuthRequiredError();
    }
    return fetch(url, {
      ...init, signal, credentials: "omit",
      headers: { ...baseHeaders, ...bearerHeader(token) },
    });
  }

  return fetch(url, { ...init, signal, credentials: "omit" });
}

export async function loginUI(user: string, pass: string): Promise<void> {
  const res = await fetch(`${getServerBase()}/api/graphql`, {
    method: "POST", credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: gqlBody(
      `mutation Login($username: String!, $password: String!) {
         login(input: { username: $username, password: $password }) { accessToken }
       }`,
      { username: user, password: pass },
    ),
    signal: timeoutSignal(8000),
  });
  if (!res.ok) throw new Error(`Login request failed (${res.status})`);
  const json = await res.json();
  const token: string | undefined = json?.data?.login?.accessToken;
  if (!token) throw new Error(json?.errors?.[0]?.message ?? "Login failed");
  uiAuth.setToken(token);
  updateSettings({ serverAuthMode: "UI_LOGIN" });
}

export async function loginBasic(user: string, pass: string): Promise<void> {
  const res = await fetch(`${getServerBase()}/api/graphql`, {
    method: "POST", credentials: "omit",
    headers: { "Content-Type": "application/json", ...basicHeader(user, pass) },
    body: gqlBody("{ __typename }"),
    signal: timeoutSignal(5000),
  });
  if (!res.ok) throw new Error(`Authentication failed (${res.status})`);
  updateSettings({ serverAuthMode: "BASIC_AUTH", serverAuthUser: user, serverAuthPass: pass });
}

export async function logout(): Promise<void> {
  uiAuth.clearToken();
  updateSettings({ serverAuthPass: "", serverAuthMode: "NONE" });
}

export async function probeServer(): Promise<"ok" | "auth_required" | "unreachable"> {
  const base = getServerBase();
  const mode = store.settings.serverAuthMode ?? "NONE";
  const s    = store.settings;

  if (mode === "UI_LOGIN" && !_accessToken) return "auth_required";

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (mode === "BASIC_AUTH") {
      const user = s.serverAuthUser?.trim() ?? "";
      const pass = s.serverAuthPass?.trim() ?? "";
      if (user && pass) Object.assign(headers, basicHeader(user, pass));
    } else if (mode === "UI_LOGIN" && _accessToken) {
      Object.assign(headers, bearerHeader(_accessToken));
    }

    const res = await fetch(`${base}/api/graphql`, {
      method: "POST", credentials: "omit", headers,
      body: gqlBody("{ __typename }"),
      signal: timeoutSignal(5000),
    });

    if (res.ok) return "ok";
    if (res.status === 401) return "auth_required";
    return "unreachable";
  } catch {
    return "unreachable";
  }
}