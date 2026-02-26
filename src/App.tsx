import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { gql } from "./lib/client";
import { GET_DOWNLOAD_STATUS } from "./lib/queries";
import "./styles/global.css";
import { useStore } from "./store";
import Layout from "./components/layout/Layout";
import Reader from "./components/pages/Reader";
import Settings from "./components/settings/Settings";
import MangaPreview from "./components/explore/MangaPreview";
import TitleBar from "./components/layout/TitleBar";
import Toaster from "./components/layout/Toaster";
import SplashScreen, { EXIT_MS as SPLASH_EXIT_MS } from "./components/layout/SplashScreen";
import type { DownloadStatus, DownloadQueueItem } from "./lib/types";
import s from "./App.module.css";

const MAX_ATTEMPTS = 30;

export default function App() {
  const activeChapter      = useStore((s) => s.activeChapter);
  const settingsOpen       = useStore((s) => s.settingsOpen);
  const settings           = useStore((s) => s.settings);
  const setActiveDownloads = useStore((s) => s.setActiveDownloads);
  const addToast           = useStore((s) => s.addToast);

  // serverProbeOk = server responded, but we wait for ring to finish before showing UI
  const [serverProbeOk, setServerProbeOk] = useState(!settings.autoStartServer);
  // appReady = ring filled + transition done, show main UI
  const [appReady, setAppReady]           = useState(!settings.autoStartServer);
  const [failed, setFailed]               = useState(false);
  const [retryKey, setRetryKey]           = useState(0);
  const [idle, setIdle]                   = useState(false);
  // dev tools: force show splash
  const [devSplash, setDevSplash]         = useState(false);

  const prevQueueRef = useRef<DownloadQueueItem[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef     = useRef(false);

  // expose devSplash trigger via window for settings
  useEffect(() => {
    (window as any).__mokuShowSplash = () => setDevSplash(true);
    return () => { delete (window as any).__mokuShowSplash; };
  }, []);

  // Keep idleRef in sync so resetIdle can check it without a stale closure
  useEffect(() => { idleRef.current = idle; }, [idle]);

  useEffect(() => {
    if (!appReady) return;
    function resetIdle() {
      // While the idle splash is visible, don't reset — let SplashScreen's own
      // dismiss flow handle teardown so the exit animation plays fully.
      if (idleRef.current) return;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const idleTimeoutMs = (settings.idleTimeoutMin ?? 5) * 60 * 1000;
      if (idleTimeoutMs === 0) return;
      idleTimerRef.current = setTimeout(() => setIdle(true), idleTimeoutMs);
    }
    const events = ["mousemove","mousedown","keydown","touchstart","wheel"];
    events.forEach(e => window.addEventListener(e, resetIdle, { passive:true }));
    resetIdle();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [appReady, settings.idleTimeoutMin]);

  function detectCompletions(prev: DownloadQueueItem[], next: DownloadQueueItem[]) {
    for (const item of prev) {
      if (item.state !== "DOWNLOADING") continue;
      if (!next.some(q => q.chapter.id === item.chapter.id)) {
        const manga = item.chapter.manga;
        addToast({ kind:"success", title:"Chapter downloaded",
          body: manga ? `${manga.title} — ${item.chapter.name}` : item.chapter.name,
          duration: 4000 });
      }
    }
  }

  function applyQueue(next: DownloadQueueItem[]) {
    detectCompletions(prevQueueRef.current, next);
    prevQueueRef.current = next;
    setActiveDownloads(next.map(item => ({
      chapterId: item.chapter.id, mangaId: item.chapter.mangaId, progress: item.progress,
    })));
  }

  useEffect(() => {
    document.documentElement.style.zoom = `${settings.uiScale * 1.5}%`;
  }, [settings.uiScale]);

  useEffect(() => {
    const theme = settings.theme ?? "dark";
    document.documentElement.setAttribute("data-theme", theme);
  }, [settings.theme]);

  useEffect(() => {
    const p = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", p);
    return () => document.removeEventListener("contextmenu", p);
  }, []);

  useEffect(() => {
    if (!settings.autoStartServer) return;
    invoke("spawn_server", { binary: settings.serverBinary }).catch(err =>
      console.warn("Could not start server:", err));
    return () => { invoke("kill_server").catch(() => {}); };
  }, [settings.autoStartServer, settings.serverBinary]);

  // Poll until server responds
  useEffect(() => {
    if (serverProbeOk) return;
    let cancelled = false, tries = 0;
    async function probe() {
      if (cancelled) return;
      tries++;
      try {
        const res = await fetch(`${settings.serverUrl}/api/graphql`, {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ query:"{ __typename }" }),
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok && !cancelled) { setServerProbeOk(true); return; }
      } catch {}
      if (tries >= MAX_ATTEMPTS && !cancelled) { setFailed(true); return; }
      if (!cancelled) setTimeout(probe, 800);
    }
    const t = setTimeout(probe, 800);
    return () => { cancelled = true; clearTimeout(t); };
  }, [serverProbeOk, settings.serverUrl, retryKey]);

  useEffect(() => {
    if (!appReady) return;
    function poll() {
      gql<{ downloadStatus: DownloadStatus }>(GET_DOWNLOAD_STATUS)
        .then(d => applyQueue(d.downloadStatus.queue)).catch(console.error);
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [appReady]);

  useEffect(() => {
    type P = { chapterId:number; mangaId:number; progress:number }[];
    const unsub = listen<P>("download-progress", e => setActiveDownloads(e.payload));
    return () => { unsub.then(fn => fn()); };
  }, [setActiveDownloads]);

  // Dev splash overlay — shows idle mode so you can dismiss with any interaction
  if (devSplash) {
    return (
      <SplashScreen
        mode="idle"
        showFps
        showCards={settings.splashCards ?? true}
        onDismiss={() => { setTimeout(() => setDevSplash(false), SPLASH_EXIT_MS + 20); }}
      />
    );
  }

  // Loading splash — shown until ring fills + transition completes
  if (!appReady) {
    return (
      <SplashScreen
        mode="loading"
        ringFull={serverProbeOk}
        failed={failed}
        showCards={settings.splashCards ?? true}
        onReady={() => setAppReady(true)}
        onRetry={() => {
          setFailed(false);
          setServerProbeOk(false);
          setRetryKey(k => k+1);
        }}
      />
    );
  }

  return (
    <div className={s.root}>
      {idle && !activeChapter && (
        <SplashScreen
          mode="idle"
          showCards={settings.splashCards ?? true}
            onDismiss={() => { setTimeout(() => { setIdle(false); }, SPLASH_EXIT_MS + 20); }}
        />
      )}
      {!activeChapter && <TitleBar/>}
      <div className={s.content}>
        {activeChapter ? <Reader/> : <Layout/>}
      </div>
      {settingsOpen && <Settings/>}
      <MangaPreview/>
      <Toaster/>
    </div>
  );
}