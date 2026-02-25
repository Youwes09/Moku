import { useEffect, useRef, useState, useCallback } from "react";
import { X, Book, Image, Sliders, Info, Keyboard, Gear, HardDrives, FolderSimple, Plus, Pencil, Trash, Wrench, PaintBrush } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { gql } from "../../lib/client";
import { GET_DOWNLOADS_PATH } from "../../lib/queries";
import { useStore } from "../../store";
import type { Folder } from "../../store";
import { KEYBIND_LABELS, DEFAULT_KEYBINDS, eventToKeybind, type Keybinds } from "../../lib/keybinds";
import type { Settings, FitMode, Theme } from "../../store";
import s from "./Settings.module.css";

type Tab = "general" | "appearance" | "reader" | "library" | "performance" | "keybinds" | "storage" | "folders" | "about" | "devtools";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general",    label: "General",    icon: <Gear size={14} weight="light" /> },
  { id: "appearance", label: "Appearance", icon: <PaintBrush size={14} weight="light" /> },
  { id: "reader",     label: "Reader",     icon: <Book size={14} weight="light" /> },
  { id: "library",    label: "Library",    icon: <Image size={14} weight="light" /> },
  { id: "performance",label: "Performance",icon: <Sliders size={14} weight="light" /> },
  { id: "keybinds",   label: "Keybinds",   icon: <Keyboard size={14} weight="light" /> },
  { id: "storage",    label: "Storage",    icon: <HardDrives size={14} weight="light" /> },
  { id: "folders",    label: "Folders",    icon: <FolderSimple size={14} weight="light" /> },
  { id: "about",      label: "About",      icon: <Info size={14} weight="light" /> },
  { id: "devtools",   label: "Dev Tools",  icon: <Wrench size={14} weight="light" /> },
];

// ── Primitives ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <label className={s.toggleRow}>
      <div className={s.toggleInfo}>
        <span className={s.toggleLabel}>{label}</span>
        {description && <span className={s.toggleDesc}>{description}</span>}
      </div>
      <button role="switch" aria-checked={checked}
        className={[s.toggle, checked ? s.toggleOn : ""].join(" ")}
        onClick={() => onChange(!checked)}>
        <span className={s.toggleThumb} />
      </button>
    </label>
  );
}

function Stepper({ value, onChange, min, max, step = 1, label, description }: {
  value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; label: string; description?: string;
}) {
  return (
    <div className={s.stepRow}>
      <div className={s.toggleInfo}>
        <span className={s.toggleLabel}>{label}</span>
        {description && <span className={s.toggleDesc}>{description}</span>}
      </div>
      <div className={s.stepControls}>
        <button className={s.stepBtn} onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>−</button>
        <span className={s.stepVal}>{value}</span>
        <button className={s.stepBtn} onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>+</button>
      </div>
    </div>
  );
}

