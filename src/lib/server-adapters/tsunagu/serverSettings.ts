import { gql, baseUrl } from './gql'
import type { ServerSetting, UpdateSettingResult, CloudflareSolver } from '$lib/server-adapters/types'

const FIELDS = `key value default type kind scope source editable description`
const CF_FIELDS = `state downloadProgress error supportedOnPlatform`

export const serverSettings = {
	async serverSettings(): Promise<ServerSetting[]> {
		const data = await gql<{ serverSettings: ServerSetting[] }>(
			`query ServerSettings { serverSettings { ${FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.serverSettings
	},

	async updateServerSetting(key: string, value: string): Promise<UpdateSettingResult> {
		const data = await gql<{ updateServerSetting: UpdateSettingResult }>(
			`mutation UpdateServerSetting($key: String!, $value: String!) {
				updateServerSetting(key: $key, value: $value) {
					setting { ${FIELDS} }
					restartRequired
				}
			}`,
			{ key, value },
			baseUrl(),
		)
		return data.updateServerSetting
	},

	async cloudflareSolver(): Promise<CloudflareSolver> {
		const data = await gql<{ cloudflareSolver: CloudflareSolver }>(
			`query CloudflareSolver { cloudflareSolver { ${CF_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.cloudflareSolver
	},

	async installCloudflareSolver(): Promise<CloudflareSolver> {
		const data = await gql<{ installCloudflareSolver: CloudflareSolver }>(
			`mutation InstallCloudflareSolver { installCloudflareSolver { ${CF_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.installCloudflareSolver
	},

	async uninstallCloudflareSolver(): Promise<CloudflareSolver> {
		const data = await gql<{ uninstallCloudflareSolver: CloudflareSolver }>(
			`mutation UninstallCloudflareSolver { uninstallCloudflareSolver { ${CF_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.uninstallCloudflareSolver
	},
}
