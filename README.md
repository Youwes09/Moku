<div align="center">
  <img src="src/assets/rounded-logo.png" width="96" />
  <h1>Moku</h1>
  <p>A fast, minimal manga reader for <a href="https://github.com/Suwayomi/Suwayomi-Server">Suwayomi-Server</a>.<br/>Built with Tauri v2 and React.</p>

  <table>
    <tr>
      <td><img src=".github/screenshots/Library-Page.png" width="100%" /></td>
      <td><img src=".github/screenshots/Libary-Browse.png" width="100%" /></td>
      <td><img src=".github/screenshots/Series-Detail.png" width="100%" /></td>
    </tr>
    <tr>
      <td><img src=".github/screenshots/Search-Bar.png" width="100%" /></td>
      <td><img src=".github/screenshots/Download-Manager.png" width="100%" /></td>
      <td><img src=".github/screenshots/Settings-1.png" width="100%" /></td>
    </tr>
  </table>
</div>

---

## Features

### Reader
- **Single**, **double-page**, and **longstrip** reading modes
- **Infinite longstrip** — when Auto mode is enabled, the next chapter's pages are appended directly into the scroll without any re-render or gap; the entire series flows as one seamless ribbon
- Fit modes: fit width, fit height, fit screen, and 1:1 original
- Per-series zoom control via Ctrl+scroll or a slider popover
- RTL / LTR reading direction toggle
- Configurable page gaps
- Full keyboard navigation with rebindable keybinds
- UI auto-hides after 3 seconds of inactivity; reappears on cursor movement near edges
- Chapter-relative page counter that updates live as you scroll through the infinite strip
- Auto-mark chapters as read when the last page is reached

### Library
- Grid view of your entire manga collection with lazy-loaded cover art
- Filter tabs: **Saved**, **Downloaded**, and **All**
- Genre tag filter chips — multi-select to narrow by any combination of tags
- In-line search
- Context menu: open, add/remove from library

### Series Detail
- Cover, author, artist, status badge, genres, and synopsis
- Read progress bar with percentage
- Continue / Start / Re-read button that picks up exactly where you left off (including mid-chapter page)
- Chapter list with scanlator, upload date, and in-progress page indicator
- **Grid view** — displays all chapters as numbered tiles; read/unread/in-progress states are visually distinct at a glance; switches between list and grid with a single click
- Sort by newest or oldest first
- Jump-to-chapter input
- Bulk download menu: from current chapter, unread only, or all
- Per-chapter context menu: mark read/unread, mark all above as read, download, delete, bulk download from here
- Collapsible source details panel with source ID, language, and source migration

### Search
- Cross-source search running up to 3 concurrent requests
- Language filter bar (preferred language default, per-language, or all)
- Results grouped by source with skeleton loading states

### Sources & Extensions
- Browse and search installed sources, grouped by extension with per-language expansion
- Extension manager: install, update, remove, and install from external APK URL
- Repo refresh with update count badge

### Downloads
- Download queue with live progress

### History
- Reading history grouped by day with relative timestamps
- Per-entry thumbnail, chapter name, and last-read page
- Full-text search across titles and chapter names
- One-click clear

---

## Requirements

[Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server) must be running. By default Moku expects it at `http://127.0.0.1:4567`.

> Moku will attempt to launch the server automatically on startup if the `suwayomi-server` binary is on your `PATH`.

---

## Installation

**Nix (recommended)**

```bash
nix run github:Youwes09/moku
```

Add to your flake:

```nix
inputs.moku.url = "github:Youwes09/moku";
```

**From source**

```bash
git clone https://github.com/Youwes09/moku
cd moku
nix build
./result/bin/moku
```

---

## Development

```bash
nix develop
pnpm install
pnpm tauri:dev
```

> `tauri:dev` uses `src-tauri/tauri.dev.conf.json` to point at the Vite dev server, keeping the release build config clean for `nix build`.

---


## Stack

| | |
|---|---|
| [Tauri v2](https://tauri.app) | Native app shell |
| [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org) | UI |
| [Vite](https://vitejs.dev) | Frontend bundler |
| [Zustand](https://zustand-demo.pmnd.rs) | State management |
| [Phosphor Icons](https://phosphoricons.com) | Icon set |
| [Crane](https://github.com/ipetkov/crane) | Nix Rust builds |

---

## License

Distributed under the [Apache 2.0 License](./LICENSE).

---

## Disclaimer

Moku does not host or distribute any content. The developers have no affiliation with any content providers accessible through connected sources.