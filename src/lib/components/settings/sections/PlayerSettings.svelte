<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">Playback</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Autoplay next episode</span><span class="s-desc">Load the next episode when one finishes.</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoplayNextEpisode ?? true} aria-label="Autoplay next episode" class="s-toggle" class:on={settingsState.settings.autoplayNextEpisode ?? true} onclick={() => updateSettings({ autoplayNextEpisode: !(settingsState.settings.autoplayNextEpisode ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Nethermind mode</span><span class="s-desc">Compact transport bar.</span></div>
        <button role="switch" aria-checked={settingsState.settings.nethermindMode ?? false} aria-label="Nethermind mode" class="s-toggle" class:on={settingsState.settings.nethermindMode ?? false} onclick={() => updateSettings({ nethermindMode: !(settingsState.settings.nethermindMode ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Tap to toggle bar</span><span class="s-desc">Double-tap the centre to show or hide the bar. Mouse movement won't.</span></div>
        <button role="switch" aria-checked={settingsState.settings.playerManualChrome ?? false} aria-label="Tap to toggle bar" class="s-toggle" class:on={settingsState.settings.playerManualChrome ?? false} onclick={() => updateSettings({ playerManualChrome: !(settingsState.settings.playerManualChrome ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Subtitles</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">Enable by default</span><span class="s-desc">Turn subtitles on until you choose otherwise for a series.</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoEnableSubtitles ?? true} aria-label="Enable subtitles by default" class="s-toggle" class:on={settingsState.settings.autoEnableSubtitles ?? true} onclick={() => updateSettings({ autoEnableSubtitles: !(settingsState.settings.autoEnableSubtitles ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Preferred language</span><span class="s-desc">Pick this track when available. E.g. English or en.</span></div>
        <input class="s-input" value={settingsState.settings.preferredSubtitleLang ?? ''}
          oninput={(e) => updateSettings({ preferredSubtitleLang: e.currentTarget.value })}
          placeholder="Auto" spellcheck="false" />
      </div>
    </div>
  </div>

  <p class="s-hint">Subtitle size and position, speed, quality and source are in the player.</p>

</div>

<style>
  .s-hint {
    margin: var(--sp-2) 0 0;
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--text-faint);
  }
</style>
