import { gql, baseUrl } from './gql'
import type { Repository } from '$lib/server-adapters/types'

export const repositories = {
	async repositories(): Promise<Repository[]> {
		const data = await gql<{ repositories: Repository[] }>(
			`query Repositories { repositories { id indexUrl name contentType addedAt lastSyncedAt } }`,
			undefined,
			baseUrl()
		)
		return data.repositories
	},

	async addRepository(indexUrl: string, name?: string): Promise<Repository> {
		const data = await gql<{ addRepository: Repository }>(
			`mutation AddRepository($indexUrl: String!, $name: String) {
				addRepository(indexUrl: $indexUrl, name: $name) { id indexUrl name contentType addedAt lastSyncedAt }
			}`,
			{ indexUrl, name },
			baseUrl()
		)
		return data.addRepository
	},

	async renameRepository(repositoryId: string, name: string): Promise<Repository> {
		const data = await gql<{ renameRepository: Repository }>(
			`mutation RenameRepository($repositoryId: ID!, $name: String!) {
				renameRepository(repositoryId: $repositoryId, name: $name) { id indexUrl name contentType addedAt lastSyncedAt }
			}`,
			{ repositoryId, name },
			baseUrl()
		)
		return data.renameRepository
	},

	async deleteRepository(repositoryId: string): Promise<boolean> {
		const data = await gql<{ deleteRepository: boolean }>(
			`mutation DeleteRepository($repositoryId: ID!) { deleteRepository(repositoryId: $repositoryId) }`,
			{ repositoryId },
			baseUrl()
		)
		return data.deleteRepository
	},
}
