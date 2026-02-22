import { useEffect, useState, useMemo } from "react";
import { MagnifyingGlass, ArrowsClockwise, Plus, CircleNotch, CaretRight, CaretDown, X, Check, GitBranch } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import {
  GET_EXTENSIONS, FETCH_EXTENSIONS, UPDATE_EXTENSION, INSTALL_EXTERNAL_EXTENSION,
  GET_SETTINGS, SET_EXTENSION_REPOS,
} from "../../lib/queries";
import { useStore } from "../../store";
import type { Extension } from "../../lib/types";
import s from "./ExtensionList.module.css";

type Filter = "installed" | "available" | "updates" | "all";
type Panel = null | "apk" | "repos";

function baseName(name: string): string {
  return name.replace(/\s*\([A-Z0-9-]{2,10}\)\s*$/, "").trim();
}

interface ExtGroup {
  base: string;
  primary: Extension;
  variants: Extension[];
}

export default function ExtensionList() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState<Filter>("installed");
  const [search, setSearch]         = useState("");
  const [working, setWorking]       = useState<Set<string>>(new Set());
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [panel, setPanel]           = useState<Panel>(null);

  // APK install state
  const [externalUrl, setExternalUrl]     = useState("");
  const [installing, setInstalling]       = useState(false);
  const [installError, setInstallError]   = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);

  // Repo management state
  const [repos, setRepos]             = useState<string[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [newRepoUrl, setNewRepoUrl]   = useState("");
  const [repoError, setRepoError]     = useState<string | null>(null);
  const [savingRepos, setSavingRepos] = useState(false);

  const preferredLang = useStore((s) => s.settings.preferredExtensionLang);

  async function load() {
    return gql<{ extensions: { nodes: Extension[] } }>(GET_EXTENSIONS)
      .then((d) => setExtensions(d.extensions.nodes))
      .catch(console.error);
  }

  async function fetchFromRepo() {
    setRefreshing(true);
    return gql<{ fetchExtensions: { extensions: Extension[] } }>(FETCH_EXTENSIONS)
      .then((d) => setExtensions(d.fetchExtensions.extensions))
      .catch(console.error)
      .finally(() => setRefreshing(false));
  }

  async function loadRepos() {
    setReposLoading(true);
    try {
      const d = await gql<{ settings: { extensionRepos: string[] } }>(GET_SETTINGS);
      setRepos(d.settings.extensionRepos ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setReposLoading(false);
    }
  }

  async function saveRepos(updated: string[]) {
    setSavingRepos(true);
    try {
      const d = await gql<{ setSettings: { settings: { extensionRepos: string[] } } }>(
        SET_EXTENSION_REPOS, { repos: updated }
      );
      setRepos(d.setSettings.settings.extensionRepos);
    } catch (e: unknown) {
      setRepoError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingRepos(false);
    }
  }

  function addRepo() {
    const url = newRepoUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setRepoError("URL must start with http:// or https://");
      return;
    }
    if (repos.includes(url)) {
      setRepoError("Repo already added");
      return;
    }
    setRepoError(null);
    setNewRepoUrl("");
    saveRepos([...repos, url]);
  }

  function removeRepo(url: string) {
    saveRepos(repos.filter((r) => r !== url));
  }

  const mutate = async (fn: () => Promise<unknown>, pkgName: string) => {
    setWorking((p) => new Set(p).add(pkgName));
    await fn().catch(console.error);
    await load();
    setWorking((p) => { const n = new Set(p); n.delete(pkgName); return n; });
  };

  async function installExternal() {
    const url = externalUrl.trim();
    if (!url) return;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setInstallError("URL must start with http:// or https://");
      return;
    }
    if (!url.endsWith(".apk")) {
      setInstallError("URL must point to an .apk file");
      return;
    }
    setInstalling(true);
    setInstallError(null);
    setInstallSuccess(false);
    try {
      await gql(INSTALL_EXTERNAL_EXTENSION, { url });
      setInstallSuccess(true);
      setExternalUrl("");
      await load();
      setTimeout(() => {
        setPanel(null);
        setInstallSuccess(false);
      }, 1500);
    } catch (e: unknown) {
      setInstallError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setInstalling(false);
    }
  }

  function openPanel(p: Panel) {
    if (panel === p) {
      setPanel(null);
      return;
    }
    setPanel(p);
    setInstallError(null);
    setInstallSuccess(false);
    setExternalUrl("");
    setRepoError(null);
    setNewRepoUrl("");
    if (p === "repos") loadRepos();
  }

  useEffect(() => {
    fetchFromRepo().finally(() => setLoading(false));
  }, []);

  const filtered = extensions.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch = e.name.toLowerCase().includes(q) || e.lang.toLowerCase().includes(q);
    const matchFilter =
      filter === "installed" ? e.isInstalled :
      filter === "available" ? !e.isInstalled :
      filter === "updates"   ? e.hasUpdate : true;
    return matchSearch && matchFilter;
  });

  const groups = useMemo<ExtGroup[]>(() => {
    const map = new Map<string, Extension[]>();
    for (const ext of filtered) {
      const key = baseName(ext.name);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ext);
    }
    return Array.from(map.entries()).map(([base, all]) => {
      const primary =
        all.find((v) => v.lang === preferredLang) ??
        all.find((v) => v.lang === "en") ??
        all[0];
      const variants = all.filter((v) => v.pkgName !== primary.pkgName);
      return { base, primary, variants };
    });
  }, [filtered, preferredLang]);

  const updateCount = extensions.filter((e) => e.hasUpdate).length;

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "installed", label: "Installed" },
    { id: "available", label: "Available" },
    { id: "updates",   label: updateCount > 0 ? `Updates (${updateCount})` : "Updates" },
    { id: "all",       label: "All" },
  ];

  function toggleExpand(base: string) {
    setExpanded((p) => {
      const n = new Set(p);
      n.has(base) ? n.delete(base) : n.add(base);
      return n;
    });
  }

  function renderActions(ext: Extension) {
    if (working.has(ext.pkgName))
      return <CircleNotch size={14} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />;
    if (ext.hasUpdate) return (
      <div className={s.rowActions}>
        <button className={s.actionBtn} onClick={() => mutate(() => gql(UPDATE_EXTENSION, { id: ext.pkgName, update: true }), ext.pkgName)}>Update</button>
        <button className={s.actionBtnDim} onClick={() => mutate(() => gql(UPDATE_EXTENSION, { id: ext.pkgName, uninstall: true }), ext.pkgName)}>Remove</button>
      </div>
    );
    if (ext.isInstalled)
      return <button className={s.actionBtnDim} onClick={() => mutate(() => gql(UPDATE_EXTENSION, { id: ext.pkgName, uninstall: true }), ext.pkgName)}>Remove</button>;
    return <button className={s.actionBtn} onClick={() => mutate(() => gql(UPDATE_EXTENSION, { id: ext.pkgName, install: true }), ext.pkgName)}>Install</button>;
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h1 className={s.heading}>Extensions</h1>
        <div className={s.headerActions}>
          <button
            className={[s.iconBtn, panel === "repos" ? s.iconBtnActive : ""].join(" ").trim()}
            onClick={() => openPanel("repos")} title="Manage repos">
            <GitBranch size={14} weight="light" />
          </button>
          <button
            className={[s.iconBtn, panel === "apk" ? s.iconBtnActive : ""].join(" ").trim()}
            onClick={() => openPanel("apk")} title="Install from URL">
            <Plus size={14} weight="light" />
          </button>
          <button className={s.iconBtn} onClick={fetchFromRepo} disabled={refreshing} title="Refresh repo">
            <ArrowsClockwise size={14} weight="light" className={refreshing ? "anim-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── APK install panel ── */}
      {panel === "apk" && (
        <div className={s.externalPanel}>
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>Install from APK URL</span>
            <button className={s.iconBtn} onClick={() => setPanel(null)}><X size={14} weight="light" /></button>
          </div>
          <div className={s.externalRow}>
            <input
              className={[s.externalInput, installError ? s.externalInputError : ""].join(" ").trim()}
              placeholder="https://example.com/extension.apk"
              value={externalUrl}
              onChange={(e) => { setExternalUrl(e.target.value); setInstallError(null); }}
              onKeyDown={(e) => e.key === "Enter" && !installing && installExternal()}
              autoFocus
              disabled={installing}
            />
            <button
              className={[s.installBtn, installSuccess ? s.installBtnSuccess : ""].join(" ").trim()}
              onClick={installExternal}
              disabled={installing || !externalUrl.trim()}
            >
              {installing
                ? <CircleNotch size={13} weight="light" className="anim-spin" />
                : installSuccess
                  ? <><Check size={13} weight="bold" /> Done</>
                  : "Install"}
            </button>
          </div>
          {installError && <div className={s.panelError}>{installError}</div>}
        </div>
      )}

      {/* ── Repo management panel ── */}
      {panel === "repos" && (
        <div className={s.externalPanel}>
          <div className={s.panelHeader}>
            <span className={s.panelTitle}>Extension Repositories</span>
            <button className={s.iconBtn} onClick={() => setPanel(null)}><X size={14} weight="light" /></button>
          </div>

          {reposLoading ? (
            <div className={s.repoLoading}>
              <CircleNotch size={14} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
            </div>
          ) : (
            <>
              {repos.length === 0 ? (
                <div className={s.repoEmpty}>No repos configured.</div>
              ) : (
                <div className={s.repoList}>
                  {repos.map((url) => (
                    <div key={url} className={s.repoRow}>
                      <span className={s.repoUrl}>{url}</span>
                      <button
                        className={s.repoRemoveBtn}
                        onClick={() => removeRepo(url)}
                        disabled={savingRepos}
                        title="Remove repo"
                      >
                        {savingRepos
                          ? <CircleNotch size={12} weight="light" className="anim-spin" />
                          : <X size={12} weight="bold" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={s.externalRow} style={{ marginTop: "var(--sp-2)" }}>
                <input
                  className={[s.externalInput, repoError ? s.externalInputError : ""].join(" ").trim()}
                  placeholder="https://example.com/index.min.json"
                  value={newRepoUrl}
                  onChange={(e) => { setNewRepoUrl(e.target.value); setRepoError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && !savingRepos && addRepo()}
                  disabled={savingRepos}
                />
                <button
                  className={s.installBtn}
                  onClick={addRepo}
                  disabled={savingRepos || !newRepoUrl.trim()}
                >
                  {savingRepos
                    ? <CircleNotch size={13} weight="light" className="anim-spin" />
                    : "Add"}
                </button>
              </div>
              {repoError && <div className={s.panelError}>{repoError}</div>}
            </>
          )}
        </div>
      )}

      <div className={s.controls}>
        <div className={s.tabs}>
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={[s.tab, filter === f.id ? s.tabActive : ""].join(" ").trim()}>
              {f.label}
            </button>
          ))}
        </div>
        <div className={s.searchWrap}>
          <MagnifyingGlass size={12} className={s.searchIcon} weight="light" />
          <input className={s.search} placeholder="Search"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className={s.empty}>
          <CircleNotch size={16} weight="light" className="anim-spin" style={{ color: "var(--text-faint)" }} />
        </div>
      ) : groups.length === 0 ? (
        <div className={s.empty}>No extensions found.</div>
      ) : (
        <div className={s.list}>
          {groups.map(({ base, primary, variants }) => {
            const isExpanded = expanded.has(base);
            const hasVariants = variants.length > 0;
            return (
              <div key={base} className={s.group}>
                <div className={s.row}>
                  <img src={thumbUrl(primary.iconUrl)} alt={primary.name} className={s.icon}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div className={s.info}>
                    <span className={s.name}>{base}</span>
                    <span className={s.meta}>
                      <span className={s.langTag}>{primary.lang.toUpperCase()}</span>
                      {" "}v{primary.versionName}
                    </span>
                  </div>
                  {primary.hasUpdate && <span className={s.updateBadge}>Update</span>}
                  {renderActions(primary)}
                  {hasVariants && (
                    <button className={s.expandBtn} onClick={() => toggleExpand(base)}
                      title={`${variants.length + 1} languages`}>
                      {isExpanded ? <CaretDown size={12} weight="light" /> : <CaretRight size={12} weight="light" />}
                      <span className={s.expandCount}>{variants.length + 1}</span>
                    </button>
                  )}
                </div>
                {isExpanded && hasVariants && (
                  <div className={s.variants}>
                    {variants.map((v) => (
                      <div key={v.pkgName} className={s.variantRow}>
                        <span className={s.langTag}>{v.lang.toUpperCase()}</span>
                        <span className={s.variantName}>{v.name}</span>
                        <span className={s.variantVersion}>v{v.versionName}</span>
                        {v.hasUpdate && <span className={s.updateBadgeSmall}>↑</span>}
                        <div className={s.variantActions}>{renderActions(v)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}