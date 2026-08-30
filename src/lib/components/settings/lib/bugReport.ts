import { appState }      from '$lib/state/app.svelte'
import { settingsState } from '$lib/state/settings.svelte'
import type { Settings } from '$lib/types/settings'

export type ReportType = 'bug' | 'feature'

export const SETTINGS_GROUPS: { label: string; keys: (keyof Settings)[] }[] = [
  {
    label: 'Library',
    keys: [
      'libraryStatsAlways', 'libraryCropCovers', 'libraryPageSize',
      'libraryBranches', 'libraryShowAllInSaved', 'libraryHideCompletedInSaved',
      'savedIsDefaultCategory', 'defaultLibraryCategoryId',
    ],
  },
  {
    label: 'Reader',
    keys: [
      'pageStyle', 'fitMode', 'readingDirection', 'readerZoom',
      'pageGap', 'optimizeContrast', 'offsetDoubleSpreads',
      'preloadPages', 'autoMarkRead', 'autoNextChapter',
      'markReadOnNext', 'autoBookmark', 'autoScroll', 'autoScrollSpeed',
      'readerDebounceMs', 'readerContainerized', 'barPosition',
    ],
  },
  {
    label: 'Server',
    keys: ['serverUrl'],
  },
  {
    label: 'Appearance',
    keys: ['theme', 'uiZoom', 'compactSidebar', 'gpuAcceleration', 'qolAnimations', 'systemThemeSync'],
  },
  {
    label: 'Downloads',
    keys: ['downloadToastsEnabled', 'downloadAutoRetry', 'storageLimitGb', 'serverDownloadsPath'],
  },
  {
    label: 'Content & Extensions',
    keys: ['contentLevel', 'sourceOverridesEnabled', 'preferredExtensionLang'],
  },
  {
    label: 'Automation',
    keys: ['automationEnabled', 'automationEnforceGlobal'],
  },
  {
    label: 'Tracking',
    keys: ['trackerSyncBack', 'trackerSyncBackThreshold', 'trackerRespectScanlatorFilter'],
  },
  {
    label: 'Performance',
    keys: ['renderLimit', 'pinchZoom'],
  },
]

const REDACTED = new Set<keyof Settings>([
  'serverAuthUser', 'serverAuthPass', 'appLockPin',
  'keybinds', 'customThemes', 'heroSlots', 'mangaLinks', 'mangaPrefs',
  'libraryTabSort', 'libraryTabStatus', 'libraryTabFilters',
  'nsfwAllowedSourceIds', 'nsfwBlockedSourceIds',
  'mangaReaderSettings', 'readerPresets',
  'hiddenCategoryIds', 'libraryPinnedTabOrder', 'hiddenLibraryTabs',
  'pinnedSourceIds', 'extraScanDirs',
])

function detectOs(): string {
  const ua = navigator.userAgent
  if (ua.includes('Windows NT 10.0')) {
    const build = ua.match(/Windows NT 10\.0(?:\.(\d+))?/)
    return build ? `Windows 10/11 (NT ${build[0].replace('Windows ', '')})` : 'Windows 10/11'
  }
  if (ua.includes('Windows')) return 'Windows'
  if (ua.includes('Mac OS X')) {
    const v = ua.match(/Mac OS X ([\d_]+)/)
    return v ? `macOS ${v[1].replace(/_/g, '.')}` : 'macOS'
  }
  if (ua.includes('Linux')) return 'Linux'
  return 'unknown'
}

export function buildEnvironmentBlock(serverVersion?: string): string {
  const s = settingsState.settings
  const host = (() => { try { return new URL(s.serverUrl || '').host } catch { return s.serverUrl || 'unknown' } })()
  const serverLine = serverVersion
    ? `- Server: Tsunagu ${serverVersion} (${host})`
    : `- Server: Tsunagu (${host})`
  return [
    `- Moku Version: ${appState.version || 'unknown'}`,
    `- Platform: ${appState.platform}`,
    `- OS: ${detectOs()}`,
    serverLine,
  ].join('\n')
}

export function buildSettingsBlock(keys: (keyof Settings)[]): string {
  const s = settingsState.settings
  return keys
    .filter(k => !REDACTED.has(k))
    .map(k => {
      const v = s[k]
      if (v === undefined || v === null) return `${k}: ~`
      if (typeof v === 'string' && v === '') return `${k}: ""`
      return `${k}: ${JSON.stringify(v)}`
    })
    .join('\n')
}

export interface BugFields {
  description: string
  steps:       string
  expected:    string
  actual:      string
}

export interface FeatureFields {
  problem:      string
  solution:     string
  alternatives: string
}

export function buildIssueUrl(
  type:          ReportType,
  settingsBlock: string,
  title:         string,
  fields:        BugFields | FeatureFields,
  serverVersion?: string,
): string {
  const base = 'https://github.com/moku-project/Moku/issues/new'

  const prefix = type === 'bug' ? '[Bug] ' : '[Feature Request] '
  const common = {
    template:    type === 'bug' ? 'bug_report.yml' : 'feature_request.yml',
    title:       title.startsWith(prefix) ? title : `${prefix}${title}`,
    environment: buildEnvironmentBlock(serverVersion),
  }

  const specific = type === 'bug'
    ? {
        description: (fields as BugFields).description,
        steps:       (fields as BugFields).steps,
        expected:    (fields as BugFields).expected,
        actual:      (fields as BugFields).actual,
        settings:    settingsBlock,
      }
    : {
        problem:      (fields as FeatureFields).problem,
        solution:     (fields as FeatureFields).solution,
        alternatives: (fields as FeatureFields).alternatives,
      }

  const merged: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...common, ...specific })) {
    if (v !== undefined) merged[k] = v
  }
  const params = new URLSearchParams(merged)
  return `${base}?${params.toString()}`
}