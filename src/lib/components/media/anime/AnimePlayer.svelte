<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { fade } from "svelte/transition";
  import {
    Play, Pause, FastForward, Rewind, Speedometer, CaretDown, CaretLeft,
    SpeakerSimpleHigh, SpeakerSimpleLow, SpeakerSimpleX, CircleNotch,
    SkipBack, SkipForward, ClosedCaptioning, Stack, Sparkle,
  } from "phosphor-svelte";
  import type HlsType from "hls.js";
  import type { MediaPlayerClass } from "dashjs";
  import { seriesState, setPreviewManga } from "$lib/state/series.svelte";
  import { settingsState, updateSettings } from "$lib/state/settings.svelte";
  import { tsunagu } from "$lib/server-adapters/tsunagu";
  import { pageServerUrl } from "$lib/core/cache/pageCache";
  import { animePlayerState } from "$lib/state/animePlayer.svelte";
  import { mediaViewState } from "$lib/state/mediaView.svelte";
  import { chapterNav } from "$lib/components/media/shared/useChapterNav";
  import { throttledProgressReporter } from "$lib/components/media/shared/progress";
  import { trackHistory } from "$lib/components/media/shared/historyTracking.svelte";
  import { markChapterRead } from "$lib/components/media/manga/lib/chapterActions";
  import { resolveEpisodeSource, resolveSkipTimestamps } from "$lib/components/media/anime/lib/episodeSource";
  import type { AssRenderer } from "$lib/components/media/anime/lib/assSubs";
  import { VideoUpscaler, type UpscaleMode } from "$lib/core/video/upscaler";
  import { addToast } from "$lib/state/notifications.svelte";
  import { setReading, clearReading } from "$lib/core/discord";
  import mokuIcon from "$lib/assets/moku-icon.svg?raw";
  import MediaChrome from "$lib/components/media/shared/MediaChrome.svelte";
  import MediaSlider from "$lib/components/media/shared/MediaSlider.svelte";

  const nav        = chapterNav();
  const aps        = animePlayerState;
  const manga      = $derived(seriesState.activeManga);
  const chapter    = $derived(seriesState.activeChapter);
  const prefsKey   = $derived(manga?.prefsKey ?? manga?.mediaId ?? manga?.libraryEntryId ?? manga?.id ?? "");
  const reportProg = throttledProgressReporter(5000);

  trackHistory(() => aps.positionSeconds);
  const markedRead = new Set<string>();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let upscaleCanvas = $state<HTMLCanvasElement | null>(null);
  let upscaler: VideoUpscaler | null = null;
  let upscaleActive = $state(false);
  const upscaleEnabled = $derived(settingsState.settings.videoUpscaleExperimental ?? false);
  const upscaleMode = $derived(
    (upscaleEnabled ? (settingsState.settings.videoUpscale ?? "off") : "off") as UpscaleMode,
  );
  let hls: HlsType | null = null;
  let dash: MediaPlayerClass | null = null;
  let attachedUrl: string | null = null;
  let watchdog:  ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  let flashKind = $state<"play" | "pause" | "back" | "fwd" | null>(null);
  let flashText = $state("");

  let subMenuOpen  = $state(false);
  let srcMenuOpen  = $state(false);
  let volOpen      = $state(false);
  let rateOpen     = $state(false);
  let nmMenuOpen   = $state(false);
  let nmView       = $state<"root" | "subs" | "source" | "speed">("root");
  let dims         = $state("");
  let volHideTimer:  ReturnType<typeof setTimeout> | null = null;
  let rateHideTimer: ReturnType<typeof setTimeout> | null = null;
  let sourceAttempts = 0;

  const BCP47: Record<string, string> = {
    english: "en", "english (cc)": "en", spanish: "es", "español": "es",
    "spanish (spain)": "es-ES", "español (spain)": "es-ES", "español (españa)": "es-ES",
    "spanish (latin america)": "es-419", "español (latinoamérica)": "es-419",
    portuguese: "pt", "português": "pt", "portuguese (brazil)": "pt-BR", "português (brasil)": "pt-BR",
    french: "fr", "français": "fr", german: "de", deutsch: "de", italian: "it", italiano: "it",
    russian: "ru", "русский": "ru", arabic: "ar", "العربية": "ar", japanese: "ja", "日本語": "ja",
    korean: "ko", "한국어": "ko", chinese: "zh", "中文": "zh",
    "chinese (simplified)": "zh-Hans", "chinese (traditional)": "zh-Hant",
    turkish: "tr", polish: "pl", dutch: "nl", indonesian: "id", thai: "th", vietnamese: "vi", hindi: "hi",
  };
  function bcp47(name: string): string {
    const k = (name || "").trim().toLowerCase();
    if (BCP47[k]) return BCP47[k];
    return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(k) ? k : "und";
  }

  let assSubs        = $state<{ lang: string; url: string; content: string }[]>([]);
  let subsClassified = $state(false);
  let manifestTracks = $state<{ key: string; label: string; dashIndex?: number }[]>([]);
  let assRenderer = $state<AssRenderer | null>(null);
  let assVtt: { track: HTMLTrackElement; url: string } | null = null;

  let subText = $state("");
  function renderCues() {
    const tracks = videoEl?.textTracks;
    if (!tracks) { subText = ""; return; }
    let out = "";
    for (let i = 0; i < tracks.length && !out; i++) {
      const t = tracks[i];
      if (t.mode === "disabled" || !t.activeCues) continue;
      const parts: string[] = [];
      for (let j = 0; j < t.activeCues.length; j++) {
        const raw = (t.activeCues[j] as VTTCue).text ?? "";
        if (raw.trim()) parts.push(raw);
      }
      out = parts.join("\n");
    }
    subText = out.replace(/\n/g, "<br>");
  }
  let subChoiceMade  = false;

  const vttSubtitles = $derived(
    subsClassified ? aps.subtitles.filter(s => !assSubs.some(a => a.url === s.url)) : [],
  );
  const subMenuItems = $derived.by(() => {
    const rows = [
      ...vttSubtitles.map(s => ({ key: s.lang, lang: s.lang, label: s.lang, pick: () => selectVtt(s.lang) })),
      ...assSubs.map(a => ({ key: a.lang, lang: a.lang, label: `${a.lang} · ASS`, pick: () => selectAss(a) })),
      ...manifestTracks.map(t => ({ key: t.key, lang: t.label || t.key, label: t.label, pick: () => selectManifestTrack(t) })),
    ];
    const seen = new Set<string>();
    return rows.filter(r => {
      const code = bcp47(r.lang);
      const k = code !== "und" ? code : r.lang.trim().toLowerCase();
      return seen.has(k) ? false : (seen.add(k), true);
    });
  });

  const SKIP = 10;

  const SUBS_DEBUG = false;
  function slog(...a: unknown[]) {
    if (!SUBS_DEBUG) return;
    const flat = a.map(x =>
      x && typeof x === "object"
        ? (() => { try { return JSON.stringify(x, (_k, v) => (v instanceof Error ? String(v) : v)); } catch { return String(x); } })()
        : x,
    );
    console.log("[subs]", ...flat);
  }
  function dumpTextTracks(where: string) {
    const tt = videoEl?.textTracks;
    if (!tt) { slog(where, "textTracks: <none>"); return; }
    const rows: string[] = [];
    for (let i = 0; i < tt.length; i++) rows.push(`#${i} kind=${tt[i].kind} lang=${tt[i].language} label="${tt[i].label}" mode=${tt[i].mode} cues=${tt[i].cues?.length ?? "?"}`);
    slog(where, `textTracks(${tt.length}):`, rows.length ? rows : "empty");
  }

  const episodeLabel = $derived(
    chapter ? `Ep. ${chapter.chapterNumber}${chapter.name ? ` — ${chapter.name}` : ""}` : "",
  );

  $effect(() => {
    if (manga && chapter) setReading(manga, chapter).catch(() => {});
  });
  onDestroy(() => { clearReading().catch(() => {}); });
  const durationPct = $derived(aps.durationSeconds > 0 ? (aps.positionSeconds / aps.durationSeconds) * 100 : 0);
  const timeLabel   = $derived(`${fmt(aps.positionSeconds)} / ${fmt(aps.durationSeconds)}`);
  const nethermind    = $derived(settingsState.settings.nethermindMode ?? false);
  const manualChrome  = $derived(settingsState.settings.playerManualChrome ?? false);
  const containerized = $derived(settingsState.settings.readerContainerized ?? false);

  let cursorActive = $state(true);
  let cursorTimer: ReturnType<typeof setTimeout> | null = null;
  const cursorOff = $derived(!cursorActive && aps.playing && !mediaViewState.uiVisible);

  function pokeCursor() {
    cursorActive = true;
    if (cursorTimer) clearTimeout(cursorTimer);
    if (aps.playing) cursorTimer = setTimeout(() => { cursorActive = false; }, 2500);
  }
  function pointerNearBar(e: MouseEvent) {
    return e.clientY <= 88 || e.clientY >= window.innerHeight - 130;
  }
  function onRootMove(e: MouseEvent) {
    pokeCursor();
    if (!manualChrome && pointerNearBar(e)) armIdleHide();
  }

  const activeSkip = $derived.by(() => {
    const ms = aps.positionSeconds * 1000;
    return aps.skipMarkers.find(m => ms >= m.startMs && ms < m.endMs - 1000) ?? null;
  });
  const skipLabel = $derived(
    !activeSkip ? "" :
    activeSkip.type === "opening" ? "Skip intro" :
    activeSkip.type === "ending"  ? "Skip outro" :
    activeSkip.type === "recap"   ? "Skip recap" :
    `Skip ${activeSkip.name || "section"}`,
  );

  const skipBands = $derived.by(() => {
    const durMs = aps.durationSeconds * 1000;
    if (!Number.isFinite(durMs) || durMs <= 0 || aps.skipMarkers.length === 0) return [];
    return aps.skipMarkers.map(m => ({
      startPct: Math.max(0, Math.min(100, (m.startMs / durMs) * 100)),
      widthPct: Math.max(0.4, Math.min(100, ((m.endMs - m.startMs) / durMs) * 100)),
      kind: m.type === "ending" ? "ending" : m.type === "recap" ? "recap" : "opening",
    }));
  });

  function fmt(s: number): string {
    if (!Number.isFinite(s)) s = 0;
    const total = Math.floor(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const r = total % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`
      : `${m}:${r.toString().padStart(2, "0")}`;
  }

  function togglePlay() {
    if (!videoEl) return;
    const wasPaused = videoEl.paused;
    if (wasPaused) void videoEl.play().catch(() => {}); else videoEl.pause();
    flash(wasPaused ? "play" : "pause");
  }
  function seekBy(delta: number) {
    if (!videoEl) return;
    const dur = videoEl.duration || 0;
    videoEl.currentTime = Math.max(0, Math.min(dur, videoEl.currentTime + delta));
    flash(delta < 0 ? "back" : "fwd", `${Math.abs(delta)}s`);
  }
  function seekToPct(p: number) {
    if (!videoEl || !videoEl.duration) return;
    videoEl.currentTime = (p / 100) * videoEl.duration;
  }
  function toggleMute() {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    aps.muted = videoEl.muted;
  }

  const RATE_MENU = [2, 1.75, 1.5, 1.25, 1, 0.75];
  function applyRate() { if (videoEl) videoEl.playbackRate = aps.playbackRate; }
  function pickRate(r: number) { aps.playbackRate = r; applyRate(); rateOpen = false; }
  function refreshManifestTracks() {
    if (dash) return;
    slog("refreshManifestTracks (HLS/native path)");
    dumpTextTracks("refreshManifestTracks");
    const tt = videoEl?.textTracks;
    const out: { key: string; label: string }[] = [];
    if (tt) {
      for (let i = 0; i < tt.length; i++) {
        const k = tt[i].kind;
        if (k && k !== "subtitles" && k !== "captions") continue;
        const lang  = tt[i].language || "";
        const label = tt[i].label || lang || `Track ${i + 1}`;
        const key   = lang || label;
        if (aps.subtitles.some(s => s.lang === key)) continue;
        out.push({ key, label });
      }
    }
    manifestTracks = out;
    if (aps.activeSubtitle && !assRenderer && trackFor(aps.activeSubtitle)) {
      applyVtt(aps.activeSubtitle);
    }
  }
  function syncDashText() {
    if (!dash) return;
    let tracks: { lang?: string | null }[] = [];
    try { tracks = dash.getTracksFor("text") ?? []; } catch (e) { slog("syncDashText: getTracksFor threw", e); tracks = []; }
    slog("syncDashText: dash.getTracksFor('text') =", tracks);
    dumpTextTracks("syncDashText");
    manifestTracks = tracks.map((t, i) => ({
      key: `dash:${t.lang || i}`,
      label: t.lang || `Text ${i + 1}`,
      dashIndex: i,
    }));
    if (aps.activeSubtitle) {
      const m = manifestTracks.find(x => x.key === aps.activeSubtitle);
      if (m) applyDashText(m.dashIndex!);
    } else if (!subChoiceMade && manifestTracks.length) {
      slog("syncDashText: auto-enabling dash text idx 0 =", manifestTracks[0].key);
      applyDashText(manifestTracks[0].dashIndex!);
      aps.activeSubtitle = manifestTracks[0].key;
    }
  }
  function applyDashText(index: number) {
    const tt = videoEl?.textTracks;
    if (tt) for (let i = 0; i < tt.length; i++) {
      if (aps.subtitles.some(s => s.lang === (tt[i].language || tt[i].label))) tt[i].mode = "disabled";
    }
    try {
      dash?.enableText?.(true);
      dash?.setTextTrack(index);
      slog("applyDashText: setTextTrack", index, "isTextEnabled=", dash?.isTextEnabled?.());
    } catch (e) { slog("applyDashText: threw", e); }
    setTimeout(() => dumpTextTracks("applyDashText+500ms"), 500);
  }
  function selectManifestTrack(t: { key: string; dashIndex?: number }) {
    subChoiceMade = true;
    disposeAss();
    if (t.dashIndex != null) applyDashText(t.dashIndex);
    else applyVtt(t.key);
    aps.activeSubtitle = t.key;
    subMenuOpen = false;
  }
  function trackFor(key: string): boolean {
    const tt = videoEl?.textTracks;
    if (!tt) return false;
    for (let i = 0; i < tt.length; i++) if (tt[i].language === key || tt[i].label === key) return true;
    return false;
  }
  function applyVtt(key: string | null) {
    disposeAss();
    try { dash?.setTextTrack(-1); } catch { }
    const tt = videoEl?.textTracks;
    let matched = 0;
    if (tt) {
      for (let i = 0; i < tt.length; i++) {
        const t = tt[i];
        const on = key != null && (t.language === key || t.label === key);
        t.mode = on ? "hidden" : "disabled";
        if (on) { matched++; t.removeEventListener("cuechange", renderCues); t.addEventListener("cuechange", renderCues); }
      }
    }
    slog(`applyVtt(${JSON.stringify(key)}): matched ${matched} track(s)`);
    dumpTextTracks("applyVtt");
    aps.activeSubtitle = key;
    renderCues();
  }
  function selectVtt(key: string | null) {
    subChoiceMade = true;
    applyVtt(key);
    subMenuOpen = false;
  }
  function disposeAss() {
    assRenderer?.destroy();
    assRenderer = null;
    if (assVtt) {
      try { assVtt.track.remove(); URL.revokeObjectURL(assVtt.url); } catch { }
      assVtt = null;
    }
    subText = "";
  }
  async function applyAss(a: { lang: string; content: string }) {
    disposeAss();
    applyVtt(null);
    if (!videoEl) return;
    aps.activeSubtitle = a.lang;

    try {
      const { assToVtt } = await import("$lib/components/media/anime/lib/assToVtt");
      const vtt = assToVtt(a.content);
      const cueCount = (vtt.match(/-->/g) || []).length;
      slog(`applyAss: assToVtt -> ${vtt.length} chars, ${cueCount} cues, head=${JSON.stringify(vtt.slice(0, 120))}`);
      if (videoEl && cueCount > 0) {
        const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = a.lang;
        track.srclang = bcp47(a.lang);
        track.default = true;
        track.src = url;
        videoEl.appendChild(track);
        assVtt = { track, url };
        let shown = false;
        const show = () => {
          if (!track.track) return;
          track.track.mode = "hidden";
          renderCues();
          if (!shown) slog("applyAss: VTT track hidden+rendered, cues=", track.track.cues?.length);
          shown = true;
        };
        track.addEventListener("load", show);
        track.track?.addEventListener("cuechange", renderCues);
        track.addEventListener("cuechange", renderCues);
        queueMicrotask(show);
        [120, 300, 700, 1500, 3000].forEach((ms) => setTimeout(() => { if (!shown) show(); }, ms));
      }
    } catch (e) {
      slog("applyAss: assToVtt FAILED", e);
    }

    try {
      const { mountAss } = await import("$lib/components/media/anime/lib/assSubs");
      if (!videoEl) return;
      assRenderer = mountAss(videoEl, a.content, slog);
      assRenderer.ready
        ?.then(() => { slog("applyAss: JASSUB ready — dropping VTT fallback"); if (assVtt?.track.track) assVtt.track.track.mode = "disabled"; })
        .catch((e: unknown) => slog("applyAss: JASSUB ready rejected, keeping VTT", e));
    } catch (e) {
      slog("applyAss: JASSUB unavailable, keeping VTT", e);
    }
  }
  async function selectAss(a: { lang: string; content: string }) {
    subChoiceMade = true;
    await applyAss(a);
    subMenuOpen = false;
  }

  const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, +v.toFixed(2)));

  async function classifySubs() {
    disposeAss();
    assSubs = [];
    subsClassified = false;
    slog("classifySubs: sidecar subtitles from videoStream:", aps.subtitles.map(s => ({ lang: s.lang, url: s.url })));
    const found: { lang: string; url: string; content: string }[] = [];
    await Promise.all(aps.subtitles.map(async (s) => {
      try {
        const res = await fetch(s.url);
        const fmt = (res.headers.get("X-Subtitle-Format") || "").toLowerCase();
        const txt = res.ok ? await res.text() : "";
        const sniffAss = txt.replace(/^﻿/, "").trimStart().slice(0, 16).toLowerCase().startsWith("[script info]");
        slog(`  fetch ${s.lang}: ${res.status} fmt="${fmt}" bytes=${txt.length} sniffAss=${sniffAss} head=${JSON.stringify(txt.slice(0, 50))}`);
        if (!res.ok) return;
        if (fmt === "ass" || fmt === "ssa" || (!fmt && sniffAss)) found.push({ ...s, content: txt });
      } catch (e) {
        slog(`  fetch ${s.lang}: THREW`, e);
      }
    }));
    assSubs = found;
    subsClassified = true;
    await tick();
    slog("classifySubs done:", { ass: found.map(a => a.lang), vtt: vttSubtitles.map(s => s.lang), manifest: manifestTracks.map(m => m.key), subChoiceMade, activeSubtitle: aps.activeSubtitle });
    dumpTextTracks("classifySubs");

    if (aps.activeSubtitle) {
      const ass = found.find(a => a.lang === aps.activeSubtitle);
      if (ass) { if (!assRenderer) void applyAss(ass); }
      else if (trackFor(aps.activeSubtitle)) applyVtt(aps.activeSubtitle);
    } else if (!subChoiceMade && aps.subtitles.length && (settingsState.settings.autoEnableSubtitles ?? true)) {
      const pref = (settingsState.settings.preferredSubtitleLang ?? "").trim();
      const first = (pref && aps.subtitles.find(s =>
        s.lang.toLowerCase() === pref.toLowerCase() || bcp47(s.lang) === bcp47(pref)
      )) || aps.subtitles[0];
      const ass = found.find(a => a.url === first.url);
      slog("classifySubs: auto-enabling", first.lang, ass ? "(ASS→JASSUB)" : "(VTT→<track>)");
      if (ass) void applyAss(ass); else applyVtt(first.lang);
    } else {
      slog("classifySubs: nothing to auto-enable");
    }
  }

  function ensureSubtitle() {
    if (!subsClassified || !aps.activeSubtitle || assRenderer) return;
    const tt = assVtt?.track.track;
    if (tt) { if (tt.mode !== "hidden") { tt.mode = "hidden"; } renderCues(); return; }
    const ass = assSubs.find(a => a.lang === aps.activeSubtitle);
    if (ass) { void applyAss(ass); return; }
    if (trackFor(aps.activeSubtitle)) applyVtt(aps.activeSubtitle);
  }
  function setVolume(v: number) {
    if (!videoEl) return;
    v = Math.max(0, Math.min(1, +v.toFixed(2)));
    videoEl.volume = v;
    aps.volume = v;
    if (v > 0 && videoEl.muted) { videoEl.muted = false; aps.muted = false; }
  }

  function flash(kind: typeof flashKind, text = "") {
    flashKind = kind;
    flashText = text;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashKind = null; }, 550);
  }

  function armIdleHide() {
    if (!mediaViewState.uiVisible) mediaViewState.showUi();
    if (idleTimer) clearTimeout(idleTimer);
    if (aps.playing && !manualChrome) idleTimer = setTimeout(() => { mediaViewState.uiVisible = false; }, 3000);
  }

  function onSurfaceClick(e: MouseEvent) {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      const zone = e.clientX / window.innerWidth;
      if (zone < 0.35) seekBy(-SKIP);
      else if (zone > 0.65) seekBy(SKIP);
      else if (manualChrome) mediaViewState.uiVisible = !mediaViewState.uiVisible;
      else mediaViewState.toggleFullscreen();
      return;
    }
    clickTimer = setTimeout(() => { clickTimer = null; togglePlay(); }, 230);
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) return;
    let handled = true;
    switch (e.key) {
      case " ": case "k":       togglePlay(); break;
      case "ArrowLeft":         seekBy(-5); break;
      case "ArrowRight":        seekBy(5); break;
      case "j":                 seekBy(-SKIP); break;
      case "l":                 seekBy(SKIP); break;
      case "ArrowUp":           setVolume(aps.volume + 0.1); break;
      case "ArrowDown":         setVolume(aps.volume - 0.1); break;
      case "m":                 toggleMute(); break;
      case "f":                 mediaViewState.toggleFullscreen(); break;
      case "p":                 nav.goPrev(); break;
      case "n":                 nav.goNext(); break;
      case "Escape":            nav.close(); break;
      default:                  handled = false;
    }
    if (handled) { e.preventDefault(); armIdleHide(); }
  }

  function clearWatchdog() { if (watchdog) { clearTimeout(watchdog); watchdog = null; } }
  function armWatchdog() {
    clearWatchdog();
    watchdog = setTimeout(() => {
      if (videoEl && videoEl.readyState === 0) {
        if (tryNextSource()) return;
        aps.error = "The video didn't start. The stream may be unavailable, or this device is missing the codecs to play it.";
        aps.unavailable = true;
        aps.videoUrl = null;
      }
    }, 12_000);
  }

  interface ProbeResult {
    ok: boolean;
    stage?: "resolve" | "verify";
    streamType?: string;
    status?: number;
    error?: string;
  }

  async function probeStream(mediaId: string, chapterId: string): Promise<ProbeResult | null> {
    const ctl = new AbortController();
    const to  = setTimeout(() => ctl.abort(), 45_000);
    try {
      const r = await fetch(`${pageServerUrl()}/content/${mediaId}/${chapterId}/video/probe`, { signal: ctl.signal });
      return (await r.json()) as ProbeResult;
    } catch {
      return null;
    } finally {
      clearTimeout(to);
    }
  }

  async function load() {
    const m = manga, c = chapter;
    if (!m || !c) return;
    teardown();
    aps.resetForEpisode();
    mediaViewState.loading = true;

    const mediaId = m.mediaId ?? m.libraryEntryId ?? m.id;

    aps.resolving = true;
    const probe = await probeStream(mediaId, c.id);
    aps.resolving = false;
    if (c.id !== chapter?.id) return;

    const [src, progress] = await Promise.all([
      resolveEpisodeSource(c.id),
      tsunagu.readingProgress(mediaId).catch(() => []),
    ]);
    if (c.id !== chapter?.id) return;

    aps.sources = src.sources ?? [];
    sourceAttempts = 0;

    const adsOnly     = probe?.ok === false && /another source/i.test(probe.error ?? "");
    const canFallback = adsOnly && aps.sources.length > 1;

    if (probe && probe.ok === false && !canFallback) {
      aps.error = probe.error
        ?? (probe.stage === "verify"
          ? `The stream was found but the source refused the connection (HTTP ${probe.status ?? "error"}). Trying again may work — the server drops the dead link on failure.`
          : "The source couldn't produce a playable stream for this episode. Downloading it will always work.");
      aps.unavailable = true;
      aps.loading = false;
      mediaViewState.loading = false;
      return;
    }

    const savedSource = settingsState.settings.mangaPrefs?.[prefsKey]?.preferredVideoSource;
    let startIdx = savedSource
      ? aps.sources.findIndex(s => s.label === savedSource)
      : -1;
    if (startIdx < 0) startIdx = Math.max(0, aps.sources.findIndex(s => s.preferred));
    if (canFallback && startIdx === 0) startIdx = 1;
    aps.sourceIdx = startIdx;

    aps.unavailable = !!src.unavailable;
    aps.videoUrl    = aps.sources[startIdx]?.url ?? src.url ?? null;
    aps.subtitles   = src.subtitles ?? [];
    aps.skipMarkers = src.skipMarkers ?? [];
    aps.resumeAt    = progress.find(p => p.chapterId === c.id)?.positionSeconds ?? 0;
    aps.loading     = false;
    mediaViewState.loading = false;
    slog("load: resolved", { url: aps.videoUrl, sources: aps.sources.length, startIdx, subs: (src.subtitles ?? []).length });
    void classifySubs();
  }

  function tryNextSource(): boolean {
    if (sourceAttempts >= aps.sources.length || aps.sourceIdx + 1 >= aps.sources.length) return false;
    sourceAttempts++;
    aps.sourceIdx += 1;
    aps.resumeAt    = aps.positionSeconds;
    aps.error       = null;
    aps.unavailable = false;
    aps.videoUrl    = aps.sources[aps.sourceIdx].url;
    slog("tryNextSource →", aps.sourceIdx, aps.sources[aps.sourceIdx]?.label);
    return true;
  }

  function pickSource(i: number) {
    srcMenuOpen = false;
    if (i === aps.sourceIdx || !aps.sources[i]) return;
    sourceAttempts = 0;
    aps.sourceIdx   = i;
    aps.resumeAt    = aps.positionSeconds;
    aps.error       = null;
    aps.unavailable = false;
    aps.videoUrl    = aps.sources[i].url;
    savePreferredSource(aps.sources[i].label);
  }

  function savePreferredSource(label: string | undefined) {
    if (!label || !prefsKey) return;
    const prefs = settingsState.settings.mangaPrefs ?? {};
    if (prefs[prefsKey]?.preferredVideoSource === label) return;
    updateSettings({ mangaPrefs: { ...prefs, [prefsKey]: { ...prefs[prefsKey], preferredVideoSource: label } } });
  }

  async function attach() {
    const url = aps.videoUrl;
    if (!url || !videoEl || url === attachedUrl) return;
    teardown();
    attachedUrl = url;

    let ct = "";
    try {
      const r = await fetch(url, { headers: { Range: "bytes=0-1" } });
      if (!r.ok) { onError(); return; }
      ct = (r.headers.get("content-type") ?? "").toLowerCase();
      r.body?.cancel().catch(() => {});
    } catch { onError(); return; }
    if (url !== aps.videoUrl) return;

    const isHls  = ct.includes("mpegurl") || url.includes(".m3u8");
    const isDash = ct.includes("dash+xml") || url.includes(".mpd");

    armWatchdog();
    applyVolume();

    if ((!isHls && !isDash) || (isHls && videoEl.canPlayType("application/vnd.apple.mpegurl"))) {
      videoEl.src = url;
      return;
    }

    if (isHls) {
      const { default: Hls } = await import("hls.js");
      if (url !== aps.videoUrl) return;
      if (!Hls.isSupported()) return failUnsupported("HLS");
      hls = new Hls({ enableWorker: true });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { void videoEl?.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) onError(); });
      hls.loadSource(url);
      hls.attachMedia(videoEl);
      return;
    }

    const mod = await import("dashjs");
    if (url !== aps.videoUrl) return;
    const dashjs = (mod as any).default ?? mod;
    if (typeof dashjs?.MediaPlayer !== "function") return failUnsupported("DASH");
    const ev = dashjs.MediaPlayer.events;
    dash = dashjs.MediaPlayer().create();
    dash!.on(ev.ERROR, () => onError());
    dash!.on(ev.TEXT_TRACKS_ADDED, syncDashText);
    dash!.on(ev.STREAM_INITIALIZED, syncDashText);
    dash!.initialize(videoEl, url, true);
  }

  function applyVolume() {
    if (!videoEl) return;
    videoEl.volume = aps.volume;
    videoEl.muted  = aps.muted;
    videoEl.playbackRate = aps.playbackRate;
  }

  function failUnsupported(f: string) {
    clearWatchdog();
    aps.error = `This build can't play ${f} streams. Download the episode to watch it.`;
    aps.unavailable = true;
    aps.videoUrl = null;
  }

  function teardown() {
    clearWatchdog();
    disposeAss();
    manifestTracks = [];
    if (hls) { hls.destroy(); hls = null; }
    if (dash) { try { dash.destroy(); } catch { } dash = null; }
    if (videoEl) { videoEl.removeAttribute("src"); videoEl.load(); }
    attachedUrl = null;
  }

  function onLoadedMeta() {
    clearWatchdog();
    if (!videoEl) return;
    aps.durationSeconds = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    if (aps.resumeAt > 0 && aps.resumeAt < videoEl.duration - 5) videoEl.currentTime = aps.resumeAt;
    applyRate();
    ensureSubtitle();
    dims = videoEl.videoWidth ? `${videoEl.videoWidth} × ${videoEl.videoHeight}` : "";

    tryAniSkip();
  }

  function tryAniSkip() {
    if (!chapter || aps.skipMarkers.length > 0) return;
    const cid = chapter.id;
    const durMs = Number.isFinite(videoEl?.duration) && (videoEl?.duration ?? 0) > 0
      ? videoEl!.duration * 1000 : 0;
    resolveSkipTimestamps(cid, durMs).then((m) => {
      if (m.length && chapter?.id === cid && aps.skipMarkers.length === 0) {
        aps.skipMarkers = m;
        console.debug(`[aniskip] ${m.length} marker(s)`, m);
      }
    });
  }

  function skipCurrent() {
    if (!videoEl || !activeSkip) return;
    videoEl.currentTime = Math.min(videoEl.duration || activeSkip.endMs / 1000, activeSkip.endMs / 1000 + 0.1);
    flash("fwd", activeSkip.type === "ending" ? "outro" : "intro");
  }
  function onTimeUpdate() {
    if (!videoEl || !chapter) return;
    aps.positionSeconds = videoEl.currentTime;
    renderCues();
    const frac = aps.progressFraction;
    reportProg(chapter.id, frac, {
      positionSeconds: videoEl.currentTime,
      durationSeconds: videoEl.duration || 0,
      completed: frac >= 0.9,
    });
  }
  function onEnded() {
    aps.buffering = false;
    if (chapter && !markedRead.has(chapter.id)) markChapterRead(chapter.id, markedRead);
    if ((settingsState.settings.autoplayNextEpisode ?? true) && nav.next) nav.goNext();
  }
  function onError() {
    teardown();
    if (tryNextSource()) return;
    aps.videoUrl = null;
    aps.unavailable = true;
  }
  function onPlay()   { clearWatchdog(); aps.playing = true; aps.buffering = false; pokeCursor(); if (!manualChrome && mediaViewState.uiVisible) armIdleHide(); }
  function onPause()  { aps.playing = false; aps.buffering = false; if (idleTimer) clearTimeout(idleTimer); }

  onMount(() => {
    slog("env check", {
      OffscreenCanvas: typeof OffscreenCanvas,
      requestVideoFrameCallback: typeof (HTMLVideoElement.prototype as unknown as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback,
      SharedArrayBuffer: typeof SharedArrayBuffer,
      crossOriginIsolated: typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : "n/a",
      Worker: typeof Worker,
      WebAssembly: typeof WebAssembly,
    });
    window.addEventListener("keydown", onKey);
  });
  onDestroy(() => {
    window.removeEventListener("keydown", onKey);
    teardown();
    if (idleTimer) clearTimeout(idleTimer);
    if (cursorTimer) clearTimeout(cursorTimer);
    if (clickTimer) clearTimeout(clickTimer);
    if (flashTimer) clearTimeout(flashTimer);
    if (volHideTimer) clearTimeout(volHideTimer);
    if (rateHideTimer) clearTimeout(rateHideTimer);
    if (upscaleHideTimer) clearTimeout(upscaleHideTimer);
    upscaler?.destroy();
    upscaler = null;
  });

  let lastChapterId: string | null = null;
  $effect(() => {
    const id = chapter?.id ?? null;
    if (id && id !== lastChapterId) { lastChapterId = id; load(); }
  });
  $effect(() => { if (aps.videoUrl && videoEl) void attach(); });

  $effect(() => {
    const mode = upscaleMode;
    const v = videoEl;
    const c = upscaleCanvas;
    if (!v || !c || mode === "off") {
      upscaler?.destroy();
      upscaler = null;
      upscaleActive = false;
      return;
    }
    if (!upscaler) {
      upscaler = new VideoUpscaler(v, c);
      if (!upscaler.supported) {
        upscaler = null;
        addToast({ kind: "error", title: "Upscaling unavailable", body: "WebGL2 isn't supported here." });
        updateSettings({ videoUpscale: "off" });
        return;
      }
      upscaler.onFirstFrame = () => { upscaleActive = true; };
      upscaler.onError = (reason) => {
        upscaleActive = false;
        addToast({ kind: "error", title: "Upscaling stopped", body: reason });
        updateSettings({ videoUpscale: "off" });
      };
    }
    upscaler.setMode(mode);
    return () => {
      upscaler?.destroy();
      upscaler = null;
      upscaleActive = false;
    };
  });

  const UPSCALE_MENU: { v: UpscaleMode; label: string }[] = [
    { v: "off",     label: "Off" },
    { v: "fast",    label: "Fast" },
    { v: "quality", label: "Quality" },
  ];
  function pickUpscale(v: UpscaleMode) { updateSettings({ videoUpscale: v }); upscaleOpen = false; }
  let upscaleOpen = $state(false);
  let upscaleHideTimer: ReturnType<typeof setTimeout> | null = null;


  $effect(() => {
    void aps.videoUrl;
    void vttSubtitles.length;
    const tt = videoEl?.textTracks;
    if (!tt) return;
    refreshManifestTracks();
    const h = () => refreshManifestTracks();
    tt.addEventListener("addtrack", h);
    tt.addEventListener("removetrack", h);
    return () => {
      tt.removeEventListener("addtrack", h);
      tt.removeEventListener("removetrack", h);
    };
  });

  $effect(() => {
    if (!nmMenuOpen) return;
    const shut = () => { nmMenuOpen = false; nmView = "root"; };
    const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".nm-wrap")) shut(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); nmView === "root" ? shut() : (nmView = "root"); } };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc, true); };
  });

  $effect(() => {
    if (!subMenuOpen && !srcMenuOpen) return;
    const off = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".cc-wrap")) { subMenuOpen = false; srcMenuOpen = false; }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); subMenuOpen = false; srcMenuOpen = false; }
    };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc, true);
    };
  });
