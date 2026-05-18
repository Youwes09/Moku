import { store, updateSettings } from "@store/state.svelte";

let themeStyleEl: HTMLStyleElement | null = null;
let mediaQuery:   MediaQueryList | null   = null;
let mediaHandler: (() => void) | null     = null;

export function applyTheme() {
  const themeId  = store.settings.theme ?? "dark";
  const isCustom = themeId.startsWith("custom:");

  if (!isCustom) {
    themeStyleEl?.remove();
    themeStyleEl = null;
    document.documentElement.setAttribute("data-theme", themeId);
    return;
  }

  const custom = store.settings.customThemes?.find(t => t.id === themeId);
  if (!custom) {
    themeStyleEl?.remove();
    themeStyleEl = null;
    document.documentElement.setAttribute("data-theme", "dark");
    return;
  }

  const vars = Object.entries(custom.tokens)
    .map(([k, v]) => `  --${k}: ${v};`)
    .join("\n");
  const css = `[data-theme="custom"] {\n${vars}\n}`;

  if (!themeStyleEl) {
    themeStyleEl = document.createElement("style");
    themeStyleEl.id = "moku-custom-theme";
    document.head.appendChild(themeStyleEl);
  }
  themeStyleEl.textContent = css;
  document.documentElement.setAttribute("data-theme", "custom");
}

function applySystemTheme(dark: boolean) {
  const themeId = dark
    ? (store.settings.systemThemeDark ?? "dark")
    : (store.settings.systemThemeLight ?? "light");
  updateSettings({ theme: themeId });
}

export function mountSystemThemeSync() {
  if (mediaQuery && mediaHandler) {
    mediaQuery.removeEventListener("change", mediaHandler);
    mediaHandler = null;
  }

  if (!store.settings.systemThemeSync) return;

  mediaQuery   = window.matchMedia("(prefers-color-scheme: dark)");
  mediaHandler = () => applySystemTheme(mediaQuery!.matches);
  mediaQuery.addEventListener("change", mediaHandler);
  applySystemTheme(mediaQuery.matches);
}

export function unmountSystemThemeSync() {
  if (mediaQuery && mediaHandler) {
    mediaQuery.removeEventListener("change", mediaHandler);
    mediaHandler = null;
    mediaQuery   = null;
  }
}