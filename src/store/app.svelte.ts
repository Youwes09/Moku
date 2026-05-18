export type NavPage =
  | "home" | "library" | "sources" | "explore"
  | "downloads" | "extensions" | "history" | "search" | "tracking";

class AppStore {
  navPage:       NavPage = $state("home");
  settingsOpen:  boolean = $state(false);
  searchPrefill: string  = $state("");
  searchQuery:   string  = $state("");
  genreFilter:   string  = $state("");
  scrollPositions: Map<string, number> = $state(new Map());

  setNavPage(next: NavPage)        { this.navPage       = next; }
  setSettingsOpen(next: boolean)   { this.settingsOpen  = next; }
  setSearchPrefill(next: string)   { this.searchPrefill = next; }
  setSearchQuery(next: string)     { this.searchQuery   = next; }
  setGenreFilter(next: string)     { this.genreFilter   = next; }
  saveScroll(key: string, top: number) {
    const m = new Map(this.scrollPositions);
    m.set(key, top);
    this.scrollPositions = m;
  }
  getScroll(key: string): number { return this.scrollPositions.get(key) ?? 0; }
}

export const app = new AppStore();

export function setNavPage(next: NavPage)          { app.setNavPage(next); }
export function setSettingsOpen(next: boolean)     { app.setSettingsOpen(next); }
export function setSearchPrefill(next: string)     { app.setSearchPrefill(next); }
export function setSearchQuery(next: string)       { app.setSearchQuery(next); }
export function setGenreFilter(next: string)       { app.setGenreFilter(next); }
export function saveScroll(key: string, top: number) { app.saveScroll(key, top); }
export function getScroll(key: string): number     { return app.getScroll(key); }