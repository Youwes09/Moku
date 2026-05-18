<script lang="ts">
  import { untrack } from "svelte";
  import { CircleNotch, X, Check, HardDrives } from "phosphor-svelte";
  import { gql }         from "@api/client";
  import { store, addToast } from "@store/state.svelte";
  import { GET_EXTENSIONS, GET_SOURCES, GET_SETTINGS, GET_LOCAL_MANGA, GET_LIBRARY } from "@api/queries";
  import { SET_EXTENSION_REPOS, INSTALL_EXTERNAL_EXTENSION, FETCH_EXTENSIONS, UPDATE_EXTENSION } from "@api/mutations";
  import type { Extension } from "@types/index";
  import { matchesFilter, groupExtensions, validateUrl, type Filter, type Panel } from "../lib/extensionHelpers";
  import { libraryCountByPkg, type LibraryManga, type SourceNode } from "../lib/extensionLibrary";
  import ExtensionFilters       from "./ExtensionFilters.svelte";
  import ExtensionCard          from "./ExtensionCard.svelte";
  import ExtensionSettingsPanel from "../panels/ExtensionSettingsPanel.svelte";
  import ExtensionLibrary from "./ExtensionLibrary.svelte";

  const anims      = $derived(store.settings.qolAnimations ?? true);
  const cols       = $derived(store.settings.libraryCols   ?? 5);
  const cropCovers = $derived(store.settings.cropCovers    ?? true);
  const statsAlways = $derived(store.settings.statsAlways  ?? false);

  let tabsEl       = $state<HTMLDivElement | undefined>(undefined);
  let tabIndicator = $state({ left: 0, width: 0 });

  function updateIndicator() {
    if (!tabsEl) return;
    const active = tabsEl.querySelector<HTMLElement>(".tab.active");
    if (!active) return;
    tabIndicator = { left: active.offsetLeft, width: active.offsetWidth };
  }

  let extensions: Extension[] = $state([]);
  let localMangaCount = $state(0);
  let loading      = $state(true);
  let refreshing   = $state(false);
  let filter       = $state<Filter>("installed");
  let search       = $state("");
  let langFilter   = $state<string | null>(null);
  let working      = $state(new Set<string>());
  let updatingAll  = $state(false);
  let expanded     = $state(new Set<string>());
  let panel        = $state<Panel>(null);

  type SourceEntry  = { id: string; displayName: string };
  type SettingsTarget = { extensionName: string; iconUrl: string; sources: SourceEntry[] };
  type LibraryTarget  = { pkgName: string; extensionName: string; iconUrl: string };

  let settingsTarget = $state<SettingsTarget | null>(null);
  let libraryTarget  = $state<LibraryTarget | null>(null);
  let sourcesByPkg   = $state<Record<string, SourceEntry[]>>({});
  let libCountByPkg  = $state<Record<string, number>>({});

  $effect(() => { filter; extensions; if (anims) requestAnimationFrame(() => requestAnimationFrame(updateIndicator)); });

  let externalUrl    = $state("");
  let installing     = $state(false);
  let installError   = $state<string | null>(null);
  let installSuccess = $state(false);

  let repos        = $state<string[]>([]);
  let reposLoading = $state(false);
  let newRepoUrl   = $state("");
  let repoError    = $state<string | null>(null);
  let savingRepos  = $state(false);

  async function load() {
    const [extData, srcData, libData] = await Promise.all([
      gql<{ extensions: { nodes: Extension[] } }>(GET_EXTENSIONS).catch(console.error),
      gql<{ sources: { nodes: SourceNode[] } }>(GET_SOURCES).catch(console.error),
      gql<{ mangas: { nodes: LibraryManga[] } }>(GET_LIBRARY).catch(console.error),
    ]);
    if (extData) extensions = extData.extensions.nodes;
    if (srcData) {
      const map: Record<string, SourceEntry[]> = {};
      for (const s of srcData.sources.nodes) {
        if (!s.isConfigurable || !s.extension?.pkgName) continue;
        const pkg = s.extension.pkgName;
        if (!map[pkg]) map[pkg] = [];
        map[pkg].push({ id: s.id, displayName: s.displayName });
      }
      sourcesByPkg = map;
    }
    if (libData && srcData) {
      libCountByPkg = libraryCountByPkg(libData.mangas.nodes, srcData.sources.nodes);
    }
  }

  async function loadLocalManga() {
    const d = await gql<{ mangas: { nodes: { id: number }[] } }>(GET_LOCAL_MANGA).catch(console.error);
    if (d) localMangaCount = d.mangas.nodes.length;
  }

  async function fetchFromRepo() {
    refreshing = true;
    const d = await gql<{ fetchExtensions: { extensions: Extension[] } }>(FETCH_EXTENSIONS)
      .catch(console.error)
      .finally(() => refreshing = false);
    if (d) {
      extensions = d.fetchExtensions.extensions;
      addToast({ kind: "success", title: "Extensions refreshed", body: "Extension list is up to date" });
    }
  }

  async function loadRepos() {
    reposLoading = true;
    try {
      const d = await gql<{ settings: { extensionRepos: string[] } }>(GET_SETTINGS);
      repos = d.settings.extensionRepos ?? [];
    } catch (e) { console.error(e); }
    finally { reposLoading = false; }
  }

  async function saveRepos(updated: string[], intent: "add" | "remove") {
    savingRepos = true;
    try {
      const d = await gql<{ setSettings: { settings: { extensionRepos: string[] } } }>(SET_EXTENSION_REPOS, { repos: updated });
      repos = d.setSettings.settings.extensionRepos;
      addToast(intent === "add"
        ? { kind: "success", title: "Repo added",   body: updated[updated.length - 1] }
        : { kind: "info",    title: "Repo removed", body: repos.find(r => !updated.includes(r)) ?? "" }
      );
    } catch (e: any) {
      repoError = e instanceof Error ? e.message : "Failed to save";
    } finally { savingRepos = false; }
  }

  function addRepo() {
    const url = newRepoUrl.trim();
    const err = validateUrl(url);
    if (err) { repoError = err; return; }
    if (repos.includes(url)) { repoError = "Repo already added"; return; }
    repoError = null; newRepoUrl = "";
    saveRepos([...repos, url], "add");
  }

  function removeRepo(url: string) { saveRepos(repos.filter((r) => r !== url), "remove"); }

  async function mutate(pkgName: string, op: "install" | "update" | "uninstall") {
    working = new Set(working).add(pkgName);
    const label = extensions.find((e) => e.pkgName === pkgName)?.name ?? pkgName;
    const gqlArgs = {
      install:   { id: pkgName, install:   true },
      update:    { id: pkgName, update:    true },
      uninstall: { id: pkgName, uninstall: true },
    }[op];
    try {
      await gql(UPDATE_EXTENSION, gqlArgs);
      await load();
      addToast({
        install:   { kind: "download" as const, title: "Extension installed", body: label },
        update:    { kind: "success"  as const, title: "Extension updated",   body: label },
        uninstall: { kind: "info"     as const, title: "Extension removed",   body: label },
      }[op]);
    } catch (e: any) {
      await load();
      addToast({ kind: "error", title: "Extension error", body: e instanceof Error ? e.message : String(e) });
    } finally {
      working.delete(pkgName); working = new Set(working);
    }
  }

  async function updateAll() {
    const pending = extensions.filter((e) => e.hasUpdate);
    if (!pending.length || updatingAll) return;
    updatingAll = true;
    for (const ext of pending) await mutate(ext.pkgName, "update");
    updatingAll = false;
    addToast({ kind: "success", title: "All extensions updated", body: `${pending.length} extension${pending.length === 1 ? "" : "s"} updated` });
  }

  async function installExternal() {
    const url = externalUrl.trim();
    const err = validateUrl(url, ".apk");
    if (err) { installError = err; return; }
    installing = true; installError = null; installSuccess = false;
    try {
      await gql(INSTALL_EXTERNAL_EXTENSION, { url });
      installSuccess = true; externalUrl = "";
      await load();
      addToast({ kind: "download", title: "Extension installed", body: url.split("/").pop() ?? url });
      setTimeout(() => { panel = null; installSuccess = false; }, 1500);
    } catch (e: any) {
      installError = e instanceof Error ? e.message : "Install failed";
      addToast({ kind: "error", title: "Install failed", body: installError });
    } finally { installing = false; }
  }

  function openPanel(p: Panel) {
    panel = panel === p ? null : p;
    installError = null; installSuccess = false; externalUrl = "";
    repoError = null; newRepoUrl = "";
    if (p === "repos") loadRepos();
  }

  function toggleExpand(base: string) {
    const next = new Set(expanded);
    next.has(base) ? next.delete(base) : next.add(base);
    expanded = next;
  }

  function setFilter(f: Filter) {
    if (f === filter) return;
    filter = f;
    langFilter = null;
  }

  const showLocal = $derived(
    (filter === "installed" || filter === "all") &&
    (search === "" || "local source".includes(search.toLowerCase()))
  );

  const allGroups = $derived(groupExtensions(extensions, store.settings.preferredExtensionLang));

  const groups = $derived(allGroups.filter(({ primary, variants }) => {
    const all = [primary, ...variants];
    const q = search.toLowerCase();
    const matchesSearch = all.some((e) => e.name.toLowerCase().includes(q) || e.lang.toLowerCase().includes(q));
    const matchesTab    = all.some((e) => matchesFilter(e, filter));
    const matchesLang   = langFilter === null || all.some((e) => e.lang === langFilter);
    return matchesSearch && matchesTab && matchesLang;
  }));

  const availableLangs = $derived(
    [...new Set(extensions.filter((e) => matchesFilter(e, filter)).map((e) => e.lang))].sort()
  );

  const updateCount = $derived(extensions.filter((e) => e.hasUpdate).length);

  $effect(() => {
    untrack(async () => {
      loadLocalManga();
      await load();
      loading = false;
      fetchFromRepo();
    });
  });

  $effect(() => {
    if (!panel) return;
    function onMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".ext-panel, .icon-btn")) panel = null;
    }
    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  });

  function focusOnMount(node: HTMLElement) { node.focus(); }
