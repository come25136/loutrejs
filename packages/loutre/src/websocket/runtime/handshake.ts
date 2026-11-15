import { type CompiledWebSocketRoute } from '../compiled.js'
import { validateSchema } from '../../core/index.js'

export async function validateOpeningRequest(
  request: Request,
  rawParams: Readonly<Record<string, string>>,
  route: CompiledWebSocketRoute,
): Promise<{
  readonly params: Readonly<Record<string, unknown>>
  readonly query: unknown
  readonly headers: unknown
}> {
  const params = route.handshake?.params
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(route.handshake.params).map(async ([name, schema]) => [
            name,
            await validateSchema(schema, rawParams[name]),
          ]),
        ),
      )
    : rawParams
  const url = new URL(request.url)
  const rawQuery = decodeQuery(url.searchParams)
  const query = route.handshake?.query
    ? await validateSchema(route.handshake.query, rawQuery)
    : rawQuery
  const headers = route.handshake?.headers
    ? await validateSchema(
        route.handshake.headers,
        Object.fromEntries(request.headers),
      )
    : request.headers
  return { params, query, headers }
}

function decodeQuery(
  searchParams: URLSearchParams,
): Readonly<Record<string, string | string[]>> {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of searchParams) {
    const current = query[key]
    query[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value]
  }
  return query
}
