import type { Settings }    from '$lib/types/settings'
import { DEFAULT_SETTINGS } from '$lib/types/settings'
import { saveSettings }     from '$lib/core/persistence/persist'

export const settingsState = $state({
  settings: { ...DEFAULT_SETTINGS } as Settings,
  loaded:   false,
})

export async function loadSettingsIntoState(raw: unknown) {
  if (raw && typeof raw === 'object') {
    Object.assign(settingsState.settings, raw)
  }
  settingsState.loaded = true
}

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settingsState.settings, patch)
  void saveSettings({ storeVersion: 2, settings: settingsState.settings })
}