</script>

<div class="root" class:cursor-off={cursorOff} class:ui-unzoom={!containerized} role="presentation" onmousemove={onRootMove}>
  <div class="anime">
    {#if aps.loading}
      <div class="loader">
        <div class="loader-logo">{@html mokuIcon}</div>
        <p class="loader-text">{aps.resolving ? "Finding stream…" : "Loading…"}</p>
      </div>
    {:else if aps.unavailable}
      <div class="notice">
        <p class="notice-title">Can't play {episodeLabel}</p>
        {#if aps.error}
          <p>{aps.error}</p>
        {:else}
          <p>The server had no playable video for this episode. It may not be
             downloaded, or the source only offers a stream this player can't
             handle. Downloading the episode will always work.</p>
        {/if}
      </div>
    {:else if aps.videoUrl}
      <video
        bind:this={videoEl}
        class="video"
        class:video-dimmed={upscaleActive}
        autoplay
        onloadedmetadata={onLoadedMeta}
        ondurationchange={() => { if (Number.isFinite(videoEl?.duration)) aps.durationSeconds = videoEl!.duration; tryAniSkip(); }}
        ontimeupdate={onTimeUpdate}
        onended={onEnded}
        onerror={onError}
        onplay={onPlay}
        onplaying={() => { aps.buffering = false; ensureSubtitle(); }}
        onwaiting={() => (aps.buffering = true)}
        oncanplay={() => { clearWatchdog(); ensureSubtitle(); }}
        onpause={onPause}
        onvolumechange={() => { if (videoEl) { aps.volume = videoEl.volume; aps.muted = videoEl.muted; } }}
      >
        {#each vttSubtitles as t (t.url)}
          <track kind="subtitles" src={t.url} srclang={bcp47(t.lang)} label={t.lang} />
        {/each}
      </video>

      {#if upscaleMode !== "off"}
        <canvas
          bind:this={upscaleCanvas}
          class="video up-canvas"
          class:up-hidden={!upscaleActive}
        ></canvas>
      {/if}

      {#if subText && !assRenderer}
        <div
          class="sub-overlay"
          class:bar-up={mediaViewState.uiVisible}
          class:boxed={aps.subBackground}
          style="--sub-gap:{aps.subBottomPct}vh; --sub-scale:{aps.subFontScale}"
        >
          <span class="sub-line">{@html subText}</span>
        </div>
      {/if}

      <div class="tap-layer" role="presentation" onclick={onSurfaceClick}></div>

      {#if activeSkip}
        <button class="skip-btn" class:raised={mediaViewState.uiVisible}
          transition:fade={{ duration: 120 }} onclick={skipCurrent}>
          {skipLabel} <FastForward size={13} weight="fill" />
        </button>
      {/if}

      {#if aps.buffering}
        <div class="buffering"><CircleNotch size={40} weight="light" class="anim-spin" /></div>
      {/if}

      {#if flashKind}
        <div class="flash flash-{flashKind}" transition:fade={{ duration: 140 }}>
          {#if flashKind === "play"}<Play size={38} weight="fill" />
          {:else if flashKind === "pause"}<Pause size={38} weight="fill" />
          {:else if flashKind === "back"}<Rewind size={30} weight="fill" /><span>{flashText}</span>
          {:else}<FastForward size={30} weight="fill" /><span>{flashText}</span>{/if}
        </div>
      {/if}
    {:else}
      <div class="notice">{aps.error ?? "No video source."}</div>
    {/if}
  </div>

  <MediaChrome
    title={manga?.title ?? ""}
    chapterLabel={episodeLabel}
    readout={null}
    hasPrev={!!nav.prev}
    hasNext={!!nav.next}
    onPrev={nav.goPrev}
    onNext={nav.goNext}
    onClose={nav.close}
    onOpenPreview={() => { if (manga) setPreviewManga(manga); }}
    showBottomBar={false}
  >
    {#snippet endControls()}
      {#if nethermind}
        <div class="cc-wrap nm-wrap">
          <button class="cc-btn" class:active={nmMenuOpen} data-tip="Options" aria-label="Options"
            onclick={() => { nmMenuOpen = !nmMenuOpen; nmView = "root"; }}>
            <CaretDown size={15} weight="bold" />
          </button>
          {#if nmMenuOpen}
            <div class="cc-menu nm-menu" role="presentation" onclick={(e) => e.stopPropagation()}>
              {#if nmView === "root"}
                {#if subMenuItems.length}
                  <button class="nm-row" onclick={() => (nmView = "subs")}>
                    <span class="nm-k">Subtitles</span>
                    <span class="nm-v"><span class="nm-v-txt">{aps.activeSubtitle ?? "Off"}</span><CaretDown size={11} weight="bold" /></span>
                  </button>
                {/if}
                {#if aps.sources.length > 1}
                  <button class="nm-row" onclick={() => (nmView = "source")}>
                    <span class="nm-k">Source</span>
                    <span class="nm-v"><span class="nm-v-txt">{aps.sources[aps.sourceIdx]?.label ?? "Auto"}</span><CaretDown size={11} weight="bold" /></span>
                  </button>
                {/if}
                <button class="nm-row" onclick={() => (nmView = "speed")}>
                  <span class="nm-k">Playback speed</span>
                  <span class="nm-v"><span class="nm-v-txt">{aps.playbackRate}×</span><CaretDown size={11} weight="bold" /></span>
                </button>
                <div class="nm-row nm-row-static">
                  <span class="nm-k">Volume</span>
                  <div class="nm-volume">
                    <input class="nm-slider" type="range" min="0" max="1" step="0.02"
                      value={aps.muted ? 0 : aps.volume}
                      oninput={(e) => setVolume(Number((e.currentTarget as HTMLInputElement).value))} />
                    <span class="nm-v-txt nm-pct">{Math.round((aps.muted ? 0 : aps.volume) * 100)}%</span>
                  </div>
                </div>

                <div class="nm-divider"></div>
                <p class="nm-head">Stream</p>
                <div class="nm-info"><span>Resolution</span><span>{dims || "—"}</span></div>
                {#if aps.sources[aps.sourceIdx]?.label}
                  <div class="nm-info"><span>Source</span><span>{aps.sources[aps.sourceIdx].label}</span></div>
                {/if}
              {:else}
                <button class="nm-back" onclick={() => (nmView = "root")}><CaretLeft size={12} weight="bold" /> Back</button>
                {#if nmView === "subs"}
                  <button class="cc-row" class:sel={aps.activeSubtitle == null} onclick={() => { selectVtt(null); nmView = "root"; }}>Off</button>
                  {#each subMenuItems as item (item.key)}
                    <button class="cc-row" class:sel={aps.activeSubtitle === item.key} onclick={() => { item.pick(); nmView = "root"; }}>{item.label}</button>
                  {/each}
                {:else if nmView === "source"}
                  {#each aps.sources as s, i (i)}
                    <button class="cc-row" class:sel={i === aps.sourceIdx} onclick={() => { pickSource(i); nmView = "root"; }}>{s.label}</button>
                  {/each}
                {:else if nmView === "speed"}
                  {#each RATE_MENU as r (r)}
                    <button class="cc-row" class:sel={aps.playbackRate === r} onclick={() => { pickRate(r); nmView = "root"; }}>{r}×</button>
                  {/each}
                {/if}
              {/if}
            </div>
          {/if}
        </div>
      {:else}
      {#if aps.sources.length > 1}
        <div class="cc-wrap">
          <button class="cc-btn" class:active={srcMenuOpen} data-tip="Quality / source" aria-label="Quality"
            onclick={() => { srcMenuOpen = !srcMenuOpen; subMenuOpen = false; }}>
            <Stack size={14} weight="regular" />
            <span class="cc-label">{aps.sources[aps.sourceIdx]?.label ?? "Auto"}</span>
          </button>
          {#if srcMenuOpen}
            <div class="cc-menu cc-menu-wide" role="presentation" onclick={(e) => e.stopPropagation()}>
              <p class="cc-head">Source</p>
              <div class="cc-langs">
                {#each aps.sources as s, i (i)}
                  <button class="cc-row" class:sel={i === aps.sourceIdx} onclick={() => pickSource(i)}>
                    {s.label}{#if s.preferred} · auto{/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
      {#if subMenuItems.length}
        <div class="cc-wrap">
          <button class="cc-btn" class:active={subMenuOpen} data-tip="Subtitles" aria-label="Subtitles"
            onclick={() => { subMenuOpen = !subMenuOpen; srcMenuOpen = false; }}>
            <ClosedCaptioning size={14} weight={aps.activeSubtitle ? "fill" : "regular"} />
            <span class="cc-label">{aps.activeSubtitle?.replace(/^dash:/, "") ?? "Off"}</span>
          </button>
          {#if subMenuOpen}
            <div class="cc-menu" role="presentation" onclick={(e) => e.stopPropagation()}>
              <p class="cc-head">Language</p>
              <div class="cc-langs">
                <button class="cc-row" class:sel={aps.activeSubtitle == null} onclick={() => selectVtt(null)}>Off</button>
                {#each subMenuItems as item (item.key)}
                  <button class="cc-row" class:sel={aps.activeSubtitle === item.key} onclick={item.pick}>{item.label}</button>
                {/each}
              </div>

              <div class="cc-div"></div>

              <div class="cc-ctl">
                <span>Text size</span>
                <div class="cc-step">
                  <button aria-label="Smaller" onclick={() => aps.subFontScale = clampNum(aps.subFontScale - 0.1, 0.5, 2.5)}>−</button>
                  <span class="cc-val">{Math.round(aps.subFontScale * 100)}%</span>
                  <button aria-label="Larger" onclick={() => aps.subFontScale = clampNum(aps.subFontScale + 0.1, 0.5, 2.5)}>+</button>
                </div>
              </div>

              <div class="cc-ctl">
                <span>Height</span>
                <div class="cc-step">
                  <button aria-label="Lower" onclick={() => aps.subBottomPct = clampNum(aps.subBottomPct - 3, 0, 45)}>−</button>
                  <span class="cc-val">{Math.round(aps.subBottomPct)}%</span>
                  <button aria-label="Raise" onclick={() => aps.subBottomPct = clampNum(aps.subBottomPct + 3, 0, 45)}>+</button>
                </div>
              </div>

              <div class="cc-ctl">
                <span>Background</span>
                <button class="cc-toggle" class:on={aps.subBackground} onclick={() => aps.subBackground = !aps.subBackground}>
                  {aps.subBackground ? "Box" : "Shadow"}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
      {/if}
    {/snippet}
  </MediaChrome>

  {#if aps.videoUrl && !aps.unavailable && nethermind}
    <div class="abar abar-compact" class:hidden={!mediaViewState.uiVisible}>
      <button class="abtn" data-tip="Rewind {SKIP}s" aria-label="Rewind {SKIP} seconds" onclick={() => seekBy(-SKIP)}>
        <Rewind size={17} weight="fill" />
      </button>
      <button class="abtn" data-tip="Forward {SKIP}s" aria-label="Fast-forward {SKIP} seconds" onclick={() => seekBy(SKIP)}>
        <FastForward size={17} weight="fill" />
      </button>
      <div class="ascrub"><MediaSlider pct={durationPct} label={timeLabel} onSeek={seekToPct} bands={skipBands} /></div>
      <span class="atime">{timeLabel}</span>
    </div>
  {:else if aps.videoUrl && !aps.unavailable}
    <div class="abar" class:hidden={!mediaViewState.uiVisible}>
      <div class="aseg">
        <button class="abtn" data-tip="Previous episode" aria-label="Previous episode" onclick={nav.goPrev} disabled={!nav.prev}>
          <SkipBack size={16} weight="fill" />
        </button>
        <button class="abtn abtn-play" data-tip={aps.playing ? "Pause" : "Play"} aria-label={aps.playing ? "Pause" : "Play"} onclick={togglePlay}>
          {#if aps.playing}<Pause size={19} weight="fill" />{:else}<Play size={19} weight="fill" />{/if}
        </button>
        <button class="abtn" data-tip="Next episode" aria-label="Next episode" onclick={nav.goNext} disabled={!nav.next}>
          <SkipForward size={16} weight="fill" />
        </button>
      </div>

      <div class="adiv"></div>

      <div class="ascrub"><MediaSlider pct={durationPct} label={timeLabel} onSeek={seekToPct} bands={skipBands} /></div>

      <div class="adiv"></div>

      <div class="aseg">
        <span class="atime">{timeLabel}</span>

        <div
          class="vol"
          role="presentation"
          onmouseenter={() => { if (rateHideTimer) clearTimeout(rateHideTimer); rateOpen = true; }}
          onmouseleave={() => { rateHideTimer = setTimeout(() => (rateOpen = false), 220); }}
        >
          <button class="abtn abtn-txt" data-tip="Playback speed" aria-label="Playback speed"
            onclick={() => (rateOpen = !rateOpen)}>
            <Speedometer size={16} weight="regular" />
            <span class="abtn-lbl">{aps.playbackRate}×</span>
          </button>
          {#if rateOpen}
            <div class="stack-pop" role="presentation" onclick={(e) => e.stopPropagation()}>
              {#each RATE_MENU as r (r)}
                <button class="stack-opt" class:on={aps.playbackRate === r} onclick={() => pickRate(r)}>{r}×</button>
              {/each}
            </div>
          {/if}
        </div>

        {#if upscaleEnabled}
        <div
          class="vol"
          role="presentation"
          onmouseenter={() => { if (upscaleHideTimer) clearTimeout(upscaleHideTimer); upscaleOpen = true; }}
          onmouseleave={() => { upscaleHideTimer = setTimeout(() => (upscaleOpen = false), 220); }}
        >
          <button class="abtn abtn-txt" data-tip="Upscale (experimental)" aria-label="Upscale"
            onclick={() => (upscaleOpen = !upscaleOpen)}>
            <Sparkle size={16} weight={upscaleMode === "off" ? "regular" : "fill"} />
            {#if upscaleMode !== "off"}<span class="abtn-lbl">4K</span>{/if}
          </button>
          {#if upscaleOpen}
            <div class="stack-pop" role="presentation" onclick={(e) => e.stopPropagation()}>
              {#each UPSCALE_MENU as m (m.v)}
                <button class="stack-opt" class:on={upscaleMode === m.v} onclick={() => pickUpscale(m.v)}>{m.label}</button>
              {/each}
            </div>
          {/if}
        </div>
        {/if}

        <div
          class="vol"
          role="presentation"
          onmouseenter={() => { if (volHideTimer) clearTimeout(volHideTimer); volOpen = true; }}
          onmouseleave={() => { volHideTimer = setTimeout(() => (volOpen = false), 220); }}
        >
          <button
            class="abtn"
            data-tip={aps.muted || aps.volume === 0 ? "Unmute" : "Volume"}
            aria-label="Volume"
            onclick={() => (volOpen = !volOpen)}
            ondblclick={toggleMute}
          >
            {#if aps.muted || aps.volume === 0}<SpeakerSimpleX size={17} weight="regular" />
            {:else if aps.volume < 0.5}<SpeakerSimpleLow size={17} weight="regular" />
            {:else}<SpeakerSimpleHigh size={17} weight="regular" />{/if}
          </button>

          {#if volOpen}
            <div class="vol-pop" role="presentation" onclick={(e) => e.stopPropagation()}>
              <span class="vol-val">{Math.round((aps.muted ? 0 : aps.volume) * 100)}</span>
              <input
                class="vol-range"
                type="range"
                min="0" max="1" step="0.02"
                value={aps.muted ? 0 : aps.volume}
                oninput={(e) => setVolume(Number((e.currentTarget as HTMLInputElement).value))}
              />
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .root { position: fixed; inset: 0; background: #000; z-index: var(--z-reader); }
  .root.cursor-off { cursor: none; }
  .anime { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .video { width: 100%; height: 100%; object-fit: contain; background: #000; }
  .video-dimmed { opacity: 0; }
  .up-canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; pointer-events: none; z-index: 1; opacity: 1; transition: opacity 0.15s ease; }
  .up-hidden { opacity: 0; }
  .tap-layer { position: absolute; inset: 0; z-index: 2; }

  .sub-overlay {
    position: absolute; left: 0; right: 0;
    bottom: var(--sub-gap, 9vh);
    display: flex; justify-content: center;
    padding: 0 6vw;
    text-align: center;
    pointer-events: none;
    z-index: 35;
    transition: bottom 0.2s ease;
  }
  .sub-overlay.bar-up { bottom: calc(var(--sub-gap, 9vh) + (var(--sp-4) + 54px + var(--sp-3)) * var(--ui-zoom-factor, 1)); }

  .sub-line {
    display: inline-block;
    font-family: var(--font-ui);
    font-size: calc(2.6vh * var(--sub-scale, 1) * var(--ui-zoom-factor, 1));
    line-height: 1.35;
    color: #fff;
    text-shadow: 0 2px 4px #000, 0 0 5px #000;
    white-space: pre-wrap;
  }
  .sub-overlay.boxed .sub-line {
    background: rgba(0, 0, 0, 0.72);
    text-shadow: none;
    padding: 0.12em 0.5em;
    border-radius: 4px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }

  .notice {
    max-width: 32rem; padding: var(--sp-6); text-align: center;
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--text-muted); line-height: 1.6; z-index: 1;
  }
  .notice p { margin: 0 0 0.6em; }
  .notice-title { color: var(--text-secondary); font-weight: var(--weight-medium); }

  .loader {
    display: flex; flex-direction: column; align-items: center; gap: var(--sp-4);
    z-index: 1;
  }
  .loader-logo {
    width: 54px; height: 54px; border-radius: var(--radius-lg); overflow: hidden;
    animation: loader-pulse 1.7s ease-in-out infinite;
  }
  .loader-logo :global(svg) { display: block; width: 100%; height: 100%; }
  .loader-text {
    font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-muted);
    letter-spacing: var(--tracking-wide);
  }
  @keyframes loader-pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.93); }
    50%      { opacity: 1;    transform: scale(1); }
  }

  .buffering { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.85); pointer-events: none; }

  .flash {
    position: absolute; top: 50%; transform: translateY(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: #fff;
    background: rgba(0,0,0,0.55); border-radius: 999px;
    width: 76px; height: 76px; justify-content: center;
    pointer-events: none;
  }
  .flash span { font-family: var(--font-ui); font-size: var(--text-2xs); }

  .skip-btn {
    position: absolute; right: var(--sp-4); bottom: var(--sp-6);
    display: inline-flex; align-items: center; gap: 6px;
    height: 34px; padding: 0 14px; border-radius: 999px;
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    color: #fff; cursor: pointer;
    background: var(--frost-bg); border: 1px solid var(--frost-border);
    backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
    transition: bottom 0.2s ease, background var(--t-fast), border-color var(--t-fast);
    z-index: 41;
  }
  .skip-btn:hover { background: var(--accent-muted); border-color: var(--accent-dim); }
  .skip-btn.raised { bottom: calc(var(--sp-4) + 54px + var(--sp-3)); }
  .flash-play, .flash-pause { left: 50%; transform: translate(-50%, -50%); }
  .flash-back { left: 22%; transform: translate(-50%, -50%); }
  .flash-fwd  { left: 78%; transform: translate(-50%, -50%); }

  .abar {
    position: fixed; z-index: 40;
    left: 50%; bottom: var(--sp-4); transform: translateX(-50%);
    width: min(1320px, calc(100vw - var(--sp-8)));
    display: flex; align-items: center; gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-lg);
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .abar.hidden { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px); }

  .abar-compact { width: min(760px, calc(100vw - var(--sp-8))); gap: var(--sp-2); }

  .cc-menu.nm-menu {
    position: fixed;
    top: calc(var(--sp-3) + 44px + var(--sp-2));
    right: var(--sp-3);
    left: auto;
    width: 272px;
    padding: 6px;
    max-height: min(70vh, 520px); overflow-y: auto;
    scrollbar-width: thin;
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    border-radius: var(--radius-md);
    backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
  }
  .nm-row {
    display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
    width: 100%; padding: 8px 9px; border-radius: var(--radius-sm);
    background: none; border: none; cursor: pointer; text-align: left;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .nm-row:hover:not(.nm-row-static) { background: color-mix(in srgb, #fff 7%, transparent); color: var(--text-primary); }
  .nm-row-static { cursor: default; }
  .nm-k { flex-shrink: 0; white-space: nowrap; }
  .nm-v {
    display: flex; align-items: center; gap: 4px; min-width: 0;
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
  }
  .nm-v-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm-v :global(svg) { flex-shrink: 0; }
  .nm-pct { flex-shrink: 0; font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); min-width: 34px; text-align: right; }

  .nm-volume { display: flex; align-items: center; gap: var(--sp-2); flex: 1; min-width: 0; }
  .nm-slider {
    -webkit-appearance: none; appearance: none;
    flex: 1; height: 3px; border-radius: 2px; background: var(--border-strong);
    outline: none; cursor: pointer; min-width: 0;
  }
  .nm-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
    background: var(--accent); box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4);
  }

  .nm-divider { height: 1px; background: var(--frost-border); margin: 5px 3px; }
  .nm-head {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider);
    text-transform: uppercase; color: var(--text-faint); padding: 4px 9px 3px; margin: 0;
  }
  .nm-back {
    display: flex; align-items: center; gap: 4px;
    width: 100%; padding: 6px 9px; margin-bottom: 2px; border-radius: var(--radius-sm);
    background: none; border: none; cursor: pointer;
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide); text-transform: uppercase;
    transition: color var(--t-fast);
  }
  .nm-back:hover { color: var(--text-primary); }
  .nm-info {
    display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
    padding: 5px 9px;
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
  }
  .nm-info > span:first-child { color: var(--text-faint); flex-shrink: 0; }
  .nm-info > span:last-child { color: var(--text-secondary); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .cc-menu.nm-menu :global(.cc-row) {
    display: block; width: 100%; padding: 7px 9px; border-radius: var(--radius-sm);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-size: var(--text-xs); color: var(--text-secondary);
  }
  .cc-menu.nm-menu :global(.cc-row:hover) { background: color-mix(in srgb, #fff 7%, transparent); color: var(--text-primary); }
  .cc-menu.nm-menu :global(.cc-row.sel) { color: var(--accent-fg); }

  .aseg { display: flex; align-items: center; gap: 2px; flex-shrink: 0; position: relative; }
  .adiv { width: 1px; height: 20px; flex-shrink: 0; background: var(--border-base); opacity: 0.5; margin: 0 var(--sp-1); }

  .abtn {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    height: 32px; min-width: 32px; flex-shrink: 0;
    border-radius: var(--radius-md); border: none;
    color: var(--text-muted); background: none; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .abtn:hover:not(:disabled), .abtn.active { color: var(--text-primary); background: var(--bg-raised); }
  .abtn:disabled { opacity: 0.3; cursor: default; }
  .abtn-play { color: var(--text-primary); }
  .abtn-txt { padding: 0 7px; gap: 4px; }
  .abtn-lbl {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums; letter-spacing: var(--tracking-wide);
  }

  .vol { position: relative; display: flex; }
  .vol-pop, .stack-pop {
    position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 10px 8px 12px;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 32px color-mix(in srgb, var(--bg-void) 55%, transparent);
    z-index: 50;
  }
  .stack-pop { padding: 4px; gap: 1px; min-width: 56px; }
  .stack-opt {
    width: 100%; padding: 6px 10px; border-radius: var(--radius-sm);
    background: none; border: none; cursor: pointer; text-align: center;
    font-family: var(--font-ui); font-size: var(--text-2xs); font-variant-numeric: tabular-nums;
    letter-spacing: var(--tracking-wide); color: var(--text-secondary);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .stack-opt:hover { background: var(--bg-raised); color: var(--text-primary); }
  .stack-opt.on { color: var(--accent-fg); }
  .vol-val {
    font-family: var(--font-ui); font-size: var(--text-2xs); font-variant-numeric: tabular-nums;
    color: var(--text-secondary); letter-spacing: var(--tracking-wide);
  }
  .vol-range {
    -webkit-appearance: slider-vertical; appearance: slider-vertical;
    writing-mode: vertical-lr; direction: rtl;
    width: 6px; height: 96px; margin: 0; cursor: pointer;
    accent-color: var(--accent);
  }

  .ascrub { flex: 1; display: flex; align-items: center; min-width: 0; height: 32px; }
  .atime {
    font-family: var(--font-ui); font-size: var(--text-2xs); font-variant-numeric: tabular-nums;
    color: var(--text-faint); flex-shrink: 0; white-space: nowrap;
    letter-spacing: var(--tracking-wide); padding: 0 var(--sp-1);
  }

  .cc-wrap { position: relative; }
  .cc-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    height: 30px; min-width: 30px; padding: 0 7px; border-radius: var(--radius-md);
    color: var(--text-muted); background: none; border: none; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .cc-btn:hover, .cc-btn.active { color: var(--text-primary); background: var(--bg-raised); }
  .cc-label { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); }
  .cc-menu {
    position: absolute; top: calc(100% + 8px); right: 0;
    width: 244px; padding: 5px;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 32px color-mix(in srgb, var(--bg-void) 55%, transparent);
    z-index: 50;
  }
  .cc-menu-wide { width: max-content; max-width: min(440px, 82vw); }
  .cc-menu-wide .cc-row { white-space: nowrap; }
  .cc-head {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider);
    text-transform: uppercase; color: var(--text-faint); padding: 4px 8px 3px;
  }
  .cc-langs { max-height: 168px; overflow-y: auto; }
  .cc-div { height: 1px; background: var(--border-dim); margin: 5px 3px; }
  .cc-row {
    display: flex; width: 100%; padding: 6px 9px; border-radius: var(--radius-sm); text-align: left;
    background: none; border: none; cursor: pointer;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .cc-row:hover { background: var(--bg-raised); color: var(--text-primary); }
  .cc-row.sel { color: var(--accent-fg); }

  .cc-ctl {
    display: flex; align-items: center; justify-content: space-between;
    padding: 5px 8px; font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary);
  }
  .cc-step { display: flex; align-items: center; gap: 2px; }
  .cc-step button {
    width: 24px; height: 24px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: var(--bg-raised);
    color: var(--text-muted); font-size: var(--text-base); line-height: 1; cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast);
  }
  .cc-step button:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .cc-val {
    min-width: 40px; text-align: center; font-variant-numeric: tabular-nums;
    color: var(--text-primary); letter-spacing: var(--tracking-wide);
  }
  .cc-toggle {
    padding: 4px 12px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim); background: var(--bg-raised);
    color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide); cursor: pointer;
    transition: color var(--t-fast), border-color var(--t-fast), background var(--t-fast);
  }
  .cc-toggle:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .cc-toggle.on { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  :global(.abar [data-tip]:hover)::after {
    content: attr(data-tip);
    position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%);
    background: var(--bg-raised); border: 1px solid var(--border-base);
    border-radius: var(--radius-sm); padding: 3px 7px;
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-secondary);
    letter-spacing: var(--tracking-wide); white-space: nowrap; pointer-events: none; z-index: 60;
  }
</style>
