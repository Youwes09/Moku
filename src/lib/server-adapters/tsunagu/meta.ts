import { gql, baseUrl } from './gql'
import type { AboutServer } from '$lib/server-adapters/types'

export const meta = {
	async about(): Promise<AboutServer> {
		const data = await gql<{ about: AboutServer }>(
			`query About { about { name version buildTime } }`,
			undefined,
			baseUrl()
		)
		return data.about
	},
}
