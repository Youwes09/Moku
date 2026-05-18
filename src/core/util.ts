import type { Manga, Source } from "@types";
import type { Settings }      from "@types";

export { clsx as cn } from "clsx";

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts, m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dayLabel(ts: number): string {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function formatReadTime(m: number): string {
  if (m < 1)  return "< 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

const STRICT_TAGS: string[] = [
  "adult", "mature", "hentai", "ecchi", "erotic", "pornograph",
  "18+", "smut", "explicit", "sexual violence",
  "gore", "guro", "graphic violence", "torture", "body horror",
];

const MODERATE_TAGS: string[] = [
  "adult", "mature", "hentai", "ecchi", "erotic", "pornograph",
  "18+", "smut", "explicit", "sexual violence",
];

type ContentFilterSettings = Pick<
  Settings,
  "contentLevel" | "sourceOverridesEnabled" | "nsfwAllowedSourceIds" | "nsfwBlockedSourceIds"
>;

function blockedTagsForSettings(settings: ContentFilterSettings): string[] {
  if (settings.contentLevel === "strict")   return STRICT_TAGS;
  if (settings.contentLevel === "moderate") return MODERATE_TAGS;
  return [];
}

function genreMatchesBlocklist(genre: string[], blockedTags: string[]): boolean {
  if (!blockedTags.length) return false;
  return genre.some(g => {
    const norm = g.toLowerCase().trim();
    return blockedTags.some(tag => {
      const idx = norm.indexOf(tag);
      if (idx === -1) return false;
      const before = idx === 0 || /\W/.test(norm[idx - 1]);
      const after  = idx + tag.length === norm.length || /\W/.test(norm[idx + tag.length]);
      return before && after;
    });
  });
}

export function shouldHideNsfw(
  manga: Pick<Manga, "genre" | "source">,
  settings: ContentFilterSettings,
): boolean {
  if (settings.contentLevel === "unrestricted") return false;

  const srcId   = manga.source?.id;
  const blocked = settings.sourceOverridesEnabled ? (settings.nsfwBlockedSourceIds ?? []) : [];
  const allowed = settings.sourceOverridesEnabled ? (settings.nsfwAllowedSourceIds ?? []) : [];

  if (srcId && blocked.includes(srcId)) return true;

  const sourceAllowed = !!(srcId && allowed.includes(srcId));

  if (!sourceAllowed && manga.source?.isNsfw) return true;

  return genreMatchesBlocklist(manga.genre ?? [], blockedTagsForSettings(settings));
}

export function shouldHideSource(
  source: Pick<Source, "id" | "isNsfw">,
  settings: ContentFilterSettings,
): boolean {
  if (settings.contentLevel === "unrestricted") return false;

  if (settings.sourceOverridesEnabled) {
    if ((settings.nsfwBlockedSourceIds ?? []).includes(source.id)) return true;
    if ((settings.nsfwAllowedSourceIds ?? []).includes(source.id)) return false;
  }

  return source.isNsfw;
}

export function dedupeSourcesByLang(
  sources:       Source[],
  preferredLang: string,
  settings:      ContentFilterSettings,
  applyHide      = false,
): Source[] {
  const map = new Map<string, Source>();
  for (const s of sources) {
    if (s.id === "0") continue;
    if (applyHide && shouldHideSource(s, settings)) continue;
    const existing = map.get(s.name);
    if (!existing) { map.set(s.name, s); continue; }
    const existingPref = existing.lang === preferredLang;
    const newPref      = s.lang === preferredLang;
    if (newPref && !existingPref) map.set(s.name, s);
    else if (!existingPref && !newPref && s.lang < existing.lang) map.set(s.name, s);
  }
  return Array.from(map.values());
}

export function dedupeSources(sources: Source[], preferredLang: string): Source[] {
  const byName = new Map<string, Source[]>();
  for (const src of sources) {
    if (src.id === "0") continue;
    if (!byName.has(src.name)) byName.set(src.name, []);
    byName.get(src.name)!.push(src);
  }
  const picked: Source[] = [];
  for (const group of byName.values()) {
    const preferred = group.find(s => s.lang === preferredLang);
    picked.push(preferred ?? group.sort((a, b) => a.lang.localeCompare(b.lang))[0]);
  }
  return picked;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(official\)|\(web comic\)|\(webtoon\)|\(manhwa\)|\(manhua\)/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function descFingerprint(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const n = norm(desc);
  return n.length >= 60 ? n.slice(0, 200) : null;
}

function authorFingerprint(author?: string | null, artist?: string | null): string | null {
  const parts = [author, artist].filter(Boolean).map(s => norm(s!));
  return parts.length ? parts.sort().join("|") : null;
}

export function dedupeMangaByTitle<T extends {
  id:             number;
  title:          string;
  description?:   string | null;
  author?:        string | null;
  artist?:        string | null;
  inLibrary?:     boolean;
  downloadCount?: number;
}>(items: T[], links: Record<number, number[]> = {}): T[] {
  const byTitle      = new Map<string, number>();
  const byDesc       = new Map<string, number>();
  const byAuthorDesc = new Map<string, number>();
  const byId         = new Map<number, number>();
  const out: T[]     = [];

  for (const m of items) {
    const tk = normalizeTitle(m.title);
    const dk = descFingerprint(m.description);
    const ak = (dk && m.author) ? `${authorFingerprint(m.author, m.artist)}||${dk}` : null;

    const linkedIds   = links[m.id] ?? [];
    const linkedIdx   = linkedIds.map(lid => byId.get(lid)).find(i => i !== undefined);
    const existingIdx =
      linkedIdx ??
      byTitle.get(tk) ??
      (dk ? byDesc.get(dk)       : undefined) ??
      (ak ? byAuthorDesc.get(ak) : undefined);

    if (existingIdx !== undefined) {
      const existing = out[existingIdx];
      const mBetter  =
        (m.inLibrary && !existing.inLibrary) ||
        (!existing.inLibrary && (m.downloadCount ?? 0) > (existing.downloadCount ?? 0));

      if (mBetter) {
        out[existingIdx] = m;
        byTitle.set(tk, existingIdx);
        byId.set(m.id, existingIdx);
        if (dk) byDesc.set(dk, existingIdx);
        if (ak) byAuthorDesc.set(ak, existingIdx);
      }
      continue;
    }

    const idx = out.length;
    out.push(m);
    byTitle.set(tk, idx);
    byId.set(m.id, idx);
    if (dk) byDesc.set(dk, idx);
    if (ak) byAuthorDesc.set(ak, idx);
  }

  return out;
}

export function dedupeMangaById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const m of items) {
    if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
  }
  return out;
}