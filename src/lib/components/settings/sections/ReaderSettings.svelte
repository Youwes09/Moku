<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import type { Settings, FitMode } from '$lib/types/settings'
  import type { Action } from 'svelte/action'

  interface Props {
    selectOpen:      string | null
    closingSelect?:  string | null
    toggleSelect:    (id: string) => void
    registerTrigger: (id: string, el: HTMLElement) => void
    getTrigger:      (id: string) => HTMLElement | undefined
    selectPortal:    Action<HTMLElement, HTMLElement | undefined>
    anims:           boolean
  }
  let { selectOpen, closingSelect, toggleSelect, registerTrigger, getTrigger, selectPortal, anims }: Props = $props()

  let triggerPageStyle  = $state<HTMLButtonElement>(null!)
  let triggerReadingDir = $state<HTMLButtonElement>(null!)
  let triggerFitMode    = $state<HTMLButtonElement>(null!)
  let triggerBarPos     = $state<HTMLButtonElement>(null!)

  const BAR_POS_LABELS = { top: 'Top', left: 'Left', right: 'Right' } as const

  $effect(() => { if (triggerPageStyle)  registerTrigger('page-style',  triggerPageStyle)  })
  $effect(() => { if (triggerReadingDir) registerTrigger('reading-dir', triggerReadingDir) })
  $effect(() => { if (triggerFitMode)    registerTrigger('fit-mode',    triggerFitMode)    })
  $effect(() => { if (triggerBarPos)     registerTrigger('bar-pos',     triggerBarPos)     })
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Page Layout</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Default layout</span><span class="s-desc">How chapters open by default</span></div>
        <div class="s-select">
          <button bind:this={triggerPageStyle} class="s-select-btn" onclick={() => toggleSelect('page-style')}>
            <span>{{ 'single':'Single page','longstrip':'Long strip','fade':'Fade' }[settingsState.settings.pageStyle === 'double' ? 'single' : settingsState.settings.pageStyle]}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'page-style'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'page-style' || closingSelect === 'page-style'}
            <div use:selectPortal={getTrigger('page-style')} class="s-select-menu" class:anims class:closing={closingSelect === 'page-style'}>
              {#each [['single','Single page'],['longstrip','Long strip']] as [v, l]}
                <button class="s-select-option" class:active={(settingsState.settings.pageStyle === 'double' ? 'single' : settingsState.settings.pageStyle) === v} onclick={() => { updateSettings({ pageStyle: v as Settings['pageStyle'] }); toggleSelect('page-style') }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Reading direction</span><span class="s-desc">Left-to-right for most manga, right-to-left for Japanese</span></div>
        <div class="s-select">
          <button bind:this={triggerReadingDir} class="s-select-btn" onclick={() => toggleSelect('reading-dir')}>
            <span>{{ 'ltr':'Left to right','rtl':'Right to left' }[settingsState.settings.readingDirection]}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'reading-dir'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'reading-dir' || closingSelect === 'reading-dir'}
            <div use:selectPortal={getTrigger('reading-dir')} class="s-select-menu" class:anims class:closing={closingSelect === 'reading-dir'}>
              {#each [['ltr','Left to right'],['rtl','Right to left']] as [v, l]}
                <button class="s-select-option" class:active={settingsState.settings.readingDirection === v} onclick={() => { updateSettings({ readingDirection: v as Settings['readingDirection'] }); toggleSelect('reading-dir') }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Page gap</span><span class="s-desc">Adds spacing between pages in single-page mode</span></div>
        <button role="switch" aria-checked={settingsState.settings.pageGap} aria-label="Page gap" class="s-toggle" class:on={settingsState.settings.pageGap} onclick={() => updateSettings({ pageGap: !settingsState.settings.pageGap })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Bars &amp; Chrome</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Bar position</span><span class="s-desc">Where the reader nav and chapter bars dock</span></div>
        <div class="s-select">
          <button bind:this={triggerBarPos} class="s-select-btn" onclick={() => toggleSelect('bar-pos')}>
            <span>{BAR_POS_LABELS[settingsState.settings.barPosition ?? 'top']}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'bar-pos'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'bar-pos' || closingSelect === 'bar-pos'}
            <div use:selectPortal={getTrigger('bar-pos')} class="s-select-menu" class:anims class:closing={closingSelect === 'bar-pos'}>
              {#each [['top','Top'],['left','Left'],['right','Right']] as [v, l]}
                <button class="s-select-option" class:active={(settingsState.settings.barPosition ?? 'top') === v} onclick={() => { updateSettings({ barPosition: v as 'top' | 'left' | 'right' }); toggleSelect('bar-pos') }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Tap to toggle bar</span><span class="s-desc">Double-tap the center of the reader to show or hide the bars</span></div>
        <button role="switch" aria-checked={settingsState.settings.tapToToggleBar ?? false} aria-label="Tap to toggle bar" class="s-toggle" class:on={settingsState.settings.tapToToggleBar ?? false} onclick={() => updateSettings({ tapToToggleBar: !(settingsState.settings.tapToToggleBar ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Containerized view</span><span class="s-desc">Shows the reader inside the app shell with the sidebar instead of filling the whole screen</span></div>
        <button role="switch" aria-checked={settingsState.settings.readerContainerized ?? false} aria-label="Containerized reader view" class="s-toggle" class:on={settingsState.settings.readerContainerized ?? false} onclick={() => updateSettings({ readerContainerized: !(settingsState.settings.readerContainerized ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Fit &amp; Zoom</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Default fit mode</span><span class="s-desc">How pages are scaled to fill the reader on open</span></div>
        <div class="s-select">
          <button bind:this={triggerFitMode} class="s-select-btn" onclick={() => toggleSelect('fit-mode')}>
            <span>{{ 'width':'Fit width','height':'Fit height','screen':'Fit screen','original':'Original (1:1)' }[settingsState.settings.fitMode ?? 'width']}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'fit-mode'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'fit-mode' || closingSelect === 'fit-mode'}
            <div use:selectPortal={getTrigger('fit-mode')} class="s-select-menu" class:anims class:closing={closingSelect === 'fit-mode'}>
              {#each [['width','Fit width'],['height','Fit height'],['screen','Fit screen'],['original','Original (1:1)']] as [v, l]}
                <button class="s-select-option" class:active={(settingsState.settings.fitMode ?? 'width') === v} onclick={() => { updateSettings({ fitMode: v as FitMode }); toggleSelect('fit-mode') }}>{l}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Optimize contrast</span><span class="s-desc">Sharpens dark lines on light pages; best for black-and-white manga</span></div>
        <button role="switch" aria-checked={settingsState.settings.optimizeContrast} aria-label="Optimize contrast" class="s-toggle" class:on={settingsState.settings.optimizeContrast} onclick={() => updateSettings({ optimizeContrast: !settingsState.settings.optimizeContrast })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Behaviour</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-mark read</span><span class="s-desc">Marks a chapter as read when you reach the last page</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoMarkRead} aria-label="Auto-mark chapters read" class="s-toggle" class:on={settingsState.settings.autoMarkRead} onclick={() => updateSettings({ autoMarkRead: !settingsState.settings.autoMarkRead })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-advance chapters</span><span class="s-desc">Automatically loads the next chapter when you pass the last page</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoNextChapter ?? false} aria-label="Auto-advance chapters" class="s-toggle" class:on={settingsState.settings.autoNextChapter} onclick={() => updateSettings({ autoNextChapter: !(settingsState.settings.autoNextChapter ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      {#if !(settingsState.settings.autoNextChapter ?? false)}
        <label class="s-row">
          <div class="s-row-info"><span class="s-label">Mark read when skipping</span><span class="s-desc">Marks the current chapter read when you manually jump to the next</span></div>
          <button role="switch" aria-checked={settingsState.settings.markReadOnNext ?? true} aria-label="Mark read when skipping" class="s-toggle" class:on={settingsState.settings.markReadOnNext ?? true} onclick={() => updateSettings({ markReadOnNext: !(settingsState.settings.markReadOnNext ?? true) })}><span class="s-toggle-thumb"></span></button>
        </label>
      {/if}
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-bookmark</span><span class="s-desc">Automatically saves your page position as you read</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoBookmark ?? true} aria-label="Enable auto-bookmark" class="s-toggle" class:on={settingsState.settings.autoBookmark ?? true} onclick={() => updateSettings({ autoBookmark: !(settingsState.settings.autoBookmark ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Pages to preload</span><span class="s-desc">How many pages ahead to fetch in the background while reading</span></div>
        <div class="s-stepper">
          <button class="s-step-btn" onclick={() => updateSettings({ preloadPages: Math.max(0, settingsState.settings.preloadPages - 1) })} disabled={settingsState.settings.preloadPages <= 0}>−</button>
          <span class="s-step-val">{settingsState.settings.preloadPages}</span>
          <button class="s-step-btn" onclick={() => updateSettings({ preloadPages: Math.min(10, settingsState.settings.preloadPages + 1) })} disabled={settingsState.settings.preloadPages >= 10}>+</button>
        </div>
      </div>
    </div>
  </div>

</div>