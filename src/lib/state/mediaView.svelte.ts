import type { Manga, Chapter } from "$lib/types";
import { seriesState } from "$lib/state/series.svelte";

class MediaViewState {
  get activeManga(): Manga | null    { return seriesState.activeManga; }
  get activeChapter(): Chapter | null { return seriesState.activeChapter; }
  readonly activeChapterList = $derived(seriesState.readerChapterList);

  get contentType(): "MANGA" | "ANIME" | "NOVEL" {
    return seriesState.activeManga?.contentType ?? "MANGA";
  }

  uiVisible    = $state(true);
  isFullscreen = $state(false);
  loading      = $state(true);
  error        = $state<string | null>(null);

  reset() {
    this.loading = true;
    this.error   = null;
  }

  toggleUi()  { this.uiVisible = !this.uiVisible; }
  showUi()    { this.uiVisible = true; }

  async toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await document.documentElement.requestFullscreen().catch(() => {});
  }
}

export const mediaViewState = new MediaViewState();
