export type NovelTheme = "paper" | "sepia" | "dark";
export type NovelFont  = "serif" | "sans" | "mono";

export const NOVEL_FONTS: Record<NovelFont, string> = {
  serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  sans:  'var(--font-ui), system-ui, -apple-system, sans-serif',
  mono:  '"JetBrains Mono", ui-monospace, "Courier New", monospace',
};

export function resolvedNovelFont(st: { systemFont: string | null; fontFamily: NovelFont }): string {
  return st.systemFont ? `"${st.systemFont}", ${NOVEL_FONTS[st.fontFamily]}` : NOVEL_FONTS[st.fontFamily];
}

const FONT_MIN = 0.8,  FONT_MAX = 2.0;
const LH_MIN   = 1.3,   LH_MAX  = 2.4;
const PS_MIN   = 0.3,   PS_MAX  = 2.2;
const W_MIN    = 30,    W_MAX   = 60;

const LS_KEY = "moku.novelPrefs";

interface NovelPrefs {
  fontFamily:  NovelFont;
  systemFont:  string | null;
  fontScale:   number;
  lineHeight:  number;
  paraSpacing: number;
  pageWidth:   number;
  textAlign:   "left" | "justify";
  theme:       NovelTheme;
}
const DEFAULTS: NovelPrefs = {
  fontFamily: "serif", systemFont: null, fontScale: 1, lineHeight: 1.7,
  paraSpacing: 1.1, pageWidth: 42, textAlign: "left", theme: "paper",
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, +v.toFixed(2)));
}

export interface NovelSegment {
  chapterId:     string;
  chapterNumber: number;
  name:          string;
  body:          string;
  format:        "html" | "text";
}

class NovelReaderState {
  segments    = $state<NovelSegment[]>([]);
  unsupported = $state(false);
  loading     = $state(true);
  appending   = $state(false);
  error       = $state<string | null>(null);

  scrollPct  = $state(0);

  fontFamily  = $state<NovelFont>(DEFAULTS.fontFamily);
  systemFont  = $state<string | null>(DEFAULTS.systemFont);
  fontScale   = $state(DEFAULTS.fontScale);
  lineHeight  = $state(DEFAULTS.lineHeight);
  paraSpacing = $state(DEFAULTS.paraSpacing);
  pageWidth   = $state(DEFAULTS.pageWidth);
  textAlign   = $state<"left" | "justify">(DEFAULTS.textAlign);
  theme       = $state<NovelTheme>(DEFAULTS.theme);

  constructor() {
    if (typeof localStorage === "undefined") return;
    try {
      const p = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Partial<NovelPrefs>;
      this.fontFamily  = p.fontFamily  ?? DEFAULTS.fontFamily;
      this.systemFont  = p.systemFont  ?? DEFAULTS.systemFont;
      this.fontScale   = p.fontScale   ?? DEFAULTS.fontScale;
      this.lineHeight  = p.lineHeight  ?? DEFAULTS.lineHeight;
      this.paraSpacing = p.paraSpacing ?? DEFAULTS.paraSpacing;
      this.pageWidth   = p.pageWidth   ?? DEFAULTS.pageWidth;
      this.textAlign   = p.textAlign   ?? DEFAULTS.textAlign;
      this.theme       = p.theme       ?? DEFAULTS.theme;
    } catch { }
  }

  #persist() {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        fontFamily: this.fontFamily, systemFont: this.systemFont, fontScale: this.fontScale, lineHeight: this.lineHeight,
        paraSpacing: this.paraSpacing, pageWidth: this.pageWidth, textAlign: this.textAlign, theme: this.theme,
      } satisfies NovelPrefs));
    } catch { }
  }

  bumpFont(d: number)  { this.fontScale   = clamp(this.fontScale + d, FONT_MIN, FONT_MAX); this.#persist(); }
  bumpLine(d: number)  { this.lineHeight  = clamp(this.lineHeight + d, LH_MIN, LH_MAX);    this.#persist(); }
  bumpPara(d: number)  { this.paraSpacing = clamp(this.paraSpacing + d, PS_MIN, PS_MAX);   this.#persist(); }
  bumpWidth(d: number) { this.pageWidth   = clamp(this.pageWidth + d, W_MIN, W_MAX);       this.#persist(); }
  setFont(f: NovelFont)                 { this.fontFamily = f; this.systemFont = null; this.#persist(); }
  setSystemFont(name: string | null)   { this.systemFont = name; this.#persist(); }
  setAlign(a: "left" | "justify")       { this.textAlign  = a; this.#persist(); }
  setTheme(t: NovelTheme)               { this.theme      = t; this.#persist(); }
  cycleTheme() {
    const order: NovelTheme[] = ["paper", "sepia", "dark"];
    this.setTheme(order[(order.indexOf(this.theme) + 1) % order.length]);
  }

  hasSegment(chapterId: string): boolean {
    return this.segments.some(s => s.chapterId === chapterId);
  }

  reset() {
    this.segments    = [];
    this.unsupported = false;
    this.loading     = true;
    this.appending   = false;
    this.error       = null;
    this.scrollPct   = 0;
  }
}

export const novelReaderState = new NovelReaderState();
