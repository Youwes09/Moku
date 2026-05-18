import { LazyStore } from "@tauri-apps/plugin-store";

const settingsStore = new LazyStore("settings.json", { autoSave: false });
const libraryStore  = new LazyStore("library.json",  { autoSave: false });
const updatesStore  = new LazyStore("updates.json",  { autoSave: false });
const backupsStore  = new LazyStore("backups.json",  { autoSave: false });

export interface PersistedData {
  settings:             any;
  storeVersion:         number | null;
  history:              any[];
  bookmarks:            any[];
  markers:              any[];
  readLog:              any[];
  readingStats:         any | null;
  dailyReadCounts:      Record<string, number>;
  libraryUpdates:       any[];
  lastLibraryRefresh:   number;
  acknowledgedUpdateIds: number[];
}

export async function loadAllStores(): Promise<PersistedData> {
  const migrated = await migrateFromLocalStorage();
  if (migrated) return migrated;

  const [sv, s, hist, bk, mk, rl, rs, dc, lu, llr, au] = await Promise.all([
    settingsStore.get<number>("storeVersion"),
    settingsStore.get<any>("settings"),
    libraryStore.get<any[]>("history"),
    libraryStore.get<any[]>("bookmarks"),
    libraryStore.get<any[]>("markers"),
    libraryStore.get<any[]>("readLog"),
    libraryStore.get<any>("readingStats"),
    libraryStore.get<Record<string, number>>("dailyReadCounts"),
    updatesStore.get<any[]>("libraryUpdates"),
    updatesStore.get<number>("lastLibraryRefresh"),
    updatesStore.get<number[]>("acknowledgedUpdateIds"),
  ]);

  return {
    storeVersion:          sv   ?? null,
    settings:              s    ?? null,
    history:               hist ?? [],
    bookmarks:             bk   ?? [],
    markers:               mk   ?? [],
    readLog:               rl   ?? [],
    readingStats:          rs   ?? null,
    dailyReadCounts:       dc   ?? {},
    libraryUpdates:        lu   ?? [],
    lastLibraryRefresh:    llr  ?? 0,
    acknowledgedUpdateIds: au   ?? [],
  };
}

async function migrateFromLocalStorage(): Promise<PersistedData | null> {
  try {
    const raw = localStorage.getItem("moku-store");
    if (!raw) return null;
    const data = JSON.parse(raw);

    await Promise.all([
      persistSettings({ settings: data.settings ?? null, storeVersion: data.storeVersion ?? 1 }),
      persistLibrary({
        history:         data.history         ?? [],
        bookmarks:       data.bookmarks       ?? [],
        markers:         data.markers         ?? [],
        readLog:         data.readLog         ?? [],
        readingStats:    data.readingStats    ?? null,
        dailyReadCounts: data.dailyReadCounts ?? {},
      }),
      persistUpdates({
        libraryUpdates:        data.libraryUpdates        ?? [],
        lastLibraryRefresh:    data.lastLibraryRefresh    ?? 0,
        acknowledgedUpdateIds: data.acknowledgedUpdateIds ?? [],
      }),
    ]);

    localStorage.removeItem("moku-store");

    return {
      storeVersion:          data.storeVersion          ?? null,
      settings:              data.settings              ?? null,
      history:               data.history               ?? [],
      bookmarks:             data.bookmarks             ?? [],
      markers:               data.markers               ?? [],
      readLog:               data.readLog               ?? [],
      readingStats:          data.readingStats          ?? null,
      dailyReadCounts:       data.dailyReadCounts       ?? {},
      libraryUpdates:        data.libraryUpdates        ?? [],
      lastLibraryRefresh:    data.lastLibraryRefresh    ?? 0,
      acknowledgedUpdateIds: data.acknowledgedUpdateIds ?? [],
    };
  } catch {
    return null;
  }
}

export async function persistSettings(data: { settings: any; storeVersion: number }) {
  await Promise.all([
    settingsStore.set("settings",     data.settings),
    settingsStore.set("storeVersion", data.storeVersion),
  ]);
  await settingsStore.save();
}

export async function persistLibrary(data: {
  history:         any[];
  bookmarks:       any[];
  markers:         any[];
  readLog:         any[];
  readingStats:    any;
  dailyReadCounts: Record<string, number>;
}) {
  await Promise.all([
    libraryStore.set("history",         data.history),
    libraryStore.set("bookmarks",       data.bookmarks),
    libraryStore.set("markers",         data.markers),
    libraryStore.set("readLog",         data.readLog),
    libraryStore.set("readingStats",    data.readingStats),
    libraryStore.set("dailyReadCounts", data.dailyReadCounts),
  ]);
  await libraryStore.save();
}

export async function persistUpdates(data: {
  libraryUpdates:        any[];
  lastLibraryRefresh:    number;
  acknowledgedUpdateIds: number[];
}) {
  await Promise.all([
    updatesStore.set("libraryUpdates",        data.libraryUpdates),
    updatesStore.set("lastLibraryRefresh",     data.lastLibraryRefresh),
    updatesStore.set("acknowledgedUpdateIds",  data.acknowledgedUpdateIds),
  ]);
  await updatesStore.save();
}

export interface BackupEntry { url: string; name: string; }

export async function loadBackups(): Promise<BackupEntry[]> {
  const fromStore = await backupsStore.get<BackupEntry[]>("backupList");
  if (fromStore) return fromStore;
  try {
    const raw = localStorage.getItem("moku_backups");
    if (!raw) return [];
    const migrated: BackupEntry[] = JSON.parse(raw);
    await persistBackups(migrated);
    localStorage.removeItem("moku_backups");
    return migrated;
  } catch { return []; }
}

export async function persistBackups(list: BackupEntry[]): Promise<void> {
  await backupsStore.set("backupList", list);
  await backupsStore.save();
}

export async function resetAuthSettings(): Promise<void> {
  const current = await settingsStore.get<any>("settings") ?? {};
  current.serverAuthMode = "NONE";
  current.serverAuthUser = "";
  current.serverAuthPass = "";
  await settingsStore.set("settings", current);
  await settingsStore.save();
  localStorage.removeItem("moku-credential-vault");
}