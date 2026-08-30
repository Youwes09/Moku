import { platformService } from '$lib/platform-service'

export async function externalFetch(url: string, init: RequestInit): Promise<Response> {
  if (platformService.platform === 'tauri') {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(url, init)
  }
  return fetch(url, init)
}
