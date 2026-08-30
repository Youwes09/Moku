import { gql, baseUrl } from './gql'
import type { Extension } from '$lib/server-adapters/types'

export const extensions = {
	async availableExtensions(repositoryId: string): Promise<Extension[]> {
		const data = await gql<{ availableExtensions: Extension[] }>(
			`query AvailableExtensions($repositoryId: ID!) {
				availableExtensions(repositoryId: $repositoryId) {
					id repositoryId packageName name displayName version contentType lang iconUrl
					isNsfw supportsLatest
					apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate
				}
			}`,
			{ repositoryId },
			baseUrl()
		)
		return data.availableExtensions
	},

	async installedExtensions(): Promise<Extension[]> {
		const data = await gql<{ installedExtensions: Extension[] }>(
			`query InstalledExtensions {
				installedExtensions {
					id repositoryId packageName name displayName version contentType lang iconUrl
					isNsfw supportsLatest
					apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate
				}
			}`,
			undefined,
			baseUrl()
		)
		return data.installedExtensions
	},

	async installExtension(packageName: string): Promise<Extension> {
		const data = await gql<{ installExtension: Extension }>(
			`mutation InstallExtension($packageName: String!) {
				installExtension(packageName: $packageName) {
					id repositoryId packageName name displayName version contentType lang iconUrl
					isNsfw supportsLatest
					apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate
				}
			}`,
			{ packageName },
			baseUrl()
		)
		return data.installExtension
	},

	async uninstallExtension(packageName: string): Promise<Extension> {
		const data = await gql<{ uninstallExtension: Extension }>(
			`mutation UninstallExtension($packageName: String!) {
				uninstallExtension(packageName: $packageName) {
					id repositoryId packageName name displayName version contentType lang iconUrl
					isNsfw supportsLatest
					apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate
				}
			}`,
			{ packageName },
			baseUrl()
		)
		return data.uninstallExtension
	},

	async updateExtension(packageName: string): Promise<Extension> {
		const data = await gql<{ updateExtension: Extension }>(
			`mutation UpdateExtension($packageName: String!) {
				updateExtension(packageName: $packageName) {
					id repositoryId packageName name displayName version contentType lang iconUrl
					isNsfw supportsLatest
					apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate
				}
			}`,
			{ packageName },
			baseUrl()
		)
		return data.updateExtension
	},

	async installExternalExtension(url: string): Promise<Extension> {
		const data = await gql<{ installExternalExtension: Extension }>(
			`mutation InstallExternalExtension($url: String!) {
				installExternalExtension(url: $url) {
					id repositoryId packageName name displayName version contentType lang iconUrl
					isNsfw supportsLatest
					apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate
				}
			}`,
			{ url },
			baseUrl()
		)
		return data.installExternalExtension
	},
}
