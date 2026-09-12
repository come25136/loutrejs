import { validateSchema, type StandardSchemaV1 } from '../../core/index.js'

type HttpHeaderValue = string | readonly string[]
type HttpHeaders = Readonly<Record<string, HttpHeaderValue | undefined>>

interface HttpResponseHeadersWithDefaults {
  readonly schema: StandardSchemaV1
  readonly defaults: HttpHeaders
}

type HttpResponseHeadersDefinition =
  | StandardSchemaV1
  | HttpHeaders
  | HttpResponseHeadersWithDefaults

export async function validateResponseHeaders(
  schema: StandardSchemaV1 | undefined,
  headers: HttpHeaders | undefined,
): Promise<HttpHeaders | undefined> {
  if (!schema) {
    if (headers !== undefined) {
      throw new Error('Undeclared HTTP response header was returned')
    }
    return undefined
  }
  const validated = await validateSchema(schema, headers)
  if (validated === undefined) return undefined
  if (!isHttpHeaders(validated)) {
    throw new Error('HTTP response header schema produced an invalid value')
  }
  return validated
}

export function responseHeadersSchema(
  headers: HttpResponseHeadersDefinition | undefined,
): StandardSchemaV1 | undefined {
  if (isStandardSchema(headers)) return headers
  if (isResponseHeadersWithDefaults(headers)) return headers.schema
  return undefined
}

export function responseHeadersDefaults(
  headers: HttpResponseHeadersDefinition | undefined,
): HttpHeaders | undefined {
  if (headers === undefined || isStandardSchema(headers)) return undefined
  if (isResponseHeadersWithDefaults(headers)) return headers.defaults
  return headers
}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return typeof value === 'object' && value !== null && '~standard' in value
}

export function isResponseHeadersWithDefaults(
  value: unknown,
): value is HttpResponseHeadersWithDefaults {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    isStandardSchema(value.schema)
  )
}

export function mergeResponseHeaders(
  defaults: HttpHeaders | undefined,
  dynamic: HttpHeaders | undefined,
): Headers {
  const headers = new Headers()
  applyResponseHeaders(headers, defaults)
  applyResponseHeaders(headers, dynamic)
  return headers
}

export function applyResponseHeaders(
  headers: Headers,
  source: HttpHeaders | undefined,
): void {
  if (!source) return
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    headers.delete(name)
    if (typeof value === 'string') {
      headers.set(name, value)
      continue
    }
    for (const item of value) headers.append(name, item)
  }
}

export function applyFrameworkHeadersToResponse(
  response: Response,
  source: Headers | undefined,
): Response {
  if (!source) return response
  const headers = new Headers(response.headers)
  applyFrameworkResponseHeaders(headers, Object.fromEntries(source.entries()))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function applyFrameworkResponseHeaders(
  headers: Headers,
  source: HttpHeaders | undefined,
): void {
  if (!source) return
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    if (name.toLowerCase() === 'vary') {
      const values = typeof value === 'string' ? [value] : value
      for (const item of values.flatMap((header) => header.split(','))) {
        appendVary(headers, item.trim())
      }
      continue
    }
    applyResponseHeaders(headers, { [name]: value })
  }
}

function isHttpHeaders(value: unknown): value is HttpHeaders {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return Object.values(value).every(
    (header) =>
      header === undefined ||
      typeof header === 'string' ||
      (Array.isArray(header) &&
        header.every((item) => typeof item === 'string')),
  )
}

function appendVary(headers: Headers, value: string): void {
  if (value.length === 0) return
  const values = (headers.get('vary') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value)
  }
  headers.set('vary', values.join(', '))
}
