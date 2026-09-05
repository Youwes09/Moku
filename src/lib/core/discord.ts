import { platformService }  from '$lib/platform-service'
import { settingsState }    from '$lib/state/settings.svelte'
import type { Manga }       from '$lib/types/manga'
import type { Chapter }     from '$lib/types/chapter'
import type { DiscordPresence } from '$lib/platform-adapters/types'

const REPO_URL = 'https://github.com/moku-project/Moku'

const APP_BUTTONS = [
  { label: 'GitHub',  url: REPO_URL },
  { label: 'Discord', url: 'https://discord.gg/Jq3pwuNqPp' },
]

const FALLBACK_IMAGE = 'moku_logo'

const ACTIVITY_TYPE          = 3

const STATUS_DISPLAY_DETAILS = 2

let sessionStart: number | null = null

let presenceEpoch = 0
const supersede = () => ++presenceEpoch

let lastAmbient: DiscordPresence | null = null
let away = false

async function applyAmbient(payload: DiscordPresence): Promise<void> {
  lastAmbient = payload
  if (away) return
  await platformService.setDiscordPresence(payload)
}

function trunc(s: string, max = 128): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function formatChapter(manga: Manga, chapter: Chapter): string {
  const n = chapter.chapterNumber
  const num = Number.isInteger(n) ? n : n.toFixed(1)
  return manga.contentType === 'ANIME' ? `Episode ${num}` : `Chapter ${num}`
}

async function resolveCover(manga: Manga): Promise<string> {
  return manga.metadata?.coverUrl || FALLBACK_IMAGE
}

function buildReadingPresence(manga: Manga, chapter: Chapter, cover: string) {
  return {
    details:    trunc(manga.title),
    state:      `${formatChapter(manga, chapter)}  ·  ${manga.contentType === 'ANIME' ? 'Watching' : 'Reading'}`,
    timestamps: { start: sessionStart ?? Date.now() },
    assets: {
      largeImage: cover,
      largeText:  trunc(manga.title),
      smallImage: 'https://raw.githubusercontent.com/frozenkelp/Moku/sidestep-DRPC-cover-img/static/moku_logo.png',
      smallText:  'Moku',
      smallUrl:   REPO_URL,
    },
    buttons: APP_BUTTONS,
    activityType:      ACTIVITY_TYPE,
    statusDisplayType: STATUS_DISPLAY_DETAILS,
  }
}

export async function initRpc(): Promise<void> {
  if (!platformService.isSupported('discord-rpc')) return
  if (!settingsState.settings.discordRpc) return
  sessionStart = Date.now()
}

export async function destroyRpc(): Promise<void> {
  if (!platformService.isSupported('discord-rpc')) return
  sessionStart = null
  away = false
  supersede()
  await platformService.clearDiscordPresence()
}

export async function setReading(manga: Manga, chapter: Chapter): Promise<void> {
  if (!platformService.isSupported('discord-rpc')) return
  if (!settingsState.settings.discordRpc) return
  const epoch = supersede()

  const cover = await resolveCover(manga)
  if (epoch !== presenceEpoch) return

  await applyAmbient(buildReadingPresence(manga, chapter, cover))
}

export async function setIdle(): Promise<void> {
  if (!platformService.isSupported('discord-rpc')) return
  if (!settingsState.settings.discordRpc) return
  supersede()
  await applyAmbient({
    details:    'Browsing',
    timestamps: { start: sessionStart ?? Date.now() },
    assets: { largeImage: FALLBACK_IMAGE, largeText: 'Moku' },
    buttons: APP_BUTTONS,
    activityType: ACTIVITY_TYPE,
  })
}

export async function setAway(): Promise<void> {
  if (!platformService.isSupported('discord-rpc')) return
  if (!settingsState.settings.discordRpc) return
  supersede()
  away = true
  await platformService.setDiscordPresence({
    details: 'Away',
    assets: { largeImage: FALLBACK_IMAGE, largeText: 'Moku' },
    buttons: APP_BUTTONS,
    activityType: ACTIVITY_TYPE,
  })
}

export async function clearAway(): Promise<void> {
  if (!platformService.isSupported('discord-rpc')) return
  if (!settingsState.settings.discordRpc) return
  if (!away) return
  away = false
  supersede()
  if (lastAmbient) await platformService.setDiscordPresence(lastAmbient)
  else await setIdle()
}

export async function clearReading(): Promise<void> {
  if (!platformService.isSupported('discord-rpc')) return
  if (!settingsState.settings.discordRpc) return
  supersede()
  await platformService.clearDiscordPresence()
}