function SelectRow({ value, options, onChange, label, description }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={s.stepRow}>
      <div className={s.toggleInfo}>
        <span className={s.toggleLabel}>{label}</span>
        {description && <span className={s.toggleDesc}>{description}</span>}
      </div>
      <div className={s.selectWrap} ref={ref}>
        <button className={s.selectBtn} onClick={() => setOpen((o) => !o)}>
          <span>{selected?.label ?? value}</span>
          <svg className={[s.selectCaret, open ? s.selectCaretOpen : ""].join(" ")} width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M0 0l5 6 5-6" fill="currentColor" />
          </svg>
        </button>
        {open && (
          <div className={s.selectMenu}>
            {options.map((o) => (
              <button
                key={o.value}
                className={[s.selectOption, o.value === value ? s.selectOptionActive : ""].join(" ")}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TextRow({ value, onChange, label, description, placeholder }: {
  value: string; onChange: (v: string) => void;
  label: string; description?: string; placeholder?: string;
}) {
  return (
    <div className={s.stepRow}>
      <div className={s.toggleInfo}>
        <span className={s.toggleLabel}>{label}</span>
        {description && <span className={s.toggleDesc}>{description}</span>}
      </div>
      <input className={s.textInput} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} spellCheck={false} />
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function GeneralTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Interface Scale</p>
        <div className={s.scaleRow}>
          <input type="range" min={70} max={150} step={5}
            value={settings.uiScale}
            onChange={(e) => update({ uiScale: Number(e.target.value) })}
            className={s.scaleSlider} />
          <span className={s.scaleVal}>{settings.uiScale}%</span>
          <button className={s.stepBtn}
            onClick={() => update({ uiScale: 100 })}
            disabled={settings.uiScale === 100} title="Reset">↺</button>
        </div>
        <p className={s.scaleHint}>
          {[70, 80, 90, 100, 110, 125, 150].map((v) => (
            <button key={v}
              className={[s.scalePreset, settings.uiScale === v ? s.scalePresetActive : ""].join(" ")}
              onClick={() => update({ uiScale: v })}>{v}%</button>
          ))}
        </p>
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Server</p>
        <TextRow label="Server URL" description="Base URL of your Suwayomi instance"
          value={settings.serverUrl ?? "http://localhost:4567"}
          onChange={(v) => update({ serverUrl: v })}
          placeholder="http://localhost:4567" />
        <TextRow label="Server binary" description="Path or command to launch tachidesk-server"
          value={settings.serverBinary}
          onChange={(v) => update({ serverBinary: v })}
          placeholder="tachidesk-server" />
        <Toggle label="Auto-start server"
          description="Launch tachidesk-server when Moku opens"
          checked={settings.autoStartServer}
          onChange={(v) => update({ autoStartServer: v })} />
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Inactivity</p>
        <SelectRow
          label="Idle screen timeout"
          description="Show the Moku idle splash after this much inactivity. Set to Never to disable."
          value={String(settings.idleTimeoutMin ?? 5)}
          options={[
            { value: "0",  label: "Never"    },
            { value: "1",  label: "1 minute" },
            { value: "2",  label: "2 minutes" },
            { value: "5",  label: "5 minutes" },
            { value: "10", label: "10 minutes" },
            { value: "15", label: "15 minutes" },
            { value: "30", label: "30 minutes" },
          ]}
          onChange={(v) => update({ idleTimeoutMin: Number(v) })}
        />
      </div>
    </div>
  );
}

function ReaderTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Page Layout</p>
        <SelectRow label="Default layout"
          description="How chapters open by default"
          value={settings.pageStyle === "double" ? "single" : settings.pageStyle}
          options={[
            { value: "single",    label: "Single page" },
            { value: "longstrip", label: "Long strip"  },
          ]}
          onChange={(v) => update({ pageStyle: v as Settings["pageStyle"] })} />
        <SelectRow label="Reading direction"
          description="Left-to-right for most manga, right-to-left for Japanese"
          value={settings.readingDirection}
          options={[
            { value: "ltr", label: "Left to right" },
            { value: "rtl", label: "Right to left" },
          ]}
          onChange={(v) => update({ readingDirection: v as Settings["readingDirection"] })} />
        <Toggle label="Page gap"
          description="Add spacing between pages in longstrip mode"
          checked={settings.pageGap}
          onChange={(v) => update({ pageGap: v })} />
      </div>

      <div className={s.section}>
        <p className={s.sectionTitle}>Fit &amp; Zoom</p>
        <SelectRow label="Default fit mode"
          description="How pages are sized to fit the screen"
          value={settings.fitMode ?? "width"}
          options={[
            { value: "width",    label: "Fit width"      },
            { value: "height",   label: "Fit height"     },
            { value: "screen",   label: "Fit screen"     },
            { value: "original", label: "Original (1:1)" },
          ]}
          onChange={(v) => update({ fitMode: v as FitMode })} />
        <div className={s.stepRow}>
          <div className={s.toggleInfo}>
            <span className={s.toggleLabel}>Max page width</span>
            <span className={s.toggleDesc}>Pixel cap for fit-width mode. Ctrl+scroll in reader to adjust live.</span>
          </div>
          <div className={s.stepControls}>
            <button className={s.stepBtn} onClick={() => update({ maxPageWidth: Math.max(200, (settings.maxPageWidth ?? 900) - 100) })}>−</button>
            <span className={s.stepVal}>{settings.maxPageWidth ?? 900}px</span>
            <button className={s.stepBtn} onClick={() => update({ maxPageWidth: Math.min(2400, (settings.maxPageWidth ?? 900) + 100) })}>+</button>
          </div>
        </div>
        <Toggle label="Optimize contrast"
          description="Use webkit-optimize-contrast rendering (sharper on low-DPI)"
          checked={settings.optimizeContrast}
          onChange={(v) => update({ optimizeContrast: v })} />
      </div>

      <div className={s.section}>
        <p className={s.sectionTitle}>Behaviour</p>
        <Toggle label="Auto-mark chapters read"
          description="Mark a chapter as read when you reach the last page"
          checked={settings.autoMarkRead}
          onChange={(v) => update({ autoMarkRead: v })} />
        <Toggle label="Auto-advance chapters"
          description="Automatically open the next chapter at the end of a long strip"
          checked={settings.autoNextChapter ?? false}
          onChange={(v) => update({ autoNextChapter: v })} />
        <Stepper label="Pages to preload"
          description="Images loaded ahead of the current page"
          value={settings.preloadPages} min={0} max={10}
          onChange={(v) => update({ preloadPages: v })} />
      </div>
    </div>
  );
}

function LibraryTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const clearHistory = useStore((s) => s.clearHistory);
  const historyLen   = useStore((s) => s.history.length);
  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Display</p>
        <Toggle label="Crop cover images"
          description="Fill grid cells — may crop cover edges"
          checked={settings.libraryCropCovers}
          onChange={(v) => update({ libraryCropCovers: v })} />
        <Toggle label="Show NSFW sources"
          description="Display adult content sources in the sources list"
          checked={settings.showNsfw}
          onChange={(v) => update({ showNsfw: v })} />
        <Stepper label="Initial cards to display"
          description="Cards shown before 'Show more' appears"
          value={settings.libraryPageSize} min={12} max={200} step={12}
          onChange={(v) => update({ libraryPageSize: v })} />
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Chapters</p>
        <SelectRow label="Default sort direction"
          value={settings.chapterSortDir}
          options={[
            { value: "desc", label: "Newest first" },
            { value: "asc",  label: "Oldest first" },
          ]}
          onChange={(v) => update({ chapterSortDir: v as Settings["chapterSortDir"] })} />
        <Stepper label="Chapters per page"
          description="Chapter list pagination size"
          value={settings.chapterPageSize} min={10} max={100} step={5}
          onChange={(v) => update({ chapterPageSize: v })} />
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Extensions</p>
        <SelectRow label="Preferred language"
          description="Language variant shown first when an extension has multiple"
          value={settings.preferredExtensionLang ?? "en"}
          options={[
            { value: "en",      label: "English"                  },
            { value: "es",      label: "Spanish"                  },
            { value: "fr",      label: "French"                   },
            { value: "de",      label: "German"                   },
            { value: "pt-br",   label: "Portuguese (BR)"          },
            { value: "it",      label: "Italian"                  },
            { value: "ru",      label: "Russian"                  },
            { value: "ar",      label: "Arabic"                   },
            { value: "tr",      label: "Turkish"                  },
            { value: "zh",      label: "Chinese (Simplified)"     },
            { value: "zh-hant", label: "Chinese (Traditional)"    },
            { value: "ko",      label: "Korean"                   },
            { value: "ja",      label: "Japanese"                 },
            { value: "id",      label: "Indonesian"               },
            { value: "vi",      label: "Vietnamese"               },
            { value: "th",      label: "Thai"                     },
            { value: "pl",      label: "Polish"                   },
            { value: "nl",      label: "Dutch"                    },
          ]}
          onChange={(v) => update({ preferredExtensionLang: v })} />
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>History</p>
        <div className={s.stepRow}>
          <div className={s.toggleInfo}>
            <span className={s.toggleLabel}>Reading history</span>
            <span className={s.toggleDesc}>{historyLen} entries stored</span>
          </div>
          <button className={s.dangerBtn} onClick={clearHistory} disabled={historyLen === 0}>
            Clear history
          </button>
        </div>
      </div>
    </div>
  );
}

function PerformanceTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Rendering</p>
        <Toggle label="GPU acceleration"
          description="Promote reader and library to compositor layers (recommended)"
          checked={settings.gpuAcceleration}
          onChange={(v) => update({ gpuAcceleration: v })} />
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Idle / Splash Screen</p>
        <Toggle label="Animated card background"
          description="Show floating manga cards on the splash and idle screens. Disable if the animation feels slow on your machine."
          checked={settings.splashCards ?? true}
          onChange={(v) => update({ splashCards: v })} />
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Interface</p>
        <Toggle label="Compact sidebar"
          description="Reduce sidebar icon spacing"
          checked={settings.compactSidebar}
          onChange={(v) => update({ compactSidebar: v })} />
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Reader</p>
        <Stepper
          label="Input debounce"
          description="Delay (ms) before page-turn input is processed. Increase if the reader feels laggy or skips pages. Set to 0 to disable."
          value={settings.readerDebounceMs ?? 120}
          min={0}
          max={500}
          step={20}
          onChange={(v) => update({ readerDebounceMs: v })}
        />
      </div>
    </div>
  );
}

