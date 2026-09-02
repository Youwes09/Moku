import { gql, baseUrl } from './gql'
import type { StorageInfo, DatabaseBackup } from '$lib/server-adapters/types'

const STORAGE_FIELDS = `
	usedBytes totalBytes freeBytes dataDir mediaDir databasePath
	categories { key label path bytes fileCount clearable }
`
const BACKUP_FIELDS = `name path bytes createdAt`

export const storage = {
	async storageInfo(): Promise<StorageInfo> {
		const data = await gql<{ storageInfo: StorageInfo }>(
			`query StorageInfo { storageInfo { ${STORAGE_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.storageInfo
	},

	async clearStorageCategory(key: string): Promise<StorageInfo> {
		const data = await gql<{ clearStorageCategory: StorageInfo }>(
			`mutation ClearStorageCategory($key: String!) {
				clearStorageCategory(key: $key) { ${STORAGE_FIELDS} }
			}`,
			{ key },
			baseUrl(),
		)
		return data.clearStorageCategory
	},

	async databaseBackups(): Promise<DatabaseBackup[]> {
		const data = await gql<{ databaseBackups: DatabaseBackup[] }>(
			`query DatabaseBackups { databaseBackups { ${BACKUP_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.databaseBackups
	},

	async createDatabaseBackup(): Promise<DatabaseBackup> {
		const data = await gql<{ createDatabaseBackup: DatabaseBackup }>(
			`mutation CreateDatabaseBackup { createDatabaseBackup { ${BACKUP_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.createDatabaseBackup
	},

	async deleteDatabaseBackup(name: string): Promise<boolean> {
		const data = await gql<{ deleteDatabaseBackup: boolean }>(
			`mutation DeleteDatabaseBackup($name: String!) { deleteDatabaseBackup(name: $name) }`,
			{ name },
			baseUrl(),
		)
		return data.deleteDatabaseBackup
	},
}
