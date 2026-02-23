import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles/global.css";
import { useStore } from "./store";
import Layout from "./components/layout/Layout";
import Reader from "./components/pages/Reader";
import Settings from "./components/settings/Settings";
import TitleBar from "./components/layout/TitleBar";
import s from "./App.module.css";

export default function App() {
  const activeChapter      = useStore((s) => s.activeChapter);
  const settingsOpen       = useStore((s) => s.settingsOpen);
  const settings           = useStore((s) => s.settings);
  const setActiveDownloads = useStore((s) => s.setActiveDownloads);

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

  // Global Tauri download-progress listener — no polling, always current
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
    </div>
  );
}