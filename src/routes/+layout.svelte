<script lang="ts">
	import { onMount } from 'svelte'
	import { page } from '$app/stores'
	import { appState, app, type AppStatus, checkForChangelog } from '$lib/state/app.svelte'
	import { boot, registerPlatformAdapter, initApp, startProbe, retryBoot, bypassBoot, subscribeBackend, openBackendDataDir } from '$lib/state/boot.svelte'
	import { notifications } from '$lib/state/notifications.svelte'
	import { settingsState, loadSettingsIntoState, updateSettings } from '$lib/state/settings.svelte'
	import { applyTheme, mountSystemThemeSync } from '$lib/core/theme'
	import { platformService } from '$lib/platform-service'
	import * as discord from '$lib/core/discord'
	import SplashScreen from '$lib/components/chrome/SplashScreen.svelte'
	import Onboarding from '$lib/components/onboarding/Onboarding.svelte'
	import TourOverlay from '$lib/components/onboarding/TourOverlay.svelte'
	import TourFinish from '$lib/components/onboarding/TourFinish.svelte'
	import ChangelogModal from '$lib/components/chrome/ChangelogModal.svelte'
	import { maybeStartOnboarding } from '$lib/state/onboarding.svelte'
	import Sidebar from '$lib/components/chrome/Sidebar.svelte'
	import TitleBar from '$lib/components/chrome/TitleBar.svelte'
	import Toaster from '$lib/components/chrome/Toaster.svelte'
	import BackendLog from '$lib/components/chrome/BackendLog.svelte'
	import Settings from '$lib/components/settings/Settings.svelte'
	import ThemeEditor from '$lib/components/settings/ThemeEditor.svelte'
	import { downloadStore } from '$lib/state/downloads.svelte'
	import { seriesState } from '$lib/state/series.svelte'
	import MangaPreview from '$lib/components/shared/manga/MangaPreview.svelte'
	import { loadSettings, loadLibrary } from '$lib/core/persistence/persist'
	import '../app.css'

	let { children } = $props()

	const POLL_MS = 1500
	let pollTimer: ReturnType<typeof setTimeout> | null = null
	let polling = false

	async function pollLoop() {
		if (!polling) return
		await downloadStore.tickStatus()
		if (polling) pollTimer = setTimeout(pollLoop, POLL_MS)
	}

	const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

	registerPlatformAdapter()

	appState.status = 'booting' as AppStatus

	let splashDismissed = $state(false)
	let settingsLoaded = $state(false)
	let themeEditorOpen = $state(false)
	let themeEditorId = $state<string | null>(null)
	let backendLogOpen = $state(false)

	$effect(() => {
		if (!isTauri) return
		function onDevKey(e: KeyboardEvent) {
			if (e.shiftKey && (e.ctrlKey || e.metaKey) && e.code === 'KeyI') {
				e.preventDefault()
				backendLogOpen = !backendLogOpen
			}
		}
		window.addEventListener('keydown', onDevKey, true)
		return () => window.removeEventListener('keydown', onDevKey, true)
	})

	const splashVisible = $derived(
		appState.status === 'booting' ||
			appState.status === 'locked' ||
			appState.status === 'error' ||
			(appState.status === 'ready' && !splashDismissed)
	)

	const splashMode = $derived(appState.status === 'locked' && settingsLoaded ? 'locked' : 'loading')
	const ringFull = $derived(appState.status === 'ready')
	const showApp = $derived(!splashVisible)

	function onSplashReady() {
		splashDismissed = true
	}
	function onSplashUnlock() {
		appState.status = 'ready'
		splashDismissed = true
	}
	function onSplashBypass() {
		bypassBoot()
		splashDismissed = true
	}
	function onSplashRetry() {
		retryBoot()
	}

	const isMediaRoute = $derived($page.url.pathname.startsWith('/media'))
	const readerContainerized = $derived(settingsState.settings.readerContainerized ?? false)
	const strippedLayout = $derived(isMediaRoute && !readerContainerized)
	const showTitleBar = $derived(isTauri && (settingsState.settings.windowControls ?? true))

	onMount(() => {
		async function init() {
			try {
				await initApp()

				void subscribeBackend()

				const [persistedSettings, persistedLibrary] = await Promise.all([loadSettings(), loadLibrary()])
				const raw = persistedSettings?.settings ?? persistedSettings ?? null
				await loadSettingsIntoState(raw)

				const { historyState } = await import('$lib/state/history.svelte')
				const { seriesState: s } = await import('$lib/state/series.svelte')

				historyState.load(persistedLibrary.sessions, persistedLibrary.dailyReadCounts)
				s.bookmarks = persistedLibrary.bookmarks

				settingsLoaded = true
				checkForChangelog()

				applyTheme(settingsState.settings.theme ?? 'dark', settingsState.settings.customThemes ?? [])

				await startProbe(100)

				polling = true
				pollLoop()
			} catch (e) {
				appState.error = e instanceof Error ? e.message : String(e)
				appState.status = 'error'
			}
		}

		init()

		return () => {
			polling = false
			if (pollTimer !== null) {
				clearTimeout(pollTimer)
				pollTimer = null
			}
			discord.destroyRpc()
			platformService.destroy()
		}
	})

	let vw = $state(1440)
	let vh = $state(820)
	$effect(() => {
		const measure = () => { vw = window.innerWidth; vh = window.innerHeight }
		measure()
		window.addEventListener('resize', measure)
		return () => window.removeEventListener('resize', measure)
	})
	const uiZoomFactor = $derived(
		Math.max(0.6, Math.min(
			4,
			Math.max(0.8, Math.min(vw / 1440, vh / 820)) * (settingsState.settings.uiZoom ?? 1.0),
		)),
	)
	$effect(() => {
		document.documentElement.style.zoom = String(uiZoomFactor)
		document.documentElement.style.setProperty('--ui-zoom-factor', String(uiZoomFactor))
	})

	$effect(() => {
		applyTheme(settingsState.settings.theme ?? 'dark', settingsState.settings.customThemes ?? [])
	})

	$effect(() => {
		mountSystemThemeSync(
			settingsState.settings.systemThemeSync ?? false,
			settingsState.settings.systemThemeDark ?? 'dark',
			settingsState.settings.systemThemeLight ?? 'light',
			(id) => updateSettings({ theme: id })
		)
	})

	$effect(() => {
		if (appState.status === 'ready' && settingsLoaded) maybeStartOnboarding()
	})

	$effect(() => {
		if (appState.status === 'booting') splashDismissed = false
	})

	$effect(() => {
		if (settingsState.settings.discordRpc) {
			discord
				.initRpc()
				.then(() => discord.setIdle())
				.catch(() => {})
		} else {
			discord.destroyRpc().catch(() => {})
		}
	})

	$effect(() => {
		if (!isMediaRoute) discord.setIdle().catch(() => {})
	})

	$effect(() => {
		if (appState.idleSplash || appState.devSplash) discord.setAway().catch(() => {})
		else discord.clearAway().catch(() => {})
	})

	let idleTimer: ReturnType<typeof setTimeout> | null = null
	let idleDismissLock = false

	function onIdleDismiss() {
		if (idleDismissLock) return
		idleDismissLock = true
		appState.idleSplash = false
		setTimeout(() => {
			idleDismissLock = false
		}, 400)
	}

	function armIdleTimer() {
		if (idleTimer !== null) clearTimeout(idleTimer)
		const mins = settingsState.settings.idleTimeoutMin ?? 5
		if (mins <= 0) return
		idleTimer = setTimeout(() => {
			if (appState.status === 'ready' && !appState.idleSplash) appState.idleSplash = true
		}, mins * 60_000)
	}

	$effect(() => {
		if (appState.status !== 'ready') return

		const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'wheel', 'click'] as const
		for (const e of events) document.addEventListener(e, armIdleTimer, { capture: true, passive: true })
		armIdleTimer()

		return () => {
			if (idleTimer !== null) {
				clearTimeout(idleTimer)
				idleTimer = null
			}
			for (const e of events) document.removeEventListener(e, armIdleTimer, { capture: true })
		}
	})

	function openThemeEditor(id?: string | null) {
		themeEditorId = id ?? null
		themeEditorOpen = true
	}
