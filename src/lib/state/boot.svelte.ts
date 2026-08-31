import { detectAdapter } from '$lib/platform-adapters'
import { initPlatformService, platformService } from '$lib/platform-service'
import { tsunagu } from '$lib/server-adapters/tsunagu'
import { appState } from '$lib/state/app.svelte'
import { settingsState, updateSettings } from '$lib/state/settings.svelte'


const MAX_ATTEMPTS = 40
const WEB_MAX_ATTEMPTS = 1
const BG_MAX_ATTEMPTS = 120

export const boot = $state({
	failed: false,
	serverProbeOk: false,
	skipped: false,
	errorMessage: '',
	errorLog: '',
})

function isRemoteServer(): boolean {
	const u = (settingsState.settings.serverUrl ?? '').trim()
	if (!u) return false
	return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(u)
}

function managesBackend(): boolean {
	return appState.platform === 'tauri' && !isRemoteServer() && settingsState.settings.serverAutoStart !== false
}

export async function maybeStartBackend(): Promise<void> {
	if (!managesBackend()) return
	try {
		const { invoke } = await import('@tauri-apps/api/core')
		await invoke('start_backend')
	} catch {
		return
	}
}

export function setServerUrl(url: string): void {
	const next = url.trim()
	if (!next) return
	liveServerUrl = null
	updateSettings({ serverUrl: next })
	appState.serverUrl = next
	startProbe(0)
}

let backendUnlisten: (() => void) | null = null

export async function subscribeBackend(): Promise<void> {
	if (appState.platform !== 'tauri' || backendUnlisten || isRemoteServer()) return
	try {
		const { listen } = await import('@tauri-apps/api/event')
		backendUnlisten = await listen<{ kind: string; url?: string; version?: string; message?: string; log?: string }>(
			'backend',
			({ payload }) => {
				if (payload.kind === 'ready' && payload.url) {
					boot.failed = false
					boot.errorMessage = ''
					boot.errorLog = ''
					liveServerUrl = payload.url
					appState.serverUrl = payload.url
					startProbe(0)
				} else if (payload.kind === 'failed' || payload.kind === 'crashed') {
					boot.failed = true
					boot.errorMessage = payload.message ?? (payload.kind === 'crashed' ? 'the server stopped' : 'the server failed to start')
					boot.errorLog = payload.log ?? ''
					appState.status = 'error'
				}
			},
		)
	} catch {
	}
}

let probeGeneration = 0

function pinLockEnabled(): boolean {
	const pin = settingsState.settings.appLockPin
	return typeof pin === 'string' && pin.length >= 4
}

async function pingServer(): Promise<boolean> {
	try {
		await tsunagu.about()
		return true
	} catch {
		return false
	}
}

let platformAdapter: ReturnType<typeof detectAdapter> | null = null

let liveServerUrl: string | null = null
function resolvedServerUrl(): string {
	return liveServerUrl ?? settingsState.settings.serverUrl ?? 'http://127.0.0.1:6007'
}

export function registerPlatformAdapter(): void {
	platformAdapter = detectAdapter()
	initPlatformService(platformAdapter)
}

export async function initApp(): Promise<void> {
	if (!platformAdapter) {
		platformAdapter = detectAdapter()
		initPlatformService(platformAdapter)
	}

	await platformAdapter.init()
	appState.platform = platformAdapter.platform
	appState.version = await platformService.getVersion().catch(() => '')
	appState.appDir = await platformService.getAppDir().catch(() => '')

	appState.serverUrl = resolvedServerUrl()
}

function handleProbeSuccess(gen: number) {
	if (gen !== probeGeneration) return
	boot.failed = false
	boot.skipped = false
	boot.serverProbeOk = true
	appState.status = pinLockEnabled() ? 'locked' : 'ready'
	tsunagu.rescanLocalMedia()
		.then(found => { if (found.length) import('$lib/state/library.svelte').then(m => m.loadLibrary(true)) })
		.catch(() => {})
}

export async function startProbe(initialDelay = 100): Promise<void> {
	const gen = ++probeGeneration
	boot.failed = false
	boot.serverProbeOk = false
	boot.skipped = false
	appState.status = 'booting'

	const baseUrl = resolvedServerUrl()
	appState.serverUrl = baseUrl

	let tries = 0

	async function probe() {
		if (gen !== probeGeneration) return
		tries++
		const ok = await pingServer()
		if (gen !== probeGeneration) return

		if (ok) {
			handleProbeSuccess(gen)
			return
		}

		const maxAttempts = appState.platform === 'tauri' ? MAX_ATTEMPTS : WEB_MAX_ATTEMPTS
		if (tries >= maxAttempts) {
			boot.failed = true
			appState.status = 'error'
			startBackgroundProbe(gen)
			return
		}

		setTimeout(probe, Math.min(500 + tries * 200, 2000))
	}

	setTimeout(probe, initialDelay)
}

function startBackgroundProbe(gen: number) {
	let bgTries = 0

	async function bgProbe() {
		if (gen !== probeGeneration) return
		bgTries++
		const ok = await pingServer()
		if (gen !== probeGeneration) return
		if (ok) {
			handleProbeSuccess(gen)
			return
		}
		if (bgTries >= BG_MAX_ATTEMPTS) return
		setTimeout(bgProbe, 2000)
	}

	setTimeout(bgProbe, 2000)
}

export function retryBoot(): void {
	boot.failed = false
	boot.skipped = false
	boot.errorMessage = ''
	boot.errorLog = ''
	if (managesBackend()) {
		import('@tauri-apps/api/core')
			.then(({ invoke }) => invoke('restart_backend'))
			.catch(() => {})
	}
	startProbe()
}

export async function openBackendDataDir(): Promise<void> {
	try {
		const { invoke } = await import('@tauri-apps/api/core')
		const dir = await invoke<string | null>('backend_data_dir')
		if (dir) await invoke('open_path', { path: dir })
	} catch {
	}
}

export function bypassBoot(): void {
	boot.skipped = true
	appState.status = 'ready'
	startBackgroundProbe(probeGeneration)
}
