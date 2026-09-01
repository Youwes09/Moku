import { gql, baseUrl } from './gql'
import type { ContentFilterRule, AddContentFilterRuleInput } from '$lib/server-adapters/types'

const RULE_FIELDS = `id category field keyword minWeight blockLevel isDefault`

export const contentFilter = {
	async contentFilterRules(): Promise<ContentFilterRule[]> {
		const data = await gql<{ contentFilterRules: ContentFilterRule[] }>(
			`query ContentFilterRules { contentFilterRules { ${RULE_FIELDS} } }`,
			undefined,
			baseUrl(),
		)
		return data.contentFilterRules
	},

	async addContentFilterRule(input: AddContentFilterRuleInput): Promise<ContentFilterRule> {
		const data = await gql<{ addContentFilterRule: ContentFilterRule }>(
			`mutation AddContentFilterRule($category: String!, $field: FilterField!, $keyword: String!, $minWeight: Int, $blockLevel: ContentBlockLevel!) {
				addContentFilterRule(category: $category, field: $field, keyword: $keyword, minWeight: $minWeight, blockLevel: $blockLevel) { ${RULE_FIELDS} }
			}`,
			{ minWeight: 0, ...input },
			baseUrl(),
		)
		return data.addContentFilterRule
	},

	async removeContentFilterRule(id: string): Promise<boolean> {
		const data = await gql<{ removeContentFilterRule: boolean }>(
			`mutation RemoveContentFilterRule($id: ID!) { removeContentFilterRule(id: $id) }`,
			{ id },
			baseUrl(),
		)
		return data.removeContentFilterRule
	},

	async resetContentFilterRules(): Promise<boolean> {
		const data = await gql<{ resetContentFilterRules: boolean }>(
			`mutation ResetContentFilterRules { resetContentFilterRules }`,
			undefined,
			baseUrl(),
		)
		return data.resetContentFilterRules
	},

	async recomputeContentFilter(): Promise<boolean> {
		const data = await gql<{ recomputeContentFilter: boolean }>(
			`mutation RecomputeContentFilter { recomputeContentFilter }`,
			undefined,
			baseUrl(),
		)
		return data.recomputeContentFilter
	},
}
