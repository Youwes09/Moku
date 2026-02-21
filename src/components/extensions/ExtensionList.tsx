import { useEffect, useState, useMemo } from "react";
import { MagnifyingGlass, ArrowsClockwise, Plus, CircleNotch, CaretRight, CaretDown } from "@phosphor-icons/react";
import { gql, thumbUrl } from "../../lib/client";
import {
  GET_EXTENSIONS, FETCH_EXTENSIONS, UPDATE_EXTENSION, INSTALL_EXTERNAL_EXTENSION,
} from "../../lib/queries";
import { useStore } from "../../store";
import type { Extension } from "../../lib/types";
import s from "./ExtensionList.module.css";

type Filter = "installed" | "available" | "updates" | "all";

// Strip language tag suffix e.g. "MangaDex (EN)" → "MangaDex"
function baseName(name: string): string {
  return name.replace(/\s*\([A-Z0-9-]{2,10}\)\s*$/, "").trim();
}

interface ExtGroup {
  base: string;
  primary: Extension;
  variants: Extension[]; // all variants excluding primary
}

export default function ExtensionList() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState<Filter>("installed");
  const [search, setSearch]         = useState("");
  const [working, setWorking]       = useState<Set<string>>(new Set());
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [externalUrl, setExternalUrl] = useState("");
  const [showExternal, setShowExternal] = useState(false);
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

  const mutate = async (fn: () => Promise<unknown>, pkgName: string) => {
    setWorking((p) => new Set(p).add(pkgName));
    await fn().catch(console.error);
    await load();
    setWorking((p) => { const n = new Set(p); n.delete(pkgName); return n; });
  };

  async function installExternal() {
    if (!externalUrl.trim()) return;
    await gql(INSTALL_EXTERNAL_EXTENSION, { url: externalUrl.trim() }).catch(console.error);
    setExternalUrl("");
    setShowExternal(false);
    await load();
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

  // Group by base name. Primary is the preferred/en/first variant.
  // variants contains only the non-primary ones for the expanded list.
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
          <button className={s.iconBtn} onClick={() => setShowExternal(!showExternal)} title="Install from URL">
            <Plus size={14} weight="light" />
          </button>
          <button className={s.iconBtn} onClick={fetchFromRepo} disabled={refreshing} title="Refresh repo">
            <ArrowsClockwise size={14} weight="light" className={refreshing ? "anim-spin" : ""} />
          </button>
        </div>
      </div>

      {showExternal && (
        <div className={s.externalRow}>
          <input className={s.externalInput} placeholder="APK URL"
            value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && installExternal()} autoFocus />
          <button className={s.installBtn} onClick={installExternal}>Install</button>
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
                      {isExpanded
                        ? <CaretDown size={12} weight="light" />
                        : <CaretRight size={12} weight="light" />}
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