<script lang="ts">
	import { onMount } from 'svelte'
	import { Terminal, ArrowLineDown, Copy, Check, Broom, X } from 'phosphor-svelte'

	let { onClose }: { onClose: () => void } = $props()

	let lines = $state<string[]>([])
	let box = $state<HTMLDivElement | null>(null)
	let follow = $state(true)
	let copied = $state(false)
	let height = $state(46)

	type Level = 'err' | 'warn' | 'ok' | 'dim' | 'std'

	function classify(line: string): Level {
		const l = line.toLowerCase()
		if (/\b(error|exception|panic|fatal|failed|traceback)\b/.test(l)) return 'err'
		if (/\b(warn|warning|deprecated)\b/.test(l)) return 'warn'
		if (/tsunagu_ready|\b(ready|listening|started|serving)\b/.test(l)) return 'ok'
		if (/\b(debug|trace)\b/.test(l)) return 'dim'
		return 'std'
	}

	function scrollDown() {
		if (follow && box) box.scrollTop = box.scrollHeight
	}

	onMount(() => {
		let disposed = false
		let unlisten: (() => void) | null = null

		;(async () => {
			try {
				const { invoke } = await import('@tauri-apps/api/core')
				const { listen } = await import('@tauri-apps/api/event')
				lines = await invoke<string[]>('get_backend_log').catch(() => [])
				queueMicrotask(scrollDown)
				const un = await listen<string>('backend-log', ({ payload }) => {
					lines = [...lines, payload].slice(-8000)
					queueMicrotask(scrollDown)
				})
				if (disposed) un()
				else unlisten = un
			} catch {
				/* not running under tauri */
			}
		})()

		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') {
				e.preventDefault()
				e.stopPropagation()
				onClose()
			}
		}
		window.addEventListener('keydown', onKey, true)

		return () => {
			disposed = true
			unlisten?.()
			window.removeEventListener('keydown', onKey, true)
		}
	})

	function onScroll() {
		if (!box) return
		follow = box.scrollHeight - box.scrollTop - box.clientHeight < 48
	}

	function copyAll() {
		navigator.clipboard.writeText(lines.join('\n')).then(() => {
			copied = true
			setTimeout(() => (copied = false), 1200)
		}).catch(() => {})
	}

	function enableFollow() {
		follow = true
		scrollDown()
	}

	function startResize(e: PointerEvent) {
		e.preventDefault()
		const startY = e.clientY
		const startH = height
		const move = (ev: PointerEvent) => {
			const vh = (startH * window.innerHeight) / 100 + (startY - ev.clientY)
			height = Math.min(85, Math.max(18, (vh / window.innerHeight) * 100))
		}
		const up = () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', up)
		}
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
	}
</script>

<section class="panel" style="height:{height}vh" aria-label="Server log">
	<div
		class="grip"
		role="separator"
		aria-label="Resize"
		aria-orientation="horizontal"
		tabindex="-1"
		onpointerdown={startResize}
	></div>

	<header>
		<Terminal size={14} weight="bold" class="hdr-icon" />
		<span class="title">Server Log</span>
		<span class="count">{lines.length}</span>
		<span class:live={follow} class="dot" title={follow ? 'Live' : 'Paused'}></span>

		<span class="spacer"></span>

		<button class:active={follow} onclick={enableFollow} title="Jump to latest">
			<ArrowLineDown size={13} weight="bold" />
		</button>
		<button onclick={copyAll} title="Copy all">
			{#if copied}<Check size={13} weight="bold" />{:else}<Copy size={13} weight="regular" />{/if}
		</button>
		<button onclick={() => (lines = [])} title="Clear">
			<Broom size={13} weight="regular" />
		</button>
		<button class="close" onclick={onClose} title="Close (Esc)">
			<X size={13} weight="bold" />
		</button>
	</header>

	<div class="body" bind:this={box} onscroll={onScroll}>
		{#if lines.length === 0}
			<p class="empty">Waiting for server output…</p>
		{:else}
			{#each lines as line, i (i)}
				<div class="line {classify(line)}">{line}</div>
			{/each}
		{/if}
	</div>
</section>

<style>
	.panel {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 100000;
		display: flex;
		flex-direction: column;
		background: var(--bg-base);
		color: var(--text-secondary);
		border-top: 1px solid var(--border-strong);
		box-shadow: 0 -14px 40px rgba(0, 0, 0, 0.55);
		font-family: var(--font-ui);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	.grip {
		position: absolute;
		top: -3px;
		left: 0;
		right: 0;
		height: 7px;
		cursor: ns-resize;
	}
	.grip::after {
		content: '';
		position: absolute;
		inset: 3px 0 auto 0;
		height: 1px;
		background: transparent;
		transition: background var(--t-fast);
	}
	.grip:hover::after {
		background: var(--accent);
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border-base);
		user-select: none;
	}
	header :global(.hdr-icon) {
		color: var(--accent-fg);
		flex-shrink: 0;
	}
	.title {
		font-size: var(--text-xs);
		font-weight: var(--weight-semi);
		letter-spacing: var(--tracking-wide);
		text-transform: uppercase;
		color: var(--text-secondary);
	}
	.count {
		font-size: var(--text-2xs);
		font-variant-numeric: tabular-nums;
		color: var(--text-faint);
		background: var(--bg-raised);
		border: 1px solid var(--border-dim);
		border-radius: var(--radius-full);
		padding: 0 6px;
		min-width: 20px;
		text-align: center;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--text-disabled);
		flex-shrink: 0;
	}
	.dot.live {
		background: var(--color-success);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-success) 22%, transparent);
		animation: pulse 1.8s ease infinite;
	}

	.spacer {
		flex: 1;
	}

	header button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-md);
		color: var(--text-muted);
		background: none;
		border: 1px solid transparent;
		cursor: pointer;
		transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast);
	}
	header button:hover {
		color: var(--text-primary);
		background: var(--bg-raised);
	}
	header button.active {
		color: var(--accent-fg);
		border-color: var(--accent-dim);
		background: var(--accent-muted);
	}
	header button.close:hover {
		color: var(--color-error);
		background: color-mix(in srgb, var(--color-error) 12%, transparent);
	}

	.body {
		flex: 1;
		overflow: auto;
		padding: var(--sp-2) var(--sp-3) var(--sp-4);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.empty {
		color: var(--text-faint);
		font-size: var(--text-xs);
		letter-spacing: var(--tracking-wide);
		padding: var(--sp-3) var(--sp-1);
	}

	.line {
		min-height: 1.55em;
		padding: 0 var(--sp-1);
		border-left: 2px solid transparent;
		margin-left: -2px;
	}
	.line:hover {
		background: var(--bg-raised);
	}
	.line.err {
		color: var(--color-error);
		border-left-color: var(--color-error);
	}
	.line.warn {
		color: #d9a441;
	}
	.line.ok {
		color: var(--color-success);
	}
	.line.dim {
		color: var(--text-faint);
	}
</style>
