import { invoke } from "@tauri-apps/api/core";
import {
  persistSettings,
  persistLibrary,
  persistUpdates,
} from "@core/persistence/persist";

const STORE_FILES = ["settings.json", "library.json", "updates.json"] as const;

export async function exportAppData(): Promise<void> {
  const entries: [string, string][] = await invoke("read_store_files", {
    names: [...STORE_FILES],
  });

  const zip = buildZip(
    entries.map(([name, content]) => ({
      name,
      bytes: new TextEncoder().encode(content),
    }))
  );

  await invoke("export_app_data", { bytes: Array.from(zip) });
}

export async function importAppData(): Promise<void> {
  const raw: number[] = await invoke("import_app_data");
  const files = parseZip(new Uint8Array(raw));

  const decode = (name: string) => {
    const bytes = files.get(name);
    if (!bytes) throw new Error(`Backup is missing ${name}`);
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  const s = decode("settings.json");
  const l = decode("library.json");
  const u = decode("updates.json");

  await Promise.all([
    persistSettings({
      settings:     s.settings     ?? null,
      storeVersion: s.storeVersion ?? 1,
    }),
    persistLibrary({
      history:         l.history         ?? [],
      bookmarks:       l.bookmarks       ?? [],
      markers:         l.markers         ?? [],
      readLog:         l.readLog         ?? [],
      readingStats:    l.readingStats    ?? null,
      dailyReadCounts: l.dailyReadCounts ?? {},
    }),
    persistUpdates({
      libraryUpdates:        u.libraryUpdates        ?? [],
      lastLibraryRefresh:    u.lastLibraryRefresh    ?? 0,
      acknowledgedUpdateIds: u.acknowledgedUpdateIds ?? [],
    }),
  ]);

  await showExitModal();
  invoke("exit_app");
}

function showExitModal(): Promise<void> {
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.className = "s-backdrop";
    backdrop.style.cssText = "z-index:99999";

    const modal = document.createElement("div");
    modal.style.cssText = [
      "background:var(--bg-surface)",
      "border:1px solid var(--border-base)",
      "border-radius:var(--radius-2xl)",
      "box-shadow:0 0 0 1px rgba(255,255,255,0.04) inset,0 24px 80px rgba(0,0,0,0.7),0 8px 24px rgba(0,0,0,0.4)",
      "width:min(400px,calc(100vw - 40px))",
      "display:flex",
      "flex-direction:column",
      "overflow:hidden",
      "animation:s-scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "padding:var(--sp-4) var(--sp-5) var(--sp-3);border-bottom:1px solid var(--border-dim)";

    const title = document.createElement("p");
    title.style.cssText = "margin:0;font-size:var(--text-sm);font-weight:var(--weight-medium);color:var(--text-primary);letter-spacing:0.01em";
    title.textContent = "Import complete";
    header.appendChild(title);

    const body = document.createElement("div");
    body.style.cssText = "padding:var(--sp-4) var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-2)";

    const sub = document.createElement("p");
    sub.style.cssText = "margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide);line-height:var(--leading-snug)";
    sub.textContent = "Your settings have been restored. Moku will close so you can relaunch with the imported data.";

    const counter = document.createElement("p");
    counter.style.cssText = "margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide)";
    counter.textContent = "Closing in 3…";

    body.append(sub, counter);

    const footer = document.createElement("div");
    footer.style.cssText = "padding:var(--sp-3) var(--sp-5);border-top:1px solid var(--border-dim);display:flex;justify-content:flex-end";

    const btn = document.createElement("button");
    btn.className = "s-btn s-btn-danger";
    btn.textContent = "Close now";

    footer.appendChild(btn);
    modal.append(header, body, footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    let secs = 3;
    const tick = setInterval(() => {
      secs--;
      counter.textContent = secs > 0 ? `Closing in ${secs}…` : "Closing…";
      if (secs <= 0) { clearInterval(tick); backdrop.remove(); resolve(); }
    }, 1000);

    btn.addEventListener("click", () => { clearInterval(tick); backdrop.remove(); resolve(); });
  });
}

export async function autoBackupAppData(): Promise<void> {
  try {
    const entries: [string, string][] = await invoke("read_store_files", {
      names: [...STORE_FILES],
    });
    const zip = buildZip(
      entries.map(([name, content]) => ({
        name,
        bytes: new TextEncoder().encode(content),
      }))
    );
    await invoke("auto_backup_app_data", { bytes: Array.from(zip) });
  } catch (e) {
    console.warn("[moku] auto-backup failed:", e);
  }
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localHeader(name: Uint8Array, data: Uint8Array): Uint8Array {
  const buf = new ArrayBuffer(30 + name.byteLength);
  const v   = new DataView(buf);
  v.setUint32(0,  0x04034b50,      true);
  v.setUint16(4,  20,              true);
  v.setUint16(6,  0,               true);
  v.setUint16(8,  0,               true);
  v.setUint16(10, 0,               true);
  v.setUint16(12, 0,               true);
  v.setUint32(14, crc32(data),     true);
  v.setUint32(18, data.byteLength, true);
  v.setUint32(22, data.byteLength, true);
  v.setUint16(26, name.byteLength, true);
  v.setUint16(28, 0,               true);
  new Uint8Array(buf).set(name, 30);
  return new Uint8Array(buf);
}

function centralHeader(name: Uint8Array, data: Uint8Array, offset: number): Uint8Array {
  const buf = new ArrayBuffer(46 + name.byteLength);
  const v   = new DataView(buf);
  v.setUint32(0,  0x02014b50,      true);
  v.setUint16(4,  20,              true);
  v.setUint16(6,  20,              true);
  v.setUint16(8,  0,               true);
  v.setUint16(10, 0,               true);
  v.setUint16(12, 0,               true);
  v.setUint16(14, 0,               true);
  v.setUint32(16, crc32(data),     true);
  v.setUint32(20, data.byteLength, true);
  v.setUint32(24, data.byteLength, true);
  v.setUint16(28, name.byteLength, true);
  v.setUint16(30, 0,               true);
  v.setUint16(32, 0,               true);
  v.setUint16(34, 0,               true);
  v.setUint16(36, 0,               true);
  v.setUint32(38, 0,               true);
  v.setUint32(42, offset,          true);
  new Uint8Array(buf).set(name, 46);
  return new Uint8Array(buf);
}

function eocd(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const buf = new ArrayBuffer(22);
  const v   = new DataView(buf);
  v.setUint32(0,  0x06054b50, true);
  v.setUint16(4,  0,          true);
  v.setUint16(6,  0,          true);
  v.setUint16(8,  count,      true);
  v.setUint16(10, count,      true);
  v.setUint32(12, cdSize,     true);
  v.setUint32(16, cdOffset,   true);
  v.setUint16(20, 0,          true);
  return new Uint8Array(buf);
}

function buildZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const enc     = new TextEncoder();
  const parts:   Uint8Array[] = [];
  const offsets: number[]     = [];
  let pos = 0;

  for (const { name, bytes } of files) {
    const nameBytes = enc.encode(name);
    const lh        = localHeader(nameBytes, bytes);
    offsets.push(pos);
    parts.push(lh, bytes);
    pos += lh.byteLength + bytes.byteLength;
  }

  const cdParts = files.map(({ name, bytes }, i) =>
    centralHeader(enc.encode(name), bytes, offsets[i])
  );
  const cd = concat(cdParts);

  return concat([...parts, cd, eocd(files.length, cd.byteLength, pos)]);
}

function parseZip(data: Uint8Array): Map<string, Uint8Array> {
  const view  = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const files = new Map<string, Uint8Array>();
  let pos     = 0;

  while (pos + 30 <= data.byteLength && view.getUint32(pos, true) === 0x04034b50) {
    const fnLen = view.getUint16(pos + 26, true);
    const exLen = view.getUint16(pos + 28, true);
    const cSize = view.getUint32(pos + 18, true);
    const name  = new TextDecoder().decode(data.subarray(pos + 30, pos + 30 + fnLen));
    const start = pos + 30 + fnLen + exLen;
    files.set(name, data.subarray(start, start + cSize));
    pos = start + cSize;
  }

  return files;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.byteLength, 0);
  const out   = new Uint8Array(total);
  let pos     = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.byteLength; }
  return out;
}