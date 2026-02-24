import { useEffect, useRef } from "react";
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
import type { DownloadStatus, DownloadQueueItem } from "./lib/types";
import s from "./App.module.css";

export default function App() {
  const activeChapter      = useStore((s) => s.activeChapter);
  const settingsOpen       = useStore((s) => s.settingsOpen);
  const settings           = useStore((s) => s.settings);
  const setActiveDownloads = useStore((s) => s.setActiveDownloads);
  const addToast           = useStore((s) => s.addToast);

  // Ref-based snapshot of the last known queue so we can diff across polls/events
  const prevQueueRef = useRef<DownloadQueueItem[]>([]);

  /** Compare old queue → new queue and toast for anything that finished. */
  function detectCompletions(prev: DownloadQueueItem[], next: DownloadQueueItem[]) {
    for (const item of prev) {
      if (item.state !== "DOWNLOADING") continue;
      const stillPresent = next.some((q) => q.chapter.id === item.chapter.id);
      if (!stillPresent) {
        const manga = item.chapter.manga;
        addToast({
          kind: "success",
          title: "Chapter downloaded",
          body: manga
            ? `${manga.title} — ${item.chapter.name}`
            : item.chapter.name,
          duration: 4000,
        });
      }
    }
  }

  function applyQueue(next: DownloadQueueItem[]) {
    detectCompletions(prevQueueRef.current, next);
    prevQueueRef.current = next;
    setActiveDownloads(
      next.map((item) => ({
        chapterId: item.chapter.id,
        mangaId:   item.chapter.mangaId,
        progress:  item.progress,
      }))
    );
  }

  useEffect(() => {
    document.documentElement.style.zoom = `${settings.uiScale * 1.5}%`;
  }, [settings.uiScale]);

  useEffect(() => {
    const prevent = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  useEffect(() => {
    if (!settings.autoStartServer) return;
    invoke("spawn_server", { binary: settings.serverBinary }).catch((err) =>
      console.warn("Could not start server:", err)
    );
    return () => { invoke("kill_server").catch(() => {}); };
  }, [settings.autoStartServer, settings.serverBinary]);

  // Global download status poller — always running, regardless of which page is open.
  // This is the single source of truth for completion toasts.
  useEffect(() => {
    function poll() {
      gql<{ downloadStatus: DownloadStatus }>(GET_DOWNLOAD_STATUS)
        .then((d) => applyQueue(d.downloadStatus.queue))
        .catch(console.error);
    }
    poll(); // immediate first fetch
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  // Tauri real-time event — supplements the poller for instant UI badge updates.
  // The payload is a lighter shape (no chapter name/manga), so we only use it
  // for active download progress, not for completion detection.
  useEffect(() => {
    type DlPayload = { chapterId: number; mangaId: number; progress: number }[];
    const unsub = listen<DlPayload>("download-progress", (e) => {
      setActiveDownloads(e.payload);
    });
    return () => { unsub.then((fn) => fn()); };
  }, [setActiveDownloads]);

  return (
    <div className={s.root}>
      {!activeChapter && <TitleBar />}
      <div className={s.content}>
        {activeChapter ? <Reader /> : <Layout />}
      </div>
      {settingsOpen && <Settings />}
      <MangaPreview />
      <Toaster />
    </div>
  );
}