<script lang="ts">
  import { store, updateSettings } from "@store/state.svelte";
  import type { Settings, FitMode } from "@types/settings";
  import { selectPortal } from "@core/actions/selectPortal";

  interface Props {
    selectOpen: string | null;
    toggleSelect: (id: string) => void;
    anims: boolean;
  }

  let { selectOpen, toggleSelect, anims }: Props = $props();

  let triggerPageStyle  = $state<HTMLButtonElement>(null!);
  let triggerReadingDir = $state<HTMLButtonElement>(null!);
  let triggerFitMode    = $state<HTMLButtonElement>(null!);
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Page Layout</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Default layout</span><span class="s-desc">How chapters open by default</span></div>
        <div class="s-select">
          <button bind:this={triggerPageStyle} class="s-select-btn" onclick={() => toggleSelect("page-style")}>
            <span>{{ "single":"Single page","longstrip":"Long strip" }[store.settings.pageStyle === "double" ? "single" : store.settings.pageStyle]}</span>
            <svg class="s-select-caret" class:open={selectOpen === "page-style"} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === "page-style"}
            <div class="s-select-menu" class:anims {@attach selectPortal(triggerPageStyle)}>
              {#each [["single","Single page"],["longstrip","Long strip"]] as [v, l]}
                <button class="s-select-option" class:active={(store.settings.pageStyle === "double" ? "single" : store.settings.pageStyle) === v} onclick={() => { updateSettings({ pageStyle: v as Settings["pageStyle"] }); toggleSelect("page-style"); }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Reading direction</span><span class="s-desc">Left-to-right for most manga, right-to-left for Japanese</span></div>
        <div class="s-select">
          <button bind:this={triggerReadingDir} class="s-select-btn" onclick={() => toggleSelect("reading-dir")}>
            <span>{{ "ltr":"Left to right","rtl":"Right to left" }[store.settings.readingDirection]}</span>
            <svg class="s-select-caret" class:open={selectOpen === "reading-dir"} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === "reading-dir"}
            <div class="s-select-menu" class:anims {@attach selectPortal(triggerReadingDir)}>
              {#each [["ltr","Left to right"],["rtl","Right to left"]] as [v, l]}
                <button class="s-select-option" class:active={store.settings.readingDirection === v} onclick={() => { updateSettings({ readingDirection: v as Settings["readingDirection"] }); toggleSelect("reading-dir"); }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Page gap</span><span class="s-desc">Adds spacing between pages in single-page mode</span></div>
        <button role="switch" aria-checked={store.settings.pageGap} aria-label="Page gap" class="s-toggle" class:on={store.settings.pageGap} onclick={() => updateSettings({ pageGap: !store.settings.pageGap })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Overlay bars</span><span class="s-desc">Floats the nav and chapter bars over the page instead of pushing content</span></div>
        <button role="switch" aria-checked={store.settings.overlayBars ?? false} aria-label="Overlay bars" class="s-toggle" class:on={store.settings.overlayBars ?? false} onclick={() => updateSettings({ overlayBars: !(store.settings.overlayBars ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Tap to toggle bar</span><span class="s-desc">Double-tap the center of the reader to show or hide the bars — ideal for touchscreens</span></div>
        <button role="switch" aria-checked={store.settings.tapToToggleBar ?? false} aria-label="Tap to toggle bar" class="s-toggle" class:on={store.settings.tapToToggleBar ?? false} onclick={() => updateSettings({ tapToToggleBar: !(store.settings.tapToToggleBar ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Fit &amp; Zoom</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Default fit mode</span><span class="s-desc">How pages are scaled to fill the reader on open</span></div>
        <div class="s-select">
          <button bind:this={triggerFitMode} class="s-select-btn" onclick={() => toggleSelect("fit-mode")}>
            <span>{{ "width":"Fit width","height":"Fit height","screen":"Fit screen","original":"Original (1:1)" }[store.settings.fitMode ?? "width"]}</span>
            <svg class="s-select-caret" class:open={selectOpen === "fit-mode"} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === "fit-mode"}
            <div class="s-select-menu" class:anims {@attach selectPortal(triggerFitMode)}>
              {#each [["width","Fit width"],["height","Fit height"],["screen","Fit screen"],["original","Original (1:1)"]] as [v, l]}
                <button class="s-select-option" class:active={(store.settings.fitMode ?? "width") === v} onclick={() => { updateSettings({ fitMode: v as FitMode }); toggleSelect("fit-mode"); }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="s-slider-row">
        <input type="range" min={10} max={100} step={5}
          value={Math.round((store.settings.readerZoom ?? 0.5) * 100)}
          oninput={(e) => updateSettings({ readerZoom: Number(e.currentTarget.value) / 100 })}
          class="s-slider" />
        <input type="number" min={10} max={100} step={5} class="s-slider-val"
          value={Math.round((store.settings.readerZoom ?? 0.5) * 100)}
          oninput={(e) => { const n = parseInt(e.currentTarget.value, 10); if (!isNaN(n) && n >= 10 && n <= 100) updateSettings({ readerZoom: n / 100 }); }}
          onblur={(e) => { const n = parseInt(e.currentTarget.value, 10); if (isNaN(n) || n < 10) { updateSettings({ readerZoom: 0.1 }); e.currentTarget.value = "10"; } else if (n > 100) { updateSettings({ readerZoom: 1.0 }); e.currentTarget.value = "100"; } }}
        />
        <span class="s-slider-unit">%</span>
        <button class="s-btn-icon" onclick={() => updateSettings({ readerZoom: 0.5 })} disabled={(store.settings.readerZoom ?? 0.5) === 0.5} title="Reset to 100%">↺</button>
      </div>
      <div class="s-presets">
        {#each [0, 10, 30, 50, 70, 90, 100] as v}
          <button class="s-preset" class:active={Math.round((store.settings.readerZoom ?? 0.5) * 100) === v} onclick={() => updateSettings({ readerZoom: v / 100 })}>{v}%</button>
        {/each}
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Optimize contrast</span><span class="s-desc">Sharpens dark lines on light pages; best for black-and-white manga</span></div>
        <button role="switch" aria-checked={store.settings.optimizeContrast} aria-label="Optimize contrast" class="s-toggle" class:on={store.settings.optimizeContrast} onclick={() => updateSettings({ optimizeContrast: !store.settings.optimizeContrast })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Behaviour</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-mark read</span><span class="s-desc">Marks a chapter as read when you reach the last page</span></div>
        <button role="switch" aria-checked={store.settings.autoMarkRead} aria-label="Auto-mark chapters read" class="s-toggle" class:on={store.settings.autoMarkRead} onclick={() => updateSettings({ autoMarkRead: !store.settings.autoMarkRead })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-advance chapters</span><span class="s-desc">Automatically loads the next chapter when you pass the last page</span></div>
        <button role="switch" aria-checked={store.settings.autoNextChapter ?? false} aria-label="Auto-advance chapters" class="s-toggle" class:on={store.settings.autoNextChapter} onclick={() => updateSettings({ autoNextChapter: !(store.settings.autoNextChapter ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      {#if !(store.settings.autoNextChapter ?? false)}
        <label class="s-row">
          <div class="s-row-info"><span class="s-label">Mark read when skipping</span><span class="s-desc">Marks the current chapter read when you manually jump to the next</span></div>
          <button role="switch" aria-checked={store.settings.markReadOnNext ?? true} aria-label="Mark read when skipping" class="s-toggle" class:on={store.settings.markReadOnNext ?? true} onclick={() => updateSettings({ markReadOnNext: !(store.settings.markReadOnNext ?? true) })}><span class="s-toggle-thumb"></span></button>
        </label>
      {/if}
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-bookmark</span><span class="s-desc">Automatically saves your page position as you read</span></div>
        <button role="switch" aria-checked={store.settings.autoBookmark ?? true} aria-label="Enable auto-bookmark" class="s-toggle" class:on={store.settings.autoBookmark ?? true} onclick={() => updateSettings({ autoBookmark: !(store.settings.autoBookmark ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Pages to preload</span><span class="s-desc">How many pages ahead to fetch in the background while reading</span></div>
        <div class="s-stepper">
          <button class="s-step-btn" onclick={() => updateSettings({ preloadPages: Math.max(0, store.settings.preloadPages - 1) })} disabled={store.settings.preloadPages <= 0}>−</button>
          <span class="s-step-val">{store.settings.preloadPages}</span>
          <button class="s-step-btn" onclick={() => updateSettings({ preloadPages: Math.min(10, store.settings.preloadPages + 1) })} disabled={store.settings.preloadPages >= 10}>+</button>
        </div>
      </div>
    </div>
  </div>

</div>