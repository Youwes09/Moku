import type { Platform } from '$lib/platform-adapters/types'
import type { Extension, SearchResult } from '$lib/server-adapters/types'
import { fetchChangelogForVersion, type ChangelogEntry } from '$lib/core/changelog'
import { settingsState, updateSettings } from '$lib/state/settings.svelte'

export type AppStatus = 'booting' | 'not-configured' | 'locked' | 'ready' | 'error'

class AppStore {
	settingsOpen: boolean = $state(false)
	settingsTab: string = $state('general')
	navPage: string = $state('')
	scrollPositions: Map<string, number> = $state(new Map())

	setSettingsOpen(next: boolean, tab?: string) {
		if (tab) this.settingsTab = tab
		this.settingsOpen = next
	}
	setNavPage(next: string) {
		this.navPage = next
	}

	saveScroll(key: string, top: number) {
		const m = new Map(this.scrollPositions)
		m.set(key, top)
		this.scrollPositions = m
	}

	getScroll(key: string): number {
		return this.scrollPositions.get(key) ?? 0
	}
}

export const app = new AppStore()

export const appState = $state({
	status: 'booting' as AppStatus,
	error: null as string | null,
	serverUrl: '',
	platform: 'web' as Platform,
	version: '',
	libraryFilter: '',
	navPage: '',
	categories: [] as { id: number; name: string }[],
	history: [] as unknown[],
	toasts: [] as unknown[],
	appDir: '',
	idleSplash: false,
	devSplash: false,
	changelogVisible: false,
	changelogLoading: false,
	changelogEntry: null as ChangelogEntry | null,
	activeSource: null as Extension | null,
	activeManga: null as SearchResult | null,
})

export function setSettingsOpen(next: boolean, tab?: string) {
	app.setSettingsOpen(next, tab)
}
export function saveScroll(key: string, top: number) {
	app.saveScroll(key, top)
}
export function getScroll(key: string): number {
	return app.getScroll(key)
}
export function setNavPage(page: string) {
	app.setNavPage(page)
	appState.navPage = page
}

export async function checkForChangelog() {
	const currentVersion = appState.version
	if (!currentVersion) return

	const lastRunVersion = settingsState.settings.lastRunVersion

	if (!lastRunVersion) {
		updateSettings({ lastRunVersion: currentVersion })
		return
	}

	if (lastRunVersion === currentVersion) return

	appState.changelogLoading = true
	try {
		const entry = await fetchChangelogForVersion(currentVersion)
		appState.changelogLoading = false
		if (entry) {
			appState.changelogEntry = entry
			appState.changelogVisible = true
		}
	} catch {
		appState.changelogLoading = false
	}

	updateSettings({ lastRunVersion: currentVersion })
}

export async function devTestChangelog(version: string) {
	appState.changelogLoading = true
	try {
		const entry = await fetchChangelogForVersion(version)
		appState.changelogLoading = false
		if (entry) {
			appState.changelogEntry = entry
			appState.changelogVisible = true
		}
		return entry
	} catch (e) {
		appState.changelogLoading = false
		throw e
	}
}

export function dismissChangelog() {
	appState.changelogVisible = false
}