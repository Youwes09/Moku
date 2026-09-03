<script lang="ts">
  import { untrack } from "svelte";
  import { CircleNotch, X, Check, HardDrives } from "phosphor-svelte";
  import { tsunagu } from "$lib/server-adapters/tsunagu";
  import { addToast }      from "$lib/state/notifications.svelte";
  import { settingsState } from "$lib/state/settings.svelte";
  import type { Extension } from "$lib/server-adapters/types";
  import { matchesFilter, groupExtensions, validateUrl, type Filter, type Panel } from "$lib/components/extensions/lib/extensionHelpers";
  import { libraryCountByPkg, type LibraryManga } from "$lib/components/extensions/lib/extensionLibrary";
  import ExtensionFilters       from "$lib/components/extensions/ExtensionFilters.svelte";
  import ExtensionCard          from "$lib/components/extensions/ExtensionCard.svelte";
  import ExtensionSettingsPanel from "$lib/components/extensions/panels/ExtensionSettingsPanel.svelte";
  import ExtensionLibrary       from "$lib/components/extensions/ExtensionLibrary.svelte";

  const anims      = $derived(settingsState.settings.qolAnimations ?? true);
  const cropCovers  = $derived(settingsState.settings.libraryCropCovers ?? true);
  const statsAlways = $derived(settingsState.settings.libraryStatsAlways ?? false);

  let tabsEl       = $state<HTMLDivElement | undefined>(undefined);
  let tabIndicator = $state({ left: 0, width: 0 });

  function updateIndicator() {
    if (!tabsEl) return;
    const active = tabsEl.querySelector<HTMLElement>(".tab.active");
    if (!active) return;
    tabIndicator = { left: active.offsetLeft, width: active.offsetWidth };
  }

  const PAGE = 60;
  let installedExts: Extension[] = $state([]);
  let browse:        Extension[] = $state([]);
  let browseTotal   = $state(0);
  let browseLanguages = $state<string[]>([]);
  let browseLoading  = $state(false);
  let browseGen      = 0;
  let listEl         = $state<HTMLDivElement | undefined>(undefined);

  let localMangaCount = $state<string>("0");
  let loading      = $state(true);
  let refreshing   = $state(false);
  let filter     = $state<Filter>("installed");
  let search     = $state("");
  let langFilter = $state<string | null>(null);
  const contentTypeFilter = $derived(settingsState.settings.contentTypeFilter);
  let working      = $state(new Set<string>());
  let updatingAll  = $state(false);
  let expanded     = $state(new Set<string>());
  let panel        = $state<Panel>(null);

  const serverTab = $derived(filter === "available" || filter === "all");

  const extensions = $derived(
    filter === "installed" ? installedExts
    : filter === "updates" ? installedExts.filter((e) => e.needsUpdate)
    : browse
  );

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

  async function loadInstalled() {
    const acc: Extension[] = [];
    let offset = 0;
    for (;;) {
      const { items, total } = await tsunagu.extensions({ installed: true, limit: 200, offset });
      acc.push(...items);
      offset += items.length;
      if (items.length === 0 || offset >= total) break;
    }
    installedExts = acc;
  }

  async function loadMoreBrowse(gen = browseGen) {
    if (browseLoading || gen !== browseGen) return;
    if (browse.length > 0 && browse.length >= browseTotal) return;
    browseLoading = true;
    try {
      const { items, total, languages } = await tsunagu.extensions({
        query: search.trim() || undefined,
        contentType: contentTypeFilter === "all" ? undefined : contentTypeFilter,
        lang: langFilter ?? undefined,
        installed: filter === "available" ? false : undefined,
        limit: PAGE,
        offset: browse.length,
      });
      if (gen !== browseGen) return;
      const seen = new Set(browse.map((e) => e.packageName));
      browse = [...browse, ...items.filter((e) => !seen.has(e.packageName))];
      browseTotal = total;
      if (!langFilter && languages?.length) browseLanguages = languages;
    } catch (e) {
      console.error(e);
    } finally {
      if (gen === browseGen) browseLoading = false;
    }
  }

  async function resetBrowse() {
    const gen = ++browseGen;
    browse = [];
    browseTotal = 0;
    browseLoading = false;
    if (!langFilter) browseLanguages = [];
    await loadMoreBrowse(gen);
  }

  function onListScroll() {
    if (!serverTab || !listEl || browseLoading) return;
    if (browse.length >= browseTotal && browseTotal > 0) return;
    if (listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 480) loadMoreBrowse();
  }

  function rebuildSources() {
    const byPkg: Record<string, SourceEntry[]> = {};
    for (const e of installedExts) {
      (byPkg[e.packageName] ??= []).push({ id: e.id, displayName: e.displayName });
    }
    sourcesByPkg = byPkg;
  }

  async function load() {
    try { await loadInstalled(); } catch (e) { console.error(e); }
    rebuildSources();

    const pkgNameOf = (sourceId: string) => installedExts.find((e) => e.id === sourceId)?.packageName;
    try {
      const libraryEntries = await tsunagu.library();
      const mapped: LibraryManga[] = libraryEntries.map((entry) => ({
        id:            entry.id,
        title:         entry.title,
        thumbnailUrl:  entry.thumbnailUrl ?? "",
        unreadCount:   entry.unreadCount,
        downloadCount: entry.downloadCount,
        source:        entry.source ? { id: entry.source.id, displayName: entry.source.displayName } : null,
      }));
      libCountByPkg = libraryCountByPkg(mapped, pkgNameOf);
    } catch (e) {
      console.error(e);
      libCountByPkg = {};
    }
  }

  let rescanning = $state(false);

  async function loadLocalManga() {
    try {
      const found = await tsunagu.rescanLocalMedia();
      localMangaCount = String(found.length);
    } catch { localMangaCount = "0"; }
  }

  async function rescanLocal() {
    if (rescanning) return;
    rescanning = true;
    try {
      const found = await tsunagu.rescanLocalMedia();
      localMangaCount = String(found.length);
      const { loadLibrary } = await import("$lib/state/library.svelte");
      await loadLibrary(true);
      addToast({ kind: "success", title: "Local library rescanned", body: `${found.length} local ${found.length === 1 ? "title" : "titles"}` });
    } catch (e) {
      addToast({ kind: "error", title: "Rescan failed", body: String(e) });
    } finally { rescanning = false; }
  }

  async function fetchFromRepo() {
    if (refreshing) return;
    refreshing = true;
    try {
      await tsunagu.syncRepositories();
      await load();
      if (serverTab) await resetBrowse();
      const updates = installedExts.filter((e) => e.needsUpdate).length;
      addToast(updates
        ? { kind: "info", title: "Extensions refreshed", body: `${updates} update${updates === 1 ? "" : "s"} available` }
        : { kind: "success", title: "Extensions refreshed", body: "Everything is up to date" });
    } catch (e) {
      console.error(e);
      addToast({ kind: "error", title: "Refresh failed", body: e instanceof Error ? e.message : String(e) });
    } finally { refreshing = false; }
  }

  let repoObjs = $state<{ id: string; indexUrl: string }[]>([]);

  async function loadRepos() {
    reposLoading = true;
    try {
      repoObjs = await tsunagu.repositories();
      repos = repoObjs.map(r => r.indexUrl);
    } catch (e) { console.error(e); }
    finally { reposLoading = false; }
  }

  async function addRepo() {
    const url = newRepoUrl.trim();
    const err = validateUrl(url);
    if (err) { repoError = err; return; }
    if (repos.includes(url)) { repoError = "Repo already added"; return; }
    repoError = null; newRepoUrl = "";
    savingRepos = true;
    try {
      const repo = await tsunagu.addRepository(url);
      await loadRepos();
      addToast({ kind: "success", title: "Repo added", body: url });
      try {
        await tsunagu.syncRepository(repo.id);
        await load();
        if (serverTab) await resetBrowse();
      } catch (e) { console.error(e); }
    } catch (e: any) {
      repoError = e instanceof Error ? e.message : "Failed to save";
    } finally { savingRepos = false; }
  }

  async function removeRepo(url: string) {
    const target = repoObjs.find(r => r.indexUrl === url);
    if (!target) return;
    savingRepos = true;
    try {
      await tsunagu.deleteRepository(target.id);
      await loadRepos();
      addToast({ kind: "info", title: "Repo removed", body: url });
    } catch (e: any) {
      repoError = e instanceof Error ? e.message : "Failed to remove";
    } finally { savingRepos = false; }
  }

  function syncBrowseFlags() {
    if (browse.length === 0) return;
    const map = new Map(installedExts.map((e) => [e.packageName, e]));
    browse = browse.map((e) => map.get(e.packageName) ?? { ...e, installed: false, needsUpdate: false, installedVersion: null });
  }

  async function refreshAfterMutate() {
    await load();
    syncBrowseFlags();
  }

  async function mutate(pkgName: string, op: "install" | "update" | "uninstall", reload = true) {
    working = new Set(working).add(pkgName);
    const label = extensions.find((e) => e.packageName === pkgName)?.name
      ?? browse.find((e) => e.packageName === pkgName)?.name ?? pkgName;
    try {
      if      (op === "install")   await tsunagu.installExtension(pkgName);
      else if (op === "update")    await tsunagu.updateExtension(pkgName);
      else                         await tsunagu.uninstallExtension(pkgName);
      if (reload) await refreshAfterMutate();
      if (reload) addToast({
        install:   { kind: "download" as const, title: "Extension installed", body: label },
        update:    { kind: "success"  as const, title: "Extension updated",   body: label },
        uninstall: { kind: "info"     as const, title: "Extension removed",   body: label },
      }[op]);
    } catch (e: any) {
      if (reload) await refreshAfterMutate();
      addToast({ kind: "error", title: "Extension error", body: e instanceof Error ? e.message : String(e) });
    } finally {
      working.delete(pkgName); working = new Set(working);
    }
  }

  async function updateAll() {
    const pending = installedExts.filter((e) => e.needsUpdate);
    if (!pending.length || updatingAll) return;
    updatingAll = true;
    for (const ext of pending) await mutate(ext.packageName, "update", false);
    await refreshAfterMutate();
    updatingAll = false;
    addToast({ kind: "success", title: "All extensions updated", body: `${pending.length} extension${pending.length === 1 ? "" : "s"} updated` });
  }

  async function installExternal() {
    const url = externalUrl.trim();
    const err = validateUrl(url, ".apk");
    if (err) { installError = err; return; }
    installing = true; installError = null; installSuccess = false;
    try {
      await tsunagu.installExternalExtension(url);
      installSuccess = true; externalUrl = "";
      await refreshAfterMutate();
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

  const allGroups = $derived(groupExtensions(extensions, settingsState.settings.preferredExtensionLang));

  const groups = $derived(allGroups.filter(({ primary, variants }) => {
    const all = [primary, ...variants];
    const q = search.toLowerCase();
    const matchesSearch = all.some((e) => e.name.toLowerCase().includes(q) || e.lang.toLowerCase().includes(q));
    const matchesTab    = all.some((e) => matchesFilter(e, filter));
    const matchesLang   = langFilter === null || all.some((e) => e.lang === langFilter);
    const matchesType   = contentTypeFilter === "all" || all.some((e) => e.contentType === contentTypeFilter);
    return matchesSearch && matchesTab && matchesLang && matchesType;
  }));

  const availableLangs = $derived(
    serverTab
      ? [...new Set(browseLanguages)].filter((l) => l.toLowerCase() !== "all").sort()
      : [...new Set(
          extensions
            .filter((e) => matchesFilter(e, filter))
            .filter((e) => contentTypeFilter === "all" || e.contentType === contentTypeFilter)
            .map((e) => e.lang)
        )].sort()
  );


  const updateCount = $derived(installedExts.filter((e) => e.needsUpdate).length);

  let searchDebounce: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const active = serverTab;
    search; contentTypeFilter; langFilter; filter;
    if (!active) return;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { resetBrowse(); }, 250);
  });

  $effect(() => {
    untrack(async () => {
      loadLocalManga();
      await load();
      loading = false;
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
    {cropCovers} {statsAlways} {anims}
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
        <p class="panel-hint">Compatible with Mihon/Tachiyomi- and Aniyomi-format extension repositories, plus LNReader.</p>
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
      <div class="list" bind:this={listEl} onscroll={onListScroll}>
        {#if showLocal}
          <button type="button" class="local-row" onclick={rescanLocal} disabled={rescanning} title="Rescan {'{mediaDir}'}/local for hand-added files">
            <div class="local-icon">
              {#if rescanning}<CircleNotch size={16} weight="light" class="anim-spin" />{:else}<HardDrives size={18} weight="bold" />{/if}
            </div>
            <div class="info">
              <span class="name">Local Source</span>
              <span class="meta">Built-in · {localMangaCount} {localMangaCount === "1" ? "title" : "titles"} · tap to rescan</span>
            </div>
            <span class="local-badge">Built-in</span>
          </button>
        {/if}
        {#each groups as { base, primary, variants }}
          <ExtensionCard
            {base} {primary} {variants} {working} {anims}
            sources={sourcesByPkg[primary.packageName] ?? []}
            libraryCount={libCountByPkg[primary.packageName] ?? 0}
            expanded={expanded.has(base)}
            onToggle={toggleExpand}
            onMutate={mutate}
            onLibrary={(pkgName, extensionName, iconUrl) => libraryTarget = { pkgName, extensionName, iconUrl }}
          />
        {/each}
        {#if !showLocal && groups.length === 0 && !browseLoading}
          <div class="empty" style="flex:1">No extensions found.</div>
        {/if}
        {#if serverTab && browseLoading}
          <div class="more-row"><CircleNotch size={14} weight="light" class="anim-spin" style="color:var(--text-faint)" /></div>
        {:else if serverTab && browse.length > 0 && browse.length >= browseTotal}
          <div class="more-row more-end">{browseTotal} extension{browseTotal === 1 ? "" : "s"}</div>
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
  .more-row { display: flex; align-items: center; justify-content: center; padding: var(--sp-4) 0; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--text-faint); }
  .more-end { opacity: 0.6; }
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
  .panel-hint { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: 1.5; margin: -2px 0 var(--sp-2); }
  .repo-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: var(--sp-2); }
  .repo-row { display: flex; align-items: center; gap: var(--sp-2); padding: 6px var(--sp-3); border-radius: var(--radius-md); background: var(--bg-base); border: 1px solid var(--border-dim); }
  .repo-url { flex: 1; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: var(--tracking-wide); }
  .repo-remove { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--radius-sm); color: var(--text-faint); flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .repo-remove:hover:not(:disabled) { color: var(--color-error); background: var(--bg-overlay); }
  @keyframes panelSlide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
  .local-row { display: flex; align-items: center; gap: var(--sp-3); padding: 8px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; transition: background var(--t-fast), border-color var(--t-fast); margin-bottom: 1px; width: 100%; text-align: left; background: none; font: inherit; cursor: pointer; }
  .local-icon { width: 32px; height: 32px; border-radius: var(--radius-md); background: var(--accent-muted); border: 1px solid var(--accent-dim); display: flex; align-items: center; justify-content: center; color: var(--accent-fg); flex-shrink: 0; }
  .info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .name { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .local-badge { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); text-transform: uppercase; padding: 3px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); color: var(--text-faint); flex-shrink: 0; }
</style>