</script>

{#if splashVisible}
	<SplashScreen
		mode={splashMode}
		{ringFull}
		failed={appState.status === 'error'}
		pinLen={settingsState.settings.appLockPin?.length ?? 0}
		pinCorrect={settingsState.settings.appLockPin ?? ''}
		windowsHelloEnabled={settingsState.settings.appLockWindowsHello ?? false}
		errorMessage={boot.errorMessage}
		errorLog={boot.errorLog}
		onReady={onSplashReady}
		onUnlock={onSplashUnlock}
		onBypass={onSplashBypass}
		onSkip={onSplashBypass}
		onRetry={onSplashRetry}
		onCopyLog={() => navigator.clipboard.writeText(boot.errorLog).catch(() => {})}
		onOpenDataDir={openBackendDataDir}
	/>
{/if}

{#if appState.idleSplash}
	<SplashScreen mode="idle" showCards={settingsState.settings.splashCards ?? true} onDismiss={onIdleDismiss} />
{/if}

{#if appState.devSplash}
	<SplashScreen mode="idle" showDevOverlay onDismiss={() => (appState.devSplash = false)} />
{/if}

{#if showApp}
	{#if strippedLayout}
		{@render children()}
	{:else}
		<div class="frame">
			{#if showTitleBar}
				<TitleBar onClose={() => platformService.close()} />
			{/if}
			<div class="padding" class:padding-web={!showTitleBar}>
				<div class="shell">
					<div class="body">
						<Sidebar />
						<main class="main">
							{@render children()}
						</main>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}

{#if app.settingsOpen}
	<Settings onclose={() => app.setSettingsOpen(false)} onOpenThemeEditor={openThemeEditor} />
{/if}

{#if themeEditorOpen}
	<ThemeEditor editingId={themeEditorId} onClose={() => (themeEditorOpen = false)} />
{/if}

{#if backendLogOpen}
	<BackendLog onClose={() => (backendLogOpen = false)} />
{/if}

<Onboarding />
<TourOverlay />
<TourFinish />
<ChangelogModal />
<Toaster toasts={notifications.toasts} />
{#if seriesState.previewManga}
	<MangaPreview />
{/if}

<style>
	.frame {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		overflow: hidden;
	}

	.padding {
		display: flex;
		flex: 1;
		padding: 0 15px 15px;
		min-height: 0;
		min-width: 0;
	}

	.padding-web {
		padding-top: 15px;
	}

	.shell {
		display: flex;
		flex-direction: column;
		flex: 1;
		border-radius: var(--radius-2xl);
		overflow: hidden;
		border: 1px solid var(--border-dim);
		background: var(--bg-base);
		min-height: 0;
		min-width: 0;
	}

	.body {
		display: flex;
		flex: 1;
		min-height: 0;
		min-width: 0;
	}

	.main {
		flex: 1;
		overflow: hidden;
		background: var(--bg-surface);
		transform: translateZ(0);
		contain: layout style;
		min-width: 0;
	}
</style>
