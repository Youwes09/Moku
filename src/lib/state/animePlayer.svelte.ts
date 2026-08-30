const LS_KEY = "moku.animePrefs";

interface AnimePrefs {
  muted: boolean;
  volume: number;
  playbackRate: number;
  subFontScale: number;
  subBottomPct: number;
  subBackground: boolean;
}

class AnimePlayerState {
  videoUrl        = $state<string | null>(null);
  unavailable     = $state(false);

  positionSeconds = $state(0);
  durationSeconds = $state(0);
  bufferedSeconds = $state(0);
  playing         = $state(false);
  buffering       = $state(false);
  loading         = $state(true);
  resolving       = $state(false);
  error           = $state<string | null>(null);

  muted           = $state(false);
  volume          = $state(1);
  playbackRate    = $state(1);
  activeSubtitle  = $state<string | null>(null);

  subFontScale    = $state(1);
  subBottomPct    = $state(9);
  subBackground   = $state(false);

  subtitles       = $state<{ lang: string; url: string }[]>([]);

  sources         = $state<{ label: string; resolution: number; preferred: boolean; url: string }[]>([]);
  sourceIdx       = $state(0);

  skipMarkers     = $state<{ type: string; name: string; startMs: number; endMs: number }[]>([]);

  resumeAt        = $state(0);

  constructor() {
    if (typeof localStorage === "undefined") return;
    try {
      const p = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as Partial<AnimePrefs>;
      if (typeof p.muted === "boolean")        this.muted        = p.muted;
      if (typeof p.volume === "number")        this.volume       = p.volume;
      if (typeof p.playbackRate === "number")  this.playbackRate = p.playbackRate;
      if (typeof p.subFontScale === "number")  this.subFontScale = p.subFontScale;
      if (typeof p.subBottomPct === "number")  this.subBottomPct = p.subBottomPct;
      if (typeof p.subBackground === "boolean") this.subBackground = p.subBackground;
    } catch { }

    $effect.root(() => {
      $effect(() => {
        const snap = JSON.stringify({
          muted: this.muted, volume: this.volume, playbackRate: this.playbackRate,
          subFontScale: this.subFontScale, subBottomPct: this.subBottomPct, subBackground: this.subBackground,
        } satisfies AnimePrefs);
        try { localStorage.setItem(LS_KEY, snap); } catch { }
      });
    });
  }

  get progressFraction(): number {
    return this.durationSeconds > 0 ? this.positionSeconds / this.durationSeconds : 0;
  }

  resetForEpisode() {
    this.videoUrl        = null;
    this.subtitles       = [];
    this.sources         = [];
    this.sourceIdx       = 0;
    this.skipMarkers     = [];
    this.unavailable     = false;
    this.positionSeconds = 0;
    this.durationSeconds = 0;
    this.bufferedSeconds = 0;
    this.playing         = false;
    this.buffering       = false;
    this.loading         = true;
    this.resolving       = false;
    this.error           = null;
    this.resumeAt        = 0;
  }
}

export const animePlayerState = new AnimePlayerState();
