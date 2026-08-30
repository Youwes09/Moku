export class GraphQLError extends Error {
	constructor(message: string, public errors: unknown[]) {
		super(message)
		this.name = 'GraphQLError'
	}
}

export async function gql<T>(
	query: string,
	variables: Record<string, unknown> | undefined,
	baseUrl: string,
	signal?: AbortSignal,
): Promise<T> {
	const res = await fetch(`${baseUrl}/api/graphql`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query, variables }),
		signal,
	})

	if (!res.ok) {
		throw new Error(`GraphQL request failed: HTTP ${res.status}`)
	}

	const json = await res.json()

	if (json.errors?.length) {
		throw new GraphQLError(json.errors[0]?.message ?? 'GraphQL error', json.errors)
	}

	return json.data as T
}
