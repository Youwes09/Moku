import type { Extension } from "@types/index";

export type Filter = "installed" | "available" | "updates" | "all";
export type Panel  = null | "apk" | "repos";

export function baseName(name: string): string {
  return name.replace(/\s*\([A-Z0-9-]{2,10}\)\s*$/, "").trim();
}

export function matchesFilter(ext: Extension, filter: Filter): boolean {
  if (filter === "installed") return ext.isInstalled;
  if (filter === "available") return !ext.isInstalled;
  if (filter === "updates")   return ext.hasUpdate;
  return true;
}

export interface ExtensionGroup {
  base:     string;
  primary:  Extension;
  variants: Extension[];
}

export function groupExtensions(
  extensions: Extension[],
  preferredLang: string | undefined,
): ExtensionGroup[] {
  const map = new Map<string, Extension[]>();
  for (const ext of extensions) {
    const key = baseName(ext.name);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ext);
  }
  return Array.from(map.entries()).map(([base, all]) => {
    const primary =
      all.find((v) => v.lang === preferredLang) ??
      all.find((v) => v.lang === "en") ??
      all[0];
    return { base, primary, variants: all.filter((v) => v.pkgName !== primary.pkgName) };
  });
}

export function validateUrl(url: string, ext?: string): string | null {
  if (!url.startsWith("http://") && !url.startsWith("https://"))
    return "URL must start with http:// or https://";
  if (ext && !url.endsWith(ext))
    return `URL must point to a ${ext} file`;
  return null;
}

export const FILTERS: { id: Filter; label: string }[] = [
  { id: "installed", label: "Installed" },
  { id: "available", label: "Available" },
  { id: "updates",   label: "Updates"   },
  { id: "all",       label: "All"       },
];
