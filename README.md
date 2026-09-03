<div align="center">
  <img src="docs/banner.svg" width="100%" alt="Moku" />
</div>

<div align="center">

[![Release](https://www.shieldcn.dev/github/release/moku-project/Moku.svg?variant=outline&size=default)](https://github.com/moku-project/Moku/releases/latest)
![GitHub Downloads](https://www.shieldcn.dev/github/downloads/moku-project/Moku.svg?variant=outline&size=default)
[![Stars](https://www.shieldcn.dev/github/stars/moku-project/Moku.svg?variant=outline&size=default)](https://github.com/moku-project/Moku)
[![Discord](https://www.shieldcn.dev/discord/members/x97hj8zR72.svg?variant=outline&size=default)](https://discord.gg/x97hj8zR72)

</div>

<br/>

Moku is a fast, minimal manga, novel and anime reader. It's a lightweight Tauri frontend for the [Tsunagu](https://github.com/moku-project/Tsunagu) backend — no Electron overhead. The desktop builds bundle Tsunagu and manage it for you.

---

## Screenshots

<div align="center">
  <img src="docs/screenshots/Moku-Home.png" width="100%" alt="Home" />
</div>

<div align="center">
  <img src="docs/screenshots/Moku-Search.png" width="49%" alt="Search" />
  <img src="docs/screenshots/Moku-TagSearch.png" width="49%" alt="Tag Search" />
  <img src="docs/screenshots/Moku-Settings.png" width="49%" alt="Settings" />
  <img src="docs/screenshots/Moku-Preview.png" width="49%" alt="Preview" />
  <img src="docs/screenshots/Moku-Downloads.png" width="49%" alt="Downloads" />
  <img src="docs/screenshots/Moku-ReaderSettings.png" width="49%" alt="Reader Settings" />
</div>

<div align="center">
  <a href="docs/screenshots">View all screenshots →</a>
</div>

---

## Features

- **Manga, novels and anime** — one library, one reader shell; the right viewer (pages, scrolling text, or video player) mounts per title
- **Library management** — organize titles into folders, track unread counts, filter by genre
- **Per-folder sorting & filtering** — each folder has its own independent sort (unread, A–Z, recently read, latest chapter, and more) and publication status filter (Ongoing, Completed, Hiatus, etc.)
- **Built-in reader** — single page, long strip, configurable fit modes, customizable keybinds; AniSkip intro/outro markers for anime
- **Tracking** — link titles to AniList, two-way progress sync
- **Extension support** — install and manage source extensions directly from the app; compatible with Mihon/Tachiyomi- and Aniyomi-format extension repositories, plus LNReader
- **Download management** — queue and monitor chapter downloads with progress toasts
- **Automation** — pre-download titles automatically and optionally delete chapters after reading (accessible from Series Detail)
- **Discord Rich Presence** — shows title, current chapter, and elapsed timer in your Discord status; configurable in Settings → General
- **Bundled backend** — the desktop app launches and supervises Tsunagu for you; no separate install
- **Multiple themes** — Dark, Light, Midnight, Warm, High Contrast, and more
- **Auto-updates** — in-app update checker with silent background notifications
- **Improved NSFW filtering** — expanded tag parser gives the Hide NSFW setting better coverage across sources

---

## Installation

<div align="center">

![Runs on Windows](https://www.shieldcn.dev/badge/Runs%20on-Windows-0078D4.svg?logo=windows&logoColor=fff)
![Runs on Linux](https://www.shieldcn.dev/badge/Runs%20on-Linux-FCC624.svg?logo=linux&logoColor=000)
![Runs on macOS](https://www.shieldcn.dev/badge/Runs%20on-MacOS-000000.svg?mode=light&logo=apple&logoColor=fff)

</div>

### Windows

**winget:**

```powershell
winget install Moku.Moku
```

> Thanks to [@frozenKelp](https://github.com/frozenKelp) for setting up and maintaining the winget package through v0.9.0.

Or download the `.exe` installer from the [releases page](https://github.com/moku-project/Moku/releases/latest). The Tsunagu backend and a JRE are bundled.

### Linux (Nix)

```bash
nix run github:moku-project/Moku
```

Add to your flake:

```nix
inputs.moku.url = "github:moku-project/Moku";
```

The Nix app pulls the Tsunagu backend from its flake and launches it for you. AppImage / deb packaging is a work in progress.

### macOS

Download the `.dmg` from the [releases page](https://github.com/moku-project/Moku/releases/latest).

> **Note:** Builds are ad-hoc signed. On first launch you may need to run:
> ```bash
> xattr -rd com.apple.quarantine /Applications/Moku.app
> ```

---

## Requirements

The desktop and Nix builds bundle and launch [Tsunagu](https://github.com/moku-project/Tsunagu) automatically. To run against your own instance instead, start Tsunagu separately — Moku connects to `http://127.0.0.1:6007` by default.

You can point Moku at any Tsunagu instance — local or remote — via **Settings → General → Server URL**.

---

## Development

**Prerequisites:** [Rust](https://rustup.rs), [Node.js](https://nodejs.org), [pnpm](https://pnpm.io), and [Tauri v2 prerequisites](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/moku-project/Moku
cd Moku
pnpm install
pnpm tauri:dev
```

Or with Nix:

```bash
nix develop
pnpm install
pnpm tauri:dev
```

---

## Stack

| | |
|---|---|
| [Tauri v2](https://tauri.app) | Native app shell |
| [Svelte 5](https://svelte.dev) + [SvelteKit 2](https://kit.svelte.dev) + [TypeScript](https://www.typescriptlang.org) | UI |
| [Vite 8](https://vitejs.dev) | Frontend bundler |
| [Nixpkgs stdenv](https://nixos.org/manual/nixpkgs/stable/) | Nix builds |

---

## Community

Questions, feedback, or just want to hang out — join the Discord.

[![Discord](https://www.shieldcn.dev/discord/members/x97hj8zR72.svg?variant=secondary&size=large)](https://discord.gg/x97hj8zR72)

---

## License

Distributed under the [Apache 2.0 License](./LICENSE).

---

## Disclaimer

Moku does not host or distribute any content. The developers have no affiliation with any content providers accessible through connected sources.