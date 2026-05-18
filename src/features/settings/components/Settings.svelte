<script lang="ts">
  import { tick } from "svelte";
  import { X, Book, Image, Sliders, Info, Keyboard, Gear, HardDrives, FolderSimple, Wrench, PaintBrush, ListChecks, Lock, ShieldCheck, Robot } from "phosphor-svelte";
  import { store, setSettingsOpen, updateSettings } from "@store/state.svelte";
  import { eventToKeybind } from "@core/keybinds/keybindEngine";
  import type { Keybinds } from "@types/settings";
  import "./Settings.css";

  import GeneralSettings     from "../sections/GeneralSettings.svelte";
  import AppearanceSettings  from "../sections/AppearanceSettings.svelte";
  import ReaderSettings      from "../sections/ReaderSettings.svelte";
  import LibrarySettings     from "../sections/LibrarySettings.svelte";
  import PerformanceSettings from "../sections/PerformanceSettings.svelte";
  import KeybindsSettings    from "../sections/KeybindsSettings.svelte";
  import StorageSettings     from "../sections/StorageSettings.svelte";
  import FoldersSettings     from "../sections/FoldersSettings.svelte";
  import TrackingSettings    from "../sections/TrackingSettings.svelte";
  import SecuritySettings    from "../sections/SecuritySettings.svelte";
  import ContentSettings     from "../sections/ContentSettings.svelte";
  import AboutSettings       from "../sections/AboutSettings.svelte";
  import DevtoolsSettings    from "../sections/DevtoolsSettings.svelte";
  import AutomationSettings  from "../sections/AutomationSettings.svelte";

  interface Props { onOpenThemeEditor?: (id?: string | null) => void; }
  let { onOpenThemeEditor }: Props = $props();

  type Tab = "general"|"appearance"|"reader"|"library"|"automation"|"performance"|"keybinds"|"storage"|"folders"|"tracking"|"security"|"content"|"about"|"devtools";
  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "general",     label: "General",     icon: Gear        },
    { id: "appearance",  label: "Appearance",  icon: PaintBrush  },
    { id: "reader",      label: "Reader",      icon: Book        },
    { id: "library",     label: "Library",     icon: Image       },
    { id: "automation",  label: "Automation",  icon: Robot       },
    { id: "performance", label: "Performance", icon: Sliders     },
    { id: "keybinds",    label: "Keybinds",    icon: Keyboard    },
    { id: "storage",     label: "Storage",     icon: HardDrives  },
    { id: "folders",     label: "Folders",     icon: FolderSimple },
    { id: "tracking",    label: "Tracking",    icon: ListChecks  },
    { id: "security",    label: "Security",    icon: Lock        },
    { id: "content",     label: "Content",     icon: ShieldCheck },
    { id: "about",       label: "About",       icon: Info        },
    { id: "devtools",    label: "Dev Tools",   icon: Wrench      },
  ];

  const anims = $derived(store.settings.qolAnimations ?? true);
  let tab: Tab             = $state("general");
  let prevTabIndex         = $state(0);
  let tabSlideDir          = $state<"up"|"down">("down");
  let tabIconKey           = $state(0);
  let contentBodyEl: HTMLDivElement;

  $effect(() => { tab; tick().then(() => contentBodyEl?.scrollTo({ top: 0 })); });

  function setTab(id: Tab) {
    if (anims) {
      const next = TABS.findIndex(t => t.id === id);
      tabSlideDir = next > prevTabIndex ? "down" : "up";
      prevTabIndex = next;
      tabIconKey++;
    }
    tab = id;
  }

  function close() { setSettingsOpen(false); }

  let listeningKey: keyof Keybinds | null = $state(null);

  $effect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !listeningKey) { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  $effect(() => {
    if (!listeningKey) return;
    const capture = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      const bind = eventToKeybind(e);
      if (!bind) return;
      updateSettings({ keybinds: { ...store.settings.keybinds, [listeningKey!]: bind } });
      listeningKey = null;
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  });

  let selectOpen: string | null = $state(null);
  let closingSelect: string | null = $state(null);

  const CLOSE_ANIM_MS = 120;

  function closeSelect() {
    if (!selectOpen) return;
    closingSelect = selectOpen;
    selectOpen = null;
    setTimeout(() => { closingSelect = null; }, CLOSE_ANIM_MS);
  }

  function toggleSelect(id: string) {
    if (selectOpen === id) { closeSelect(); }
    else { closingSelect = null; selectOpen = id; }
  }

  $effect(() => {
    const handler = (e: MouseEvent) => {
      if (!selectOpen) return;
      const t = e.target as HTMLElement;
      if (t.closest(".s-select")) return;
      if (t.closest(".s-select-menu")) return;
      closeSelect();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  });
</script>

<div class="s-backdrop" role="presentation" tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) close(); }}
  onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
  <div class="s-modal" role="dialog" aria-label="Settings">

    <div class="s-sidebar">
      <p class="s-sidebar-title">Settings</p>
      <nav>
        {#each TABS as t}
          <button class="s-nav-item" class:active={tab === t.id} class:anims onclick={() => setTab(t.id)}>
            <span class="s-nav-icon"
              class:slide-down={anims && tab === t.id && tabSlideDir === "down"}
              class:slide-up={anims && tab === t.id && tabSlideDir === "up"}>
              {#key anims && tab === t.id ? tabIconKey : 0}
                <t.icon size={14} weight={tab === t.id ? "regular" : "light"} />
              {/key}
            </span>
            <span>{t.label}</span>
          </button>
        {/each}
      </nav>
    </div>

    <div class="s-content">
      <div class="s-content-header">
        <div class="s-content-header-left">
          <span class="s-header-icon"
            class:slide-down={anims && tabSlideDir === "down"}
            class:slide-up={anims && tabSlideDir === "up"}>
            {#key tabIconKey}
              {#each TABS as t}
                {#if t.id === tab}
                  <t.icon size={13} weight="light" />
                {/if}
              {/each}
            {/key}
          </span>
          <p class="s-content-title">{TABS.find(t => t.id === tab)?.label}</p>
        </div>
        <button class="s-close-btn" aria-label="Close settings" onclick={close}><X size={15} weight="light" /></button>
      </div>

      <div class="s-content-body" bind:this={contentBodyEl}>
        {#if tab === "general"}
          <GeneralSettings {selectOpen} {closingSelect} {toggleSelect} {anims} />
        {:else if tab === "appearance"}
          <AppearanceSettings {selectOpen} {closingSelect} {toggleSelect} {anims} {onOpenThemeEditor} />
        {:else if tab === "reader"}
          <ReaderSettings {selectOpen} {closingSelect} {toggleSelect} {anims} />
        {:else if tab === "library"}
          <LibrarySettings {selectOpen} {closingSelect} {toggleSelect} {anims} />
        {:else if tab === "automation"}
          <AutomationSettings />
        {:else if tab === "performance"}
          <PerformanceSettings />
        {:else if tab === "keybinds"}
          <KeybindsSettings bind:listeningKey />
        {:else if tab === "storage"}
          <StorageSettings {selectOpen} {closingSelect} {toggleSelect} />
        {:else if tab === "folders"}
          <FoldersSettings />
        {:else if tab === "tracking"}
          <TrackingSettings />
        {:else if tab === "security"}
          <SecuritySettings {selectOpen} {closingSelect} {toggleSelect} />
        {:else if tab === "content"}
          <ContentSettings />
        {:else if tab === "about"}
          <AboutSettings />
        {:else if tab === "devtools"}
          <DevtoolsSettings />
        {/if}
      </div>
    </div>

  </div>
</div>