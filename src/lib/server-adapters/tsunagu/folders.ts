import { gql, baseUrl } from './gql'
import type { Folder, LibraryEntry } from '$lib/server-adapters/types'

export const folders = {
	async folders(): Promise<Folder[]> {
		const data = await gql<{ folders: Folder[] }>(
			`query Folders { folders { id name kind systemKey parentFolderId sortOrder includeInUpdate includeInDownload } }`,
			undefined,
			baseUrl()
		)
		return data.folders
	},

	async folder(id: string): Promise<Folder | null> {
		const data = await gql<{ folder: Folder | null }>(
			`query Folder($id: ID!) { folder(id: $id) { id name kind systemKey parentFolderId sortOrder includeInUpdate includeInDownload } }`,
			{ id },
			baseUrl()
		)
		return data.folder
	},

	async entriesInFolder(folderId: string): Promise<LibraryEntry[]> {
		const data = await gql<{ mediaInFolder: LibraryEntry[] }>(
			`query MediaInFolder($folderId: ID!) {
				mediaInFolder(folderId: $folderId) {
					id extensionId extensionName externalId contentType title thumbnailUrl description status addedAt
				}
			}`,
			{ folderId },
			baseUrl()
		)
		return data.mediaInFolder
	},

	async createFolder(name: string, parentFolderId?: string): Promise<Folder> {
		const data = await gql<{ createFolder: Folder }>(
			`mutation CreateFolder($name: String!, $parentFolderId: ID) {
				createFolder(name: $name, parentFolderId: $parentFolderId) { id name kind systemKey parentFolderId sortOrder includeInUpdate includeInDownload }
			}`,
			{ name, parentFolderId },
			baseUrl()
		)
		return data.createFolder
	},

	async renameFolder(folderId: string, name: string): Promise<Folder> {
		const data = await gql<{ renameFolder: Folder }>(
			`mutation RenameFolder($folderId: ID!, $name: String!) {
				renameFolder(folderId: $folderId, name: $name) { id name kind systemKey parentFolderId sortOrder includeInUpdate includeInDownload }
			}`,
			{ folderId, name },
			baseUrl()
		)
		return data.renameFolder
	},

	async deleteFolder(folderId: string): Promise<boolean> {
		const data = await gql<{ deleteFolder: boolean }>(
			`mutation DeleteFolder($folderId: ID!) { deleteFolder(folderId: $folderId) }`,
			{ folderId },
			baseUrl()
		)
		return data.deleteFolder
	},

	async addEntryToFolder(libraryEntryId: string, folderId: string): Promise<boolean> {
		const data = await gql<{ addMediaToFolder: boolean }>(
			`mutation AddMediaToFolder($mediaId: ID!, $folderId: ID!) {
				addMediaToFolder(mediaId: $mediaId, folderId: $folderId)
			}`,
			{ mediaId: libraryEntryId, folderId },
			baseUrl()
		)
		return data.addMediaToFolder
	},

	async removeEntryFromFolder(libraryEntryId: string, folderId: string): Promise<boolean> {
		const data = await gql<{ removeMediaFromFolder: boolean }>(
			`mutation RemoveMediaFromFolder($mediaId: ID!, $folderId: ID!) {
				removeMediaFromFolder(mediaId: $mediaId, folderId: $folderId)
			}`,
			{ mediaId: libraryEntryId, folderId },
			baseUrl()
		)
		return data.removeMediaFromFolder
	},

	async reorderFolder(folderId: string, sortOrder: number): Promise<Folder> {
		const data = await gql<{ reorderFolder: Folder }>(
			`mutation ReorderFolder($folderId: ID!, $sortOrder: Int!) {
				reorderFolder(folderId: $folderId, sortOrder: $sortOrder) {
					id name kind systemKey parentFolderId sortOrder includeInUpdate includeInDownload
				}
			}`,
			{ folderId, sortOrder },
			baseUrl()
		)
		return data.reorderFolder
	},

	async refreshFolder(folderId: string): Promise<LibraryEntry[]> {
		const data = await gql<{ refreshFolder: LibraryEntry[] }>(
			`mutation RefreshFolder($folderId: ID!) {
				refreshFolder(folderId: $folderId) {
					id extensionId extensionName externalId contentType title
					thumbnailUrl description status author artist extensionRemovedAt addedAt
				}
			}`,
			{ folderId },
			baseUrl()
		)
		return data.refreshFolder
	},

	async updateFolderFlags(
		folderId: string,
		flags: { includeInUpdate?: boolean; includeInDownload?: boolean }
	): Promise<Folder> {
		const data = await gql<{ updateFolderFlags: Folder }>(
			`mutation UpdateFolderFlags($folderId: ID!, $includeInUpdate: Boolean, $includeInDownload: Boolean) {
				updateFolderFlags(folderId: $folderId, includeInUpdate: $includeInUpdate, includeInDownload: $includeInDownload) {
					id name kind systemKey parentFolderId sortOrder includeInUpdate includeInDownload
				}
			}`,
			{ folderId, ...flags },
			baseUrl()
		)
		return data.updateFolderFlags
	},
}
