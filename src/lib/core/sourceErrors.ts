import { GraphQLError } from '$lib/graphql/client'

export type SourceErrorCode =
	| 'SOURCE_CLOUDFLARE'
	| 'SOURCE_NOT_FOUND'
	| 'SOURCE_UNAVAILABLE'
	| 'SOURCE_RATE_LIMITED'
	| 'SOURCE_NETWORK'
	| 'SOURCE_PARSE'
	| 'INTERNAL'

export interface SourceErrorInfo {
	code: SourceErrorCode
	label: string
	message: string
	retriable: boolean
	cloudflare: boolean
	expected: boolean
}

const LABELS: Record<SourceErrorCode, { label: string; retriable: boolean; expected: boolean }> = {
	SOURCE_CLOUDFLARE:   { label: 'Behind Cloudflare',       retriable: false, expected: true },
	SOURCE_NOT_FOUND:    { label: 'Not found',               retriable: false, expected: true },
	SOURCE_UNAVAILABLE:  { label: 'Source unreachable',      retriable: true,  expected: true },
	SOURCE_NETWORK:      { label: 'Source unreachable',      retriable: true,  expected: true },
	SOURCE_RATE_LIMITED: { label: 'Rate limited',            retriable: true,  expected: true },
	SOURCE_PARSE:        { label: 'Source changed — the extension may need updating', retriable: false, expected: false },
	INTERNAL:            { label: 'Something went wrong',     retriable: true,  expected: false },
}

export function sourceErrorCode(e: unknown): SourceErrorCode | null {
	const raw = e instanceof GraphQLError ? e.code : undefined
	if (raw && raw in LABELS) return raw as SourceErrorCode
	return null
}

export function sourceErrorInfo(e: unknown): SourceErrorInfo | null {
	const code = sourceErrorCode(e)
	if (!code) return null
	const meta = LABELS[code]
	return {
		code,
		label: meta.label,
		message: e instanceof Error ? e.message : meta.label,
		retriable: meta.retriable,
		cloudflare: code === 'SOURCE_CLOUDFLARE',
		expected: meta.expected,
	}
}

export function isExpectedSourceNoise(e: unknown): boolean {
	const code = sourceErrorCode(e)
	return code != null && code !== 'INTERNAL' && code !== 'SOURCE_PARSE'
}
