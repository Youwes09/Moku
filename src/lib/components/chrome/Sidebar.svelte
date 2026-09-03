<script lang="ts">
  import { goto }   from '$app/navigation'
  import { page }   from '$app/stores'
  import { app }    from '$lib/state/app.svelte'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import type { ContentTypeFilter } from '$lib/types/settings'
  import {
    House, Books, MagnifyingGlass, ClockCounterClockwise,
    DownloadSimple, PuzzlePiece, GearSix,
    ImageSquare, BookOpenText, FilmSlate, SquaresFour,
  } from 'phosphor-svelte'

  const CONTENT_TYPES: { id: ContentTypeFilter; label: string; icon: any }[] = [
    { id: 'all',   label: 'All',    icon: SquaresFour  },
    { id: 'MANGA', label: 'Manga',  icon: ImageSquare  },
    { id: 'NOVEL', label: 'Novels', icon: BookOpenText },
    { id: 'ANIME', label: 'Anime',  icon: FilmSlate    },
  ]

  function setContentType(t: ContentTypeFilter) {
    if (t === settingsState.settings.contentTypeFilter) return
    updateSettings({ contentTypeFilter: t })
  }

  const TABS: { path: string; label: string; icon: any }[] = [
    { path: '/',           label: 'Home',       icon: House           },
    { path: '/library',    label: 'Library',    icon: Books           },
    { path: '/browse',     label: 'Browse',     icon: MagnifyingGlass },
    { path: '/downloads',  label: 'Downloads',  icon: DownloadSimple  },
    { path: '/recent',  label: 'Recent',  icon: ClockCounterClockwise  },
    { path: '/extensions', label: 'Extensions', icon: PuzzlePiece     },
  ]

  const TAB_SIZE = 36
  const TAB_GAP  = 4

  function isActive(path: string): boolean {
    const pathname = $page.url.pathname
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  const activeIndex = $derived(TABS.findIndex(t => isActive(t.path)))
  const indicatorY  = $derived(activeIndex * (TAB_SIZE + TAB_GAP))
</script>

<aside class="root">
  <button class="logo" onclick={() => goto('/')} title="Home" aria-label="Go to Home">
    <div class="logo-icon"></div>
  </button>

  <nav class="nav">
    {#if activeIndex >= 0}
      <div class="indicator" style="transform: translateX(-50%) translateY({indicatorY}px)"></div>
    {/if}
    {#each TABS as tab}
      <button
        class="tab"
        class:active={activeIndex === TABS.indexOf(tab)}
        data-tour={tab.path === '/browse' ? 'global-search' : 'sidebar-nav'}
        title={tab.label}
        onclick={() => goto(tab.path)}
      >
        <tab.icon size={18} weight="light" />
      </button>
    {/each}
  </nav>

  <div class="content-type-group" role="group" aria-label="Content type" data-tour="content-switch">
    {#each CONTENT_TYPES as ct}
      <button
        class="ct-pill"
        class:active={settingsState.settings.contentTypeFilter === ct.id}
        onclick={() => setContentType(ct.id)}
        title={ct.label}
        aria-pressed={settingsState.settings.contentTypeFilter === ct.id}
      >
        <ct.icon size={16} weight={settingsState.settings.contentTypeFilter === ct.id ? "fill" : "light"} />
      </button>
    {/each}
  </div>

  <div class="bottom">
    <button class="settings-btn" data-tour="settings-btn" onclick={() => app.setSettingsOpen(true)} title="Settings">
      <GearSix size={18} weight="light" />
    </button>
  </div>
</aside>

<style>
  .root {
    width: var(--sidebar-width);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--sp-4) 0;
    height: 100%;
    border-right: 1px solid var(--border-dim);
    overflow: hidden;
  }

  .logo { width: 56px; height: 56px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; margin-bottom: var(--sp-4); border-radius: var(--radius-lg); transition: opacity var(--t-base), transform var(--t-base); }
  .logo:hover            { opacity: 0.8; transform: scale(0.96); }
  .logo:active           { transform: scale(0.92); }
  .logo:focus-visible    { outline: 2px solid var(--accent); outline-offset: 2px; }

  .logo-icon { width: 52px; height: 52px; background-color: var(--accent); mask-image: url("/src/lib/assets/moku-icon-wordmark.svg"); mask-repeat: no-repeat; mask-position: center; mask-size: contain; -webkit-mask-image: url("/src/lib/assets/moku-icon-wordmark.svg"); -webkit-mask-repeat: no-repeat; -webkit-mask-position: center; -webkit-mask-size: contain; filter: drop-shadow(0 0 8px rgba(107,143,107,0.35)); pointer-events: none; }

  .nav {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 0 var(--sp-2);
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }
  .nav::-webkit-scrollbar { display: none; }

  .indicator {
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    background: var(--accent-muted);
    pointer-events: none;
    top: 0;
    left: 50%;
    z-index: 0;
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tab {
    position: relative;
    z-index: 1;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    color: var(--text-faint);
    transition: color var(--t-base), background var(--t-base);
  }
  .tab:hover          { color: var(--text-muted); background: var(--bg-raised); }
  .tab:active         { transform: scale(0.88); }
  .tab:focus-visible  { outline: 2px solid var(--accent); outline-offset: -2px; }
  .tab.active         { color: var(--accent-fg); }
  .tab.active:hover   { background: transparent; }

  .bottom {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    padding: var(--sp-3) var(--sp-2) 0;
    border-top: 1px solid var(--border-dim);
    margin-top: var(--sp-3);
  }

  .settings-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    color: var(--text-faint);
    transition: color var(--t-base), background var(--t-base), transform var(--t-slow);
  }
  .settings-btn:hover         { color: var(--text-muted); background: var(--bg-raised); transform: rotate(30deg); }
  .settings-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

  .content-type-group { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; padding: var(--sp-3) var(--sp-2) 0; border-top: 1px solid var(--border-dim); margin-top: var(--sp-3); }
  .ct-pill { width: 36px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md); color: var(--text-faint); transition: color var(--t-base), background var(--t-base); }
  .ct-pill:hover { color: var(--text-muted); background: var(--bg-raised); }
  .ct-pill:active { transform: scale(0.88); }
  .ct-pill:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .ct-pill.active { color: var(--accent-fg); background: var(--accent-muted); }
</style>