function KeybindsTab({ settings, update, reset }: {
  settings: Settings; update: (p: Partial<Settings>) => void; reset: () => void;
}) {
  const [listening, setListening] = useState<keyof Keybinds | null>(null);

  useEffect(() => {
    if (!listening) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault(); e.stopPropagation();
      const bind = eventToKeybind(e);
      if (!bind) return;
      update({ keybinds: { ...settings.keybinds, [listening!]: bind } });
      setListening(null);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, settings.keybinds]);

  return (
    <div className={s.panel}>
      <div className={s.section}>
        <div className={s.kbHeader}>
          <p className={s.sectionTitle}>Keyboard shortcuts</p>
          <button className={s.resetAllBtn} onClick={reset}>Reset all</button>
        </div>
        <p className={s.kbHint}>Click a key to rebind, then press the new combination.</p>
        <div className={s.kbList}>
          {(Object.keys(KEYBIND_LABELS) as (keyof Keybinds)[]).map((key) => {
            const isListening = listening === key;
            const isDefault   = settings.keybinds[key] === DEFAULT_KEYBINDS[key];
            return (
              <div key={key} className={s.kbRow}>
                <span className={s.kbLabel}>{KEYBIND_LABELS[key]}</span>
                <div className={s.kbRight}>
                  <button
                    className={[s.kbBind, isListening ? s.kbBindListening : ""].join(" ")}
                    onClick={() => setListening(isListening ? null : key)}>
                    {isListening ? "Press key…" : settings.keybinds[key]}
                  </button>
                  <button className={s.kbReset}
                    onClick={() => update({ keybinds: { ...settings.keybinds, [key]: DEFAULT_KEYBINDS[key] } })}
                    disabled={isDefault} title="Reset">↺</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

interface StorageInfo {
  manga_bytes: number;
  total_bytes: number;
  free_bytes:  number;
  path:        string;
}

function StorageBar({ used, limit, total }: { used: number; limit: number | null; total: number }) {
  const cap      = limit ?? total;
  const pctUsed  = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  const critical = pctUsed > 90;
  const warning  = pctUsed > 75;

  return (
    <div className={s.storageBarWrap}>
      <div className={s.storageBar}>
        <div
          className={[s.storageBarFill, critical ? s.storageBarCritical : warning ? s.storageBarWarn : ""].join(" ")}
          style={{ width: `${pctUsed}%` }}
        />
      </div>
      <div className={s.storageBarLabels}>
        <span className={s.storageBarUsed}>{fmtBytes(used)} used</span>
        <span className={s.storageBarFree}>{fmtBytes(Math.max(0, cap - used))} free</span>
      </div>
      {limit !== null && total > 0 && (
        <p className={s.storageBarNote}>Limit {fmtBytes(limit)} of {fmtBytes(total)} total</p>
      )}
    </div>
  );
}

function StorageTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const [info, setInfo]         = useState<StorageInfo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared]   = useState(false);

  const limitGb    = settings.storageLimitGb ?? null;
  const limitBytes = limitGb !== null ? limitGb * 1024 ** 3 : null;

  async function fetchInfo() {
    setLoading(true);
    setError(null);
    try {
      const pathData = await gql<{ settings: { downloadsPath: string } }>(GET_DOWNLOADS_PATH);
      const result = await invoke<StorageInfo>("get_storage_info", {
        downloadsPath: pathData.settings.downloadsPath,
      });
      setInfo(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInfo(); }, []);

  function handleClearCache() {
    setClearing(true);
    caches.keys()
      .then((names) => Promise.all(names.map((n) => caches.delete(n))))
      .catch(() => {})
      .finally(() => {
        setClearing(false);
        setCleared(true);
        setTimeout(() => setCleared(false), 2500);
        fetchInfo();
      });
  }

  const mangaBytes = info?.manga_bytes ?? 0;
  const totalBytes = info?.total_bytes ?? 0;
  const freeBytes  = info?.free_bytes  ?? 0;

  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Disk Usage</p>
        {loading && <p className={s.storageLoading}>Reading filesystem…</p>}
        {error   && <p className={s.storageLoading} style={{ color: "var(--color-error)" }}>{error}</p>}
        {!loading && !error && info && (
          <>
            <StorageBar used={mangaBytes} limit={limitBytes} total={totalBytes} />
            <div className={s.storageLegend}>
              <div className={s.storageLegendRow}>
                <span className={[s.storageDot, s.storageDotManga].join(" ")} />
                <span className={s.storageLegendLabel}>Downloaded manga</span>
                <span className={s.storageLegendVal}>{fmtBytes(mangaBytes)}</span>
              </div>
              <div className={s.storageLegendRow}>
                <span className={[s.storageDot, s.storageDotFree].join(" ")} />
                <span className={s.storageLegendLabel}>Drive free</span>
                <span className={s.storageLegendVal}>{fmtBytes(freeBytes)}</span>
              </div>
              <div className={s.storageLegendRow}>
                <span className={[s.storageDot, s.storageDotApp].join(" ")} />
                <span className={s.storageLegendLabel}>Drive total</span>
                <span className={s.storageLegendVal}>{fmtBytes(totalBytes)}</span>
              </div>
            </div>
            <p className={s.storagePathNote}>{info.path}</p>
          </>
        )}
      </div>

      <div className={s.section}>
        <p className={s.sectionTitle}>Storage Limit</p>
        <div className={s.stepRow}>
          <div className={s.toggleInfo}>
            <span className={s.toggleLabel}>Limit download storage</span>
            <span className={s.toggleDesc}>
              {limitGb === null
                ? "No limit — uses full drive capacity"
                : `Warn when downloads exceed ${limitGb} GB`}
            </span>
          </div>
          {limitGb === null ? (
            <button className={s.setLimitBtn} onClick={() => update({ storageLimitGb: 10 })}>
              Set limit
            </button>
          ) : (
            <div className={s.stepControls}>
              <button className={s.stepBtn}
                onClick={() => update({ storageLimitGb: Math.max(1, limitGb - 1) })}
                disabled={limitGb <= 1}>&#8722;</button>
              <span className={s.stepVal}>{limitGb} GB</span>
              <button className={s.stepBtn}
                onClick={() => update({ storageLimitGb: limitGb + 1 })}>+</button>
              <button className={s.kbReset} onClick={() => update({ storageLimitGb: null })} title="Remove limit">↺</button>
            </div>
          )}
        </div>
        {totalBytes > 0 && limitGb !== null && limitBytes !== null && limitBytes > freeBytes && (
          <p className={s.storageLimitHint}>Limit exceeds available free space ({fmtBytes(freeBytes)})</p>
        )}
      </div>

      <div className={s.section}>
        <p className={s.sectionTitle}>Cache</p>
        <div className={s.stepRow}>
          <div className={s.toggleInfo}>
            <span className={s.toggleLabel}>Image cache</span>
            <span className={s.toggleDesc}>Cached page images stored by the webview</span>
          </div>
          <button className={s.dangerBtn} onClick={handleClearCache} disabled={clearing}>
            {cleared ? "Cleared" : clearing ? "Clearing…" : "Clear cache"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Folders tab ───────────────────────────────────────────────────────────────

function FoldersTab() {
  const folders            = useStore((s) => s.settings.folders);
  const addFolder          = useStore((s) => s.addFolder);
  const removeFolder       = useStore((s) => s.removeFolder);
  const renameFolder       = useStore((s) => s.renameFolder);
  const toggleFolderTab    = useStore((s) => s.toggleFolderTab);

  const [newName, setNewName]         = useState("");
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    addFolder(name);
    setNewName("");
  }

  function startEdit(folder: Folder) {
    setEditingId(folder.id);
    setEditingName(folder.name);
  }

  function commitEdit() {
    if (editingId && editingName.trim()) {
      renameFolder(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName("");
  }

  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Manage Folders</p>
        <p className={s.toggleDesc} style={{ padding: "0 var(--sp-3) var(--sp-3)", display: "block" }}>
          Assign manga to folders from the series detail page. Toggle the tab icon to show a folder as a filter tab in the library.
        </p>

        {/* Create new folder */}
        <div className={s.folderCreateRow}>
          <input
            className={s.textInput}
            placeholder="New folder name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            style={{ flex: 1, width: "auto" }}
          />
          <button
            className={s.folderCreateBtn}
            onClick={handleCreate}
            disabled={!newName.trim()}
          >
            <Plus size={13} weight="bold" />
            Create
          </button>
        </div>

        {/* Folder list */}
        {folders.length === 0 ? (
          <p className={s.storageLoading}>No folders yet. Create one above.</p>
        ) : (
          <div className={s.folderList}>
            {folders.map((folder) => (
              <div key={folder.id} className={s.folderRow}>
                {editingId === folder.id ? (
                  <>
                    <input
                      autoFocus
                      className={s.textInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") { setEditingId(null); }
                      }}
                      onBlur={commitEdit}
                      style={{ flex: 1, width: "auto" }}
                    />
                    <button className={s.kbReset} onClick={commitEdit} title="Save">✓</button>
                  </>
                ) : (
                  <>
                    <FolderSimple size={14} weight="light" style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                    <span className={s.folderRowName}>{folder.name}</span>
                    <span className={s.folderRowCount}>{folder.mangaIds.length} manga</span>
                    {/* Show as tab toggle */}
                    <button
                      className={[s.folderTabToggle, folder.showTab ? s.folderTabToggleOn : ""].join(" ")}
                      onClick={() => toggleFolderTab(folder.id)}
                      title={folder.showTab ? "Shown as library tab — click to hide" : "Click to show as library tab"}
                    >
                      {folder.showTab ? "Tab on" : "Tab off"}
                    </button>
                    <button
                      className={s.kbReset}
                      onClick={() => startEdit(folder)}
                      title="Rename"
                    >
                      <Pencil size={12} weight="light" />
                    </button>
                    <button
                      className={[s.kbReset, s.folderDeleteBtn].join(" ")}
                      onClick={() => removeFolder(folder.id)}
                      title="Delete folder"
                    >
                      <Trash size={12} weight="light" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Appearance tab ────────────────────────────────────────────────────────────

const THEMES: { id: Theme; label: string; description: string; swatches: string[] }[] = [
  {
    id: "dark",
    label: "Dark",
    description: "Default near-black",
    swatches: ["#101010", "#151515", "#a8c4a8", "#f0efec"],
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    description: "Darker base, sharper text",
    swatches: ["#080808", "#111111", "#bcd8bc", "#ffffff"],
  },
  {
    id: "light",
    label: "Light",
    description: "Warm off-white",
    swatches: ["#f4f2ee", "#faf8f4", "#2a5a2a", "#1a1916"],
  },
  {
    id: "light-contrast",
    label: "Light Contrast",
    description: "Light with maximum text contrast",
    swatches: ["#ece8e2", "#f5f2ec", "#183818", "#080806"],
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep blue-black tint",
    swatches: ["#0c1020", "#101428", "#a8b4e8", "#eeeef8"],
  },
  {
    id: "warm",
    label: "Warm",
    description: "Amber and sepia tones",
    swatches: ["#16130c", "#1c1810", "#e0b860", "#f5f0e0"],
  },
];

function AppearanceTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  const current = settings.theme ?? "dark";
  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Theme</p>
        <div className={s.themeGrid}>
          {THEMES.map((theme) => {
            const active = current === theme.id;
            return (
              <button
                key={theme.id}
                className={[s.themeCard, active ? s.themeCardActive : ""].join(" ")}
                onClick={() => update({ theme: theme.id })}
                title={theme.description}
              >
                <div className={s.themePreview}>
                  {/* Mini UI preview using the theme swatches */}
                  <div className={s.themePreviewBg} style={{ background: theme.swatches[0] }}>
                    <div className={s.themePreviewSidebar} style={{ background: theme.swatches[1] }} />
                    <div className={s.themePreviewContent}>
                      <div className={s.themePreviewAccent} style={{ background: theme.swatches[2] }} />
                      <div className={s.themePreviewText} style={{ background: theme.swatches[3] + "55" }} />
                      <div className={s.themePreviewText} style={{ background: theme.swatches[3] + "33", width: "60%" }} />
                    </div>
                  </div>
                </div>
                <div className={s.themeCardInfo}>
                  <span className={s.themeCardLabel}>{theme.label}</span>
                  <span className={s.themeCardDesc}>{theme.description}</span>
                </div>
                {active && <span className={s.themeCardCheck}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DevToolsTab() {
  const [splashTriggered, setSplashTriggered] = useState(false);

  function triggerSplash() {
    setSplashTriggered(true);
    setTimeout(() => setSplashTriggered(false), 200);
    (window as any).__mokuShowSplash?.();
  }

  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Splash Screen</p>
        <div className={s.stepRow}>
          <div className={s.toggleInfo}>
            <span className={s.toggleLabel}>Preview idle screen</span>
            <span className={s.toggleDesc}>Show the idle splash — dismiss with any click or key</span>
          </div>
          <button
            className={s.dangerBtn}
            style={{ background: splashTriggered ? "var(--accent-fg)" : undefined,
                     color: splashTriggered ? "var(--bg-base)" : undefined,
                     borderColor: splashTriggered ? "var(--accent-fg)" : undefined,
                     transition: "all 0.15s ease" }}
            onClick={triggerSplash}
          >
            Show idle
          </button>
        </div>
      </div>
      <div className={s.section}>
        <p className={s.sectionTitle}>Build Info</p>
        <div className={s.aboutBlock}>
          <p className={s.aboutLine} style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--text-faint)" }}>
            Mode: {import.meta.env.MODE}
          </p>
          <p className={s.aboutLine} style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "var(--text-faint)", marginTop: "var(--sp-1)" }}>
            Dev: {String(import.meta.env.DEV)}
          </p>
        </div>
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className={s.panel}>
      <div className={s.section}>
        <p className={s.sectionTitle}>Moku</p>
        <div className={s.aboutBlock}>
          <p className={s.aboutLine}>A manga reader frontend for Suwayomi / Tachidesk.</p>
          <p className={s.aboutLine} style={{ color: "var(--text-faint)", marginTop: "var(--sp-2)" }}>
            Built with Tauri + React. Connects to tachidesk-server.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function SettingsModal() {
  const [tab, setTab]      = useState<Tab>("general");
  const closeSettings      = useStore((s) => s.closeSettings);
  const settings           = useStore((s) => s.settings);
  const updateSettings     = useStore((s) => s.updateSettings);
  const resetKeybinds      = useStore((s) => s.resetKeybinds);
  const backdropRef        = useRef<HTMLDivElement>(null);
  const contentBodyRef     = useRef<HTMLDivElement>(null);



  useEffect(() => {
    contentBodyRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => { if (e.target === backdropRef.current) closeSettings(); },
    [closeSettings]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSettings(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings]);

  return (
    <div className={s.backdrop} ref={backdropRef} onClick={handleBackdrop}>
      <div className={s.modal} role="dialog" aria-label="Settings">
        <div className={s.sidebar}>
          <p className={s.modalTitle}>Settings</p>
          <nav className={s.nav}>
            {TABS.map((t) => (
              <button key={t.id}
                className={[s.navItem, tab === t.id ? s.navActive : ""].join(" ")}
                onClick={() => setTab(t.id)}>
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className={s.content}>
          <div className={s.contentHeader}>
            <p className={s.contentTitle}>{TABS.find((t) => t.id === tab)?.label}</p>
            <button className={s.closeBtn} onClick={closeSettings}><X size={15} weight="light" /></button>
          </div>
          <div className={s.contentBody} ref={contentBodyRef}>
            {tab === "general"     && <GeneralTab     settings={settings} update={updateSettings} />}
            {tab === "appearance"  && <AppearanceTab  settings={settings} update={updateSettings} />}
            {tab === "reader"      && <ReaderTab      settings={settings} update={updateSettings} />}
            {tab === "library"     && <LibraryTab     settings={settings} update={updateSettings} />}
            {tab === "performance" && <PerformanceTab settings={settings} update={updateSettings} />}
            {tab === "keybinds"    && <KeybindsTab    settings={settings} update={updateSettings} reset={resetKeybinds} />}
            {tab === "storage"     && <StorageTab     settings={settings} update={updateSettings} />}
            {tab === "folders"     && <FoldersTab />}
            {tab === "about"       && <AboutTab />}
            {tab === "devtools"    && <DevToolsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}