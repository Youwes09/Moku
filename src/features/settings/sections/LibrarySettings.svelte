<script lang="ts">
  import { store, updateSettings, clearHistory, wipeAllData } from "@store/state.svelte";
  import type { Settings } from "@types/settings";
  import { selectPortal } from "@core/actions/selectPortal";

  interface Props {
    selectOpen: string | null;
    toggleSelect: (id: string) => void;
    anims: boolean;
  }

  let { selectOpen, toggleSelect, anims }: Props = $props();

  let triggerSortDir = $state<HTMLButtonElement>(null!);
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Display</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Always show card stats</span><span class="s-desc">Show unread and download counts without needing to hover</span></div>
        <button role="switch" aria-checked={store.settings.libraryStatsAlways ?? false} aria-label="Always show card stats" class="s-toggle" class:on={store.settings.libraryStatsAlways ?? false} onclick={() => updateSettings({ libraryStatsAlways: !(store.settings.libraryStatsAlways ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Crop cover images</span><span class="s-desc">Fills the card with the cover art instead of letterboxing</span></div>
        <button role="switch" aria-checked={store.settings.libraryCropCovers} aria-label="Crop cover images" class="s-toggle" class:on={store.settings.libraryCropCovers} onclick={() => updateSettings({ libraryCropCovers: !store.settings.libraryCropCovers })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Show all in Saved tab</span><span class="s-desc">Include manga that are in folders — lets you see your whole library in one place</span></div>
        <button role="switch" aria-checked={store.settings.libraryShowAllInSaved ?? true} aria-label="Show all manga in Saved tab" class="s-toggle" class:on={store.settings.libraryShowAllInSaved ?? true} onclick={() => updateSettings({ libraryShowAllInSaved: !(store.settings.libraryShowAllInSaved ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      {#if store.settings.libraryShowAllInSaved ?? true}
        <label class="s-row">
          <div class="s-row-info"><span class="s-label">Hide completed in Saved tab</span><span class="s-desc">Keep manga in the Completed folder out of the Saved view</span></div>
          <button role="switch" aria-checked={store.settings.libraryHideCompletedInSaved ?? false} aria-label="Hide completed manga in Saved tab" class="s-toggle" class:on={store.settings.libraryHideCompletedInSaved ?? false} onclick={() => updateSettings({ libraryHideCompletedInSaved: !(store.settings.libraryHideCompletedInSaved ?? false) })}><span class="s-toggle-thumb"></span></button>
        </label>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Chapters</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Default sort direction</span><span class="s-desc">Initial chapter list order when opening a manga</span></div>
        <div class="s-select">
          <button bind:this={triggerSortDir} class="s-select-btn" onclick={() => toggleSelect("sort-dir")}>
            <span>{{ "desc":"Newest first","asc":"Oldest first" }[store.settings.chapterSortDir]}</span>
            <svg class="s-select-caret" class:open={selectOpen === "sort-dir"} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === "sort-dir"}
            <div class="s-select-menu" class:anims {@attach selectPortal(triggerSortDir)}>
              {#each [["desc","Newest first"],["asc","Oldest first"]] as [v, l]}
                <button class="s-select-option" class:active={store.settings.chapterSortDir === v} onclick={() => { updateSettings({ chapterSortDir: v as Settings["chapterSortDir"] }); toggleSelect("sort-dir"); }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Series</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-link on open</span><span class="s-desc">When opening a manga, automatically link it to similarly-titled entries and notify you of new matches</span></div>
        <button role="switch" aria-checked={store.settings.autoLinkOnOpen ?? false} aria-label="Auto-link on open" class="s-toggle" class:on={store.settings.autoLinkOnOpen ?? false} onclick={() => updateSettings({ autoLinkOnOpen: !(store.settings.autoLinkOnOpen ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Disable auto-complete</span><span class="s-desc">Don't move manga to the Completed folder when all chapters are read</span></div>
        <button role="switch" aria-checked={store.settings.disableAutoComplete} aria-label="Disable auto-complete" class="s-toggle" class:on={store.settings.disableAutoComplete} onclick={() => updateSettings({ disableAutoComplete: !store.settings.disableAutoComplete })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Reading history</span><span class="s-desc">{store.history.length} entries</span></div>
        <button class="s-btn s-btn-danger" onclick={clearHistory} disabled={store.history.length === 0}>Clear</button>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Wipe all data</span><span class="s-desc">History, stats, pins, and manga links</span></div>
        <button class="s-btn s-btn-danger" onclick={wipeAllData}>Wipe</button>
      </div>
    </div>
  </div>

</div>