<div align="center">
  <img src="src/assets/Moku-Icon.svg" width="80" />
  <h1>Moku</h1>
  <p>A manga reader frontend for <a href="https://github.com/Suwayomi/Suwayomi-Server">Suwayomi-Server</a>, built with Tauri and React.</p>
</div>

---

## Requirements

- [Suwayomi-Server](https://github.com/Suwayomi/Suwayomi-Server) running on `http://127.0.0.1:4567`

## Installation

### Nix

```bash
nix run github:Youwes09/moku
```

Or add to your flake:

```nix
inputs.moku.url = "github:Youwes09/moku";
```

### From source

```bash
git clone https://github.com/Youwes09/moku
cd moku
nix build
./result/bin/moku
```

## Development

```bash
nix develop
pnpm install
pnpm tauri dev
```

## Stack

- [Tauri v2](https://tauri.app) — app shell
- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org) — UI
- [Vite](https://vitejs.dev) — frontend build
- [Zustand](https://zustand-demo.pmnd.rs) — state
- [Crane](https://github.com/ipetkov/crane) — Nix Rust builds