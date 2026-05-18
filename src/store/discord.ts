import { connect, disconnect, setActivity, clearActivity } from "tauri-plugin-discord-rpc-api";
import { listen }                                           from "@tauri-apps/api/event";
import type { Manga, Chapter }                              from "@types";

const APP_ID         = "1487894643613106298";
const FALLBACK_IMAGE = "moku_logo";
const BUTTONS = [
  { label: "GitHub",  url: "https://github.com/moku-project/Moku" },
  { label: "Discord", url: "https://discord.gg/Jq3pwuNqPp" },
];

let sessionStart: number | null = null;
let unlisten: (() => void) | null = null;

function isPublicUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("https://");
}

function trunc(s: string, max = 128): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function formatChapter(chapter: Chapter): string {
  const n = chapter.chapterNumber;
  return `Chapter ${Number.isInteger(n) ? n : n.toFixed(1)}`;
}

export async function initRpc(): Promise<void> {
  sessionStart = Date.now();
  unlisten = await listen("discord-rpc://running", ({ payload }) => {
    if (payload) setIdle().catch(() => {});
  });
  await connect(APP_ID).catch(() => {});
}

export async function setReading(manga: Manga, chapter: Chapter): Promise<void> {
  await setActivity({
    details:    trunc(manga.title),
    state:      `${formatChapter(chapter)}  ·  Reading`,
    timestamps: { start: sessionStart ?? Date.now() },
    assets: {
      largeImage: isPublicUrl(manga.thumbnailUrl) ? manga.thumbnailUrl : FALLBACK_IMAGE,
      largeText:  trunc(manga.title),
      smallImage: FALLBACK_IMAGE,
      smallText:  "Moku",
    },
    buttons: BUTTONS,
  }).catch(() => {});
}

export async function setIdle(): Promise<void> {
  await setActivity({
    details:    "Browsing",
    timestamps: { start: sessionStart ?? Date.now() },
    assets: { largeImage: FALLBACK_IMAGE, largeText: "Moku" },
    buttons: BUTTONS,
  }).catch(() => {});
}

export async function clearReading(): Promise<void> {
  await clearActivity().catch(() => {});
}

export async function destroyRpc(): Promise<void> {
  unlisten?.();
  unlisten = null;
  sessionStart = null;
  await disconnect().catch(() => {});
}
