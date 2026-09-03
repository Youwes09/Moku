import { settingsState, updateSettings } from '$lib/state/settings.svelte'
import { app } from '$lib/state/app.svelte'

export const onboardingState = $state({
  open: false,
})

export function maybeStartOnboarding() {
  if (!settingsState.settings.hasOnboarded) onboardingState.open = true
}

export function completeOnboarding() {
  onboardingState.open = false
  updateSettings({ hasOnboarded: true })
}

export function skipOnboarding() {
  completeOnboarding()
}

export function replayOnboarding() {
  onboardingState.open = true
}

export interface TourStep {
  selector:  string
  title:     string
  body:      string
  placement?: 'right' | 'bottom'
  route?:     string
  padding?:   number
  settingsTab?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    selector:  '[data-tour="sidebar-nav"]',
    title:     'Navigation',
    body:      'Library, Downloads, Recent and Extensions all live in this rail.',
    placement: 'right',
    padding:   16,
  },
  {
    selector:  '[data-tour="global-search"]',
    title:     'Search everything',
    body:      'Browse searches every installed source at once — by title, tag or genre.',
    placement: 'right',
    padding:   12,
  },
  {
    selector:  '[data-tour="content-switch"]',
    title:     'Manga, novels or anime',
    body:      'Switch the whole app between content types. “All” shows them together.',
    placement: 'right',
    padding:   12,
  },
  {
    selector:  '[data-tour="add-source"]',
    title:     'Add a source',
    body:      'Add an extension repo here, then install sources to start browsing.',
    placement: 'bottom',
    route:     '/extensions',
  },
  {
    selector:  '[data-tour="settings-btn"]',
    title:     'Settings',
    body:      'Reader and player options, content filtering, themes, server config and backups.',
    placement: 'right',
    padding:   12,
  },
  {
    selector:  '[data-tour="settings-tab-tracking"]',
    title:     'Track your progress',
    body:      'Connect AniList or MyAnimeList under Settings → Tracking to sync what you read and watch.',
    placement: 'right',
    padding:   8,
    settingsTab: 'tracking',
  },
]

export const tourState = $state({
  active:   false,
  step:     0,
  finished: false,
})

export function startTour() {
  app.setSettingsOpen(false)
  onboardingState.open = false
  tourState.step     = 0
  tourState.active   = true
  tourState.finished = false
}

export function nextTourStep() {
  if (tourState.step >= TOUR_STEPS.length - 1) { finishTourSteps(); return }
  tourState.step++
}

export function endTour() {
  tourState.active   = false
  tourState.finished = false
  app.setSettingsOpen(false)
}

async function finishTourSteps() {
  tourState.active = false
  app.setSettingsOpen(false)
  const { goto } = await import('$app/navigation')
  await goto('/')
  tourState.finished = true
}

export function finishTour() {
  tourState.finished = false
}