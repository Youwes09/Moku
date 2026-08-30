import { gql } from '$lib/graphql/client'
import { appState } from '$lib/state/app.svelte'

export function baseUrl(): string {
	return appState.serverUrl
}

export { gql }