</script>

{#if libraryTarget}
  <ExtensionLibrary
    pkgName={libraryTarget.pkgName}
    extensionName={libraryTarget.extensionName}
    iconUrl={libraryTarget.iconUrl}
    {cols} {cropCovers} {statsAlways} {anims}
    sources={sourcesByPkg[libraryTarget.pkgName] ?? []}
    onBack={() => libraryTarget = null}
    onSettings={() => { settingsTarget = { extensionName: libraryTarget!.extensionName, iconUrl: libraryTarget!.iconUrl, sources: sourcesByPkg[libraryTarget!.pkgName] ?? [] }; }}
  />
{:else}
  <div class="root anim-fade-in">
    <ExtensionFilters
      {filter} {search} {panel} {refreshing} {updateCount} {availableLangs} {langFilter}
      {anims} {tabIndicator} {updatingAll}
      bind:tabsEl
      onFilter={setFilter}
      onSearch={(q) => search = q}
      onLang={(l) => langFilter = l}
      onPanel={openPanel}
      onRefresh={fetchFromRepo}
      onUpdateAll={updateAll}
    />

    {#if panel === "apk"}
      <div class="ext-panel" class:ext-panel-anim={anims}>
        <div class="panel-header">
          <span class="panel-title-wrap"><span class="panel-title">Install from APK URL</span></span>
        </div>
        <div class="ext-row">
          <input
            class="ext-input" class:error={installError}
            placeholder="https://example.com/extension.apk"
            bind:value={externalUrl} disabled={installing}
            oninput={() => installError = null}
            onkeydown={(e) => e.key === "Enter" && !installing && installExternal()}
            use:focusOnMount
          />
          <button class="install-btn" class:success={installSuccess}
            onclick={installExternal} disabled={installing || !externalUrl.trim()}>
            {#if installing}<CircleNotch size={13} weight="light" class="anim-spin" />
            {:else if installSuccess}<Check size={13} weight="bold" /> Done
            {:else}Install{/if}
          </button>
        </div>
        {#if installError}<div class="panel-error">{installError}</div>{/if}
      </div>
    {/if}

    {#if panel === "repos"}
      <div class="ext-panel" class:ext-panel-anim={anims}>
        <div class="panel-header">
          <span class="panel-title-wrap"><span class="panel-title">Extension Repositories</span></span>
        </div>
        {#if reposLoading}
          <div class="repo-loading"><CircleNotch size={14} weight="light" class="anim-spin" style="color:var(--text-faint)" /></div>
        {:else}
          {#if repos.length === 0}
            <div class="repo-empty">No repos configured.</div>
          {:else}
            <div class="repo-list">
              {#each repos as url}
                <div class="repo-row">
                  <span class="repo-url">{url}</span>
                  <button class="repo-remove" onclick={() => removeRepo(url)} disabled={savingRepos} title="Remove repo">
                    {#if savingRepos}<CircleNotch size={12} weight="light" class="anim-spin" />{:else}<X size={12} weight="bold" />{/if}
                  </button>
                </div>
              {/each}
            </div>
          {/if}
          <div class="ext-row">
            <input
              class="ext-input" class:error={repoError}
              placeholder="https://example.com/index.min.json"
              bind:value={newRepoUrl} disabled={savingRepos}
              oninput={() => repoError = null}
              onkeydown={(e) => e.key === "Enter" && !savingRepos && addRepo()}
            />
            <button class="install-btn" onclick={addRepo} disabled={savingRepos || !newRepoUrl.trim()}>
              {#if savingRepos}<CircleNotch size={13} weight="light" class="anim-spin" />{:else}Add{/if}
            </button>
          </div>
          {#if repoError}<div class="panel-error">{repoError}</div>{/if}
        {/if}
      </div>
    {/if}

    {#if loading}
      <div class="empty"><CircleNotch size={16} weight="light" class="anim-spin" style="color:var(--text-faint)" /></div>
    {:else}
      <div class="list">
        {#if showLocal}
          <div class="local-row">
            <div class="local-icon"><HardDrives size={18} weight="bold" /></div>
            <div class="info">
              <span class="name">Local Source</span>
              <span class="meta">Built-in · {localMangaCount} {localMangaCount === 1 ? "manga" : "manga"}</span>
            </div>
            <span class="local-badge">Built-in</span>
          </div>
        {/if}
        {#each groups as { base, primary, variants }}
          <ExtensionCard
            {base} {primary} {variants} {working} {anims}
            sources={sourcesByPkg[primary.pkgName] ?? []}
            libraryCount={libCountByPkg[primary.pkgName] ?? 0}
            expanded={expanded.has(base)}
            onToggle={toggleExpand}
            onMutate={mutate}
            onLibrary={(pkgName, extensionName, iconUrl) => libraryTarget = { pkgName, extensionName, iconUrl }}
          />
        {/each}
        {#if !showLocal && groups.length === 0}
          <div class="empty" style="flex:1">No extensions found.</div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if settingsTarget}
  <ExtensionSettingsPanel
    extensionName={settingsTarget.extensionName}
    iconUrl={settingsTarget.iconUrl}
    sources={settingsTarget.sources}
    onClose={() => settingsTarget = null}
  />
{/if}

<style>
  .root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .list { flex: 1; overflow-y: auto; padding: 0 var(--sp-4) var(--sp-4); display: flex; flex-direction: column; gap: 1px; }
  .empty { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--text-faint); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); }
  :global(.icon-btn) { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  :global(.icon-btn:hover:not(:disabled)) { color: var(--text-primary); border-color: var(--border-strong); }
  :global(.icon-btn-active) { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .ext-panel { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3) var(--sp-6); flex-shrink: 0; border-bottom: 1px solid var(--border-dim); background: var(--bg-raised); opacity: 1; }
  .ext-panel-anim { animation: panelSlide 0.18s cubic-bezier(0.16,1,0.3,1) both; }
  .panel-header { display: flex; align-items: center; padding-bottom: var(--sp-1); }
  .panel-title-wrap { display: inline-flex; align-items: center; background: var(--bg-overlay); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); padding: 2px 8px; }
  .panel-title { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .panel-error { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--color-error); letter-spacing: var(--tracking-wide); padding: 0 2px; }
  .ext-row { display: flex; gap: var(--sp-2); }
  .ext-input { flex: 1; background: var(--bg-base); border: 1px solid var(--border-strong); border-radius: var(--radius-md); padding: 6px var(--sp-3); color: var(--text-primary); font-size: var(--text-sm); outline: none; transition: border-color var(--t-base); }
  .ext-input:focus { border-color: var(--border-focus); }
  .ext-input:disabled { opacity: 0.5; }
  .ext-input.error { border-color: var(--color-error) !important; }
  .install-btn { display: flex; align-items: center; gap: var(--sp-1); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 6px 14px; border-radius: var(--radius-md); background: var(--accent-muted); color: var(--accent-fg); border: 1px solid var(--accent-dim); cursor: pointer; flex-shrink: 0; transition: filter var(--t-base), opacity var(--t-base); white-space: nowrap; }
  .install-btn:hover:not(:disabled) { filter: brightness(1.15); }
  .install-btn:disabled { opacity: 0.5; cursor: default; }
  .install-btn.success { background: rgba(107,143,107,0.2); border-color: var(--accent-fg); color: var(--accent-fg); }
  .repo-loading { display: flex; align-items: center; justify-content: center; padding: var(--sp-2); }
  .repo-empty { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); padding: var(--sp-1) 2px; }
  .repo-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: var(--sp-2); }
  .repo-row { display: flex; align-items: center; gap: var(--sp-2); padding: 6px var(--sp-3); border-radius: var(--radius-md); background: var(--bg-base); border: 1px solid var(--border-dim); }
  .repo-url { flex: 1; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: var(--tracking-wide); }
  .repo-remove { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--radius-sm); color: var(--text-faint); flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .repo-remove:hover:not(:disabled) { color: var(--color-error); background: var(--bg-overlay); }
  @keyframes panelSlide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .local-row { display: flex; align-items: center; gap: var(--sp-3); padding: 8px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; transition: background var(--t-fast), border-color var(--t-fast); margin-bottom: 1px; }
  .local-row:hover { background: var(--bg-raised); border-color: var(--border-dim); }
  .local-icon { width: 32px; height: 32px; border-radius: var(--radius-md); background: var(--accent-muted); border: 1px solid var(--accent-dim); display: flex; align-items: center; justify-content: center; color: var(--accent-fg); flex-shrink: 0; }
  .info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .name { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .local-badge { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; padding: 3px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); color: var(--text-faint); flex-shrink: 0; }
</style>