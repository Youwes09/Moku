import { gql, baseUrl } from './gql'
import type { Repository } from '$lib/server-adapters/types'

const REPO_FIELDS = `id indexUrl name contentType addedAt lastSyncedAt`

export const repositories = {
	async repositories(): Promise<Repository[]> {
		const data = await gql<{ repositories: Repository[] }>(
			`query Repositories { repositories { ${REPO_FIELDS} } }`,
			undefined,
			baseUrl()
		)
		return data.repositories
	},

	async addRepository(indexUrl: string, name?: string): Promise<Repository> {
		const data = await gql<{ addRepository: Repository }>(
			`mutation AddRepository($indexUrl: String!, $name: String) {
				addRepository(indexUrl: $indexUrl, name: $name) { ${REPO_FIELDS} }
			}`,
			{ indexUrl, name },
			baseUrl()
		)
		return data.addRepository
	},

	async renameRepository(repositoryId: string, name: string): Promise<Repository> {
		const data = await gql<{ renameRepository: Repository }>(
			`mutation RenameRepository($repositoryId: ID!, $name: String!) {
				renameRepository(repositoryId: $repositoryId, name: $name) { ${REPO_FIELDS} }
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

	async syncRepository(repositoryId: string): Promise<Repository> {
		const data = await gql<{ syncRepository: Repository }>(
			`mutation SyncRepository($repositoryId: ID!) {
				syncRepository(repositoryId: $repositoryId) { ${REPO_FIELDS} }
			}`,
			{ repositoryId },
			baseUrl()
		)
		return data.syncRepository
	},

	async syncRepositories(): Promise<Repository[]> {
		const data = await gql<{ syncRepositories: Repository[] }>(
			`mutation SyncRepositories { syncRepositories { ${REPO_FIELDS} } }`,
			undefined,
			baseUrl()
		)
		return data.syncRepositories
	},
}
