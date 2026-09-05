import {
  SchemaValidationError,
  type ContractBinding,
  type ContractDefinition,
  type ContractOfBinding,
  type ProcedureDefinition,
  type SchemaInput,
  type SchemaOutput,
  type StandardSchemaV1,
  validateSchema,
} from '../core/index.js'
import { contractOfBinding } from '../core/contract-internal.js'
import type {
  HttpHeaders,
  HttpParamsSchemas,
  HttpProtocol,
  HttpProtocolDefinition,
  HttpResponseDefinition,
  HttpResponseHeadersDefinition,
  HttpResponseHeadersWithDefaults,
} from './definitions.js'
import {
  parseHttpPath,
  type PathParamNames,
  type RawPathParams,
} from './path.js'

export interface HttpClientTransportRequest {
  readonly method: string
  readonly path: string
  readonly query?: unknown
  readonly headers?: unknown
  readonly body?: unknown
}

export interface HttpClientTransportResponse {
  readonly status: number
  readonly body: unknown
  readonly headers?: HttpHeaders
}

export type HttpClientTransport = (
  request: HttpClientTransportRequest,
) => Promise<HttpClientTransportResponse>

type HttpProtocolOf<TProcedure extends ProcedureDefinition> =
  TProcedure['protocols'] extends { readonly http: infer TProtocol }
    ? TProtocol extends HttpProtocol<infer TDefinition>
      ? HttpProtocol<TDefinition>
      : never
    : never

type HttpProcedureNames<TContract extends ContractDefinition> = {
  [TProcedure in keyof TContract['procedures'] & string]: HttpProtocolOf<
    TContract['procedures'][TProcedure]
  > extends never
    ? never
    : TProcedure
}[keyof TContract['procedures'] & string]

type HttpDefinitionOf<
  TContract extends ContractDefinition,
  TProcedure extends HttpProcedureNames<TContract>,
> = HttpProtocolOf<TContract['procedures'][TProcedure]>['definition']

type PathParamsInput<TDefinition extends HttpProtocolDefinition> =
  PathParamNames<TDefinition['path']> extends never
    ? never
    : TDefinition['request'] extends {
          readonly params: infer TSchemas extends HttpParamsSchemas
        }
      ? Readonly<{
          [TName in keyof TSchemas]: SchemaInput<TSchemas[TName]>
        }>
      : RawPathParams<TDefinition['path']>

type RequestPartInput<
  TDefinition extends HttpProtocolDefinition,
  TPart extends 'query' | 'headers',
> = TDefinition['request'] extends infer TRequest
  ? TRequest extends Record<TPart, infer TSchema extends StandardSchemaV1>
    ? SchemaInput<TSchema>
    : never
  : never

type RequestBodyInput<TDefinition extends HttpProtocolDefinition> =
  TDefinition['request'] extends {
    readonly body: infer TBody extends StandardSchemaV1
  }
    ? SchemaInput<TBody>
    : never

type RequestField<TName extends string, TValue> = [TValue] extends [never]
  ? object
  : undefined extends TValue
    ? { readonly [TKey in TName]?: Exclude<TValue, undefined> }
    : { readonly [TKey in TName]: TValue }

export type HttpClientRequest<TDefinition extends HttpProtocolDefinition> =
  RequestField<'params', PathParamsInput<TDefinition>> &
    RequestField<'query', RequestPartInput<TDefinition, 'query'>> &
    RequestField<'headers', RequestPartInput<TDefinition, 'headers'>> &
    RequestField<'body', RequestBodyInput<TDefinition>>

type ResponseBodyOutput<TResponse extends HttpResponseDefinition> =
  TResponse extends { readonly stream: 'server' }
    ? AsyncIterable<SchemaOutput<TResponse['body']>>
    : SchemaOutput<TResponse['body']>

type ResponseHeadersSchema<TResponse extends HttpResponseDefinition> =
  TResponse extends { readonly headers: infer THeaders }
    ? THeaders extends StandardSchemaV1
      ? THeaders
      : THeaders extends {
            readonly schema: infer TSchema extends StandardSchemaV1
          }
        ? TSchema
        : never
    : never

type ResponseHeadersOutput<TResponse extends HttpResponseDefinition> =
  ResponseHeadersSchema<TResponse> extends infer TSchema
    ? [TSchema] extends [never]
      ? HttpHeaders
      : TSchema extends StandardSchemaV1
        ? SchemaOutput<TSchema>
        : HttpHeaders
    : HttpHeaders

export type HttpClientResponse<TDefinition extends HttpProtocolDefinition> = {
  [TVariant in keyof TDefinition['responses'] & string]: NonNullable<
    TDefinition['responses'][TVariant]
  > extends infer TResponse extends HttpResponseDefinition
    ? {
        readonly status: TResponse['status']
        readonly body: ResponseBodyOutput<TResponse>
        readonly headers: ResponseHeadersOutput<TResponse>
      }
    : never
}[keyof TDefinition['responses'] & string]

type HttpClientMethod<TDefinition extends HttpProtocolDefinition> =
  keyof HttpClientRequest<TDefinition> extends never
    ? () => Promise<HttpClientResponse<TDefinition>>
    : (
        request: HttpClientRequest<TDefinition>,
      ) => Promise<HttpClientResponse<TDefinition>>

export type HttpClient<TBinding extends ContractBinding> = {
  readonly [
    TProcedure in HttpProcedureNames<ContractOfBinding<TBinding>>
  ]: HttpClientMethod<HttpDefinitionOf<ContractOfBinding<TBinding>, TProcedure>>
}

export class HttpClientResponseError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    readonly procedure: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'HttpClientResponseError'
  }
}

export function createHttpClient<const TBinding extends ContractBinding>(
  binding: TBinding,
  transport: HttpClientTransport,
): HttpClient<TBinding> {
  const contract = contractOfBinding(binding)
  const client: Record<
    string,
    (request?: Record<string, unknown>) => Promise<unknown>
  > = {}

  for (const [procedureName, procedure] of Object.entries(
    contract.procedures,
  )) {
    const definition = httpDefinitionOf(procedure)
    if (!definition) continue

    client[procedureName] = async (request = {}) => {
      const response = await transport({
        method: definition.method,
        path: interpolatePath(
          definition.path,
          request.params as Readonly<Record<string, unknown>> | undefined,
        ),
        ...(request.query === undefined ? {} : { query: request.query }),
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        ...(request.body === undefined ? {} : { body: request.body }),
      })

      return decodeResponse(procedureName, definition, response)
    }
  }

  return Object.freeze(client) as HttpClient<TBinding>
}

function httpDefinitionOf(
  procedure: ProcedureDefinition,
): HttpProtocolDefinition | undefined {
  const protocol = procedure.protocols.http
  if (
    !protocol ||
    protocol.protocol !== 'http' ||
    !('definition' in protocol)
  ) {
    return undefined
  }
  return protocol.definition as HttpProtocolDefinition
}

function interpolatePath(
  path: string,
  params: Readonly<Record<string, unknown>> | undefined,
): string {
  const segments = parseHttpPath(path)
  if (segments.length === 0) return '/'
  return `/${segments
    .map((segment) => {
      if (segment.kind === 'static') return segment.value
      const value = params?.[segment.name]
      if (value === undefined) {
        throw new Error(`Missing HTTP path parameter: ${segment.name}`)
      }
      return encodeURIComponent(String(value))
    })
    .join('/')}`
}

async function decodeResponse(
  procedure: string,
  definition: HttpProtocolDefinition,
  response: HttpClientTransportResponse,
): Promise<unknown> {
  const target = describeHttpTarget(definition, procedure)
  const candidates = Object.values(definition.responses).filter(
    (candidate) => candidate.status === response.status,
  )
  if (candidates.length === 0) {
    throw new HttpClientResponseError(
      response.status,
      definition.method,
      definition.path,
      procedure,
      `${target} returned undeclared HTTP status ${response.status}`,
    )
  }

  let lastValidationError: SchemaValidationError | undefined
  for (const candidate of candidates) {
    try {
      const body = candidate.stream
        ? validatedResponseStream(
            candidate.body,
            response.body,
            procedure,
            definition,
            response.status,
          )
        : await validateSchema(candidate.body, response.body)
      const headerSchema = responseHeadersSchema(candidate.headers)
      const headers = headerSchema
        ? await validateSchema(headerSchema, response.headers ?? {})
        : (response.headers ?? {})
      return Object.freeze({ status: response.status, body, headers })
    } catch (error) {
      if (!(error instanceof SchemaValidationError)) throw error
      lastValidationError = error
    }
  }

  throw new HttpClientResponseError(
    response.status,
    definition.method,
    definition.path,
    procedure,
    `${target} returned a response that does not match its Contract`,
    lastValidationError ? { cause: lastValidationError } : undefined,
  )
}

function responseHeadersSchema(
  headers: HttpResponseHeadersDefinition | undefined,
): StandardSchemaV1 | undefined {
  if (isStandardSchema(headers)) return headers
  if (isResponseHeadersWithDefaults(headers)) return headers.schema
  return undefined
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return typeof value === 'object' && value !== null && '~standard' in value
}

function isResponseHeadersWithDefaults(
  value: unknown,
): value is HttpResponseHeadersWithDefaults {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schema' in value &&
    isStandardSchema(value.schema)
  )
}

function validatedResponseStream(
  schema: StandardSchemaV1,
  value: unknown,
  procedure: string,
  definition: HttpProtocolDefinition,
  status: number,
): AsyncIterable<unknown> {
  const target = describeHttpTarget(definition, procedure)
  if (!isAsyncIterable(value)) {
    throw new HttpClientResponseError(
      status,
      definition.method,
      definition.path,
      procedure,
      `${target} returned a non-stream body for a server-stream response`,
    )
  }
  return {
    async *[Symbol.asyncIterator]() {
      try {
        for await (const item of value) yield await validateSchema(schema, item)
      } catch (error) {
        throw new HttpClientResponseError(
          status,
          definition.method,
          definition.path,
          procedure,
          `${target} returned an invalid server-stream item`,
          { cause: error },
        )
      }
    },
  }
}

function describeHttpTarget(
  definition: HttpProtocolDefinition,
  procedure: string,
): string {
  return `${definition.method.toUpperCase()} ${definition.path} (${procedure})`
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}

export interface FetchHttpTransportOptions {
  readonly baseUrl: string | URL
  readonly fetch?: typeof globalThis.fetch
  readonly headers?: HeadersInit
}

export function fetchHttpTransport(
  options: FetchHttpTransportOptions,
): HttpClientTransport {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  return async (request) => {
    const url = new URL(request.path, options.baseUrl)
    appendQuery(url.searchParams, request.query)

    const headers = new Headers(options.headers)
    appendHeaders(headers, request.headers)
    const contentType = headers.get('content-type') ?? undefined
    const body =
      request.body === undefined
        ? undefined
        : encodeBody(request.body, contentType)
    if (
      body instanceof FormData &&
      normalizeMediaType(contentType) === 'multipart/form-data'
    ) {
      headers.delete('content-type')
    }

    const response = await fetchImplementation(url, {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
    })
    return {
      status: response.status,
      body: await decodeFetchBody(response),
      headers: Object.fromEntries(response.headers.entries()),
    }
  }
}

function appendQuery(searchParams: URLSearchParams, query: unknown): void {
  if (query === undefined || query === null) return
  if (query instanceof URLSearchParams) {
    for (const [key, value] of query) searchParams.append(key, value)
    return
  }
  if (typeof query !== 'object') {
    throw new TypeError(
      'HTTP client query must be an object or URLSearchParams',
    )
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, String(item))
    } else {
      searchParams.append(key, String(value))
    }
  }
}

function appendHeaders(headers: Headers, value: unknown): void {
  if (value === undefined || value === null) return
  if (value instanceof Headers) {
    for (const [name, header] of value) headers.set(name, header)
    return
  }
  if (typeof value !== 'object') {
    throw new TypeError('HTTP client headers must be an object or Headers')
  }
  for (const [name, header] of Object.entries(value)) {
    if (header === undefined) continue
    if (Array.isArray(header)) {
      headers.set(name, header.map(String).join(', '))
    } else {
      headers.set(name, String(header))
    }
  }
}

function encodeBody(body: unknown, contentType: string | undefined): BodyInit {
  const mediaType = normalizeMediaType(contentType)
  if (mediaType === 'application/json' || mediaType?.endsWith('+json')) {
    return JSON.stringify(body)
  }
  return body as BodyInit
}

async function decodeFetchBody(response: Response): Promise<unknown> {
  if (
    response.status === 204 ||
    response.status === 205 ||
    response.status === 304
  ) {
    return undefined
  }
  const mediaType = normalizeMediaType(response.headers.get('content-type'))
  if (mediaType === 'text/event-stream') {
    if (!response.body) {
      throw new Error('Server-stream HTTP response has no body')
    }
    return decodeServerSentEvents(response.body)
  }
  if (mediaType === 'application/json' || mediaType?.endsWith('+json')) {
    return response.json()
  }
  return response.text()
}

function normalizeMediaType(
  value: string | null | undefined,
): string | undefined {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType || undefined
}

async function* decodeServerSentEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<unknown> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) {
        completed = true
        buffer += decoder.decode()
        break
      }
      buffer += decoder.decode(next.value, { stream: true })
      buffer = normalizeEventStreamNewlines(buffer)
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trimStart())
          .join('\n')
        if (data.length > 0) yield JSON.parse(data)
        boundary = buffer.indexOf('\n\n')
      }
    }
    buffer = normalizeEventStreamNewlines(buffer).trim()
    if (buffer.length > 0) {
      const data = buffer
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trimStart())
        .join('\n')
      if (data.length > 0) yield JSON.parse(data)
    }
  } finally {
    if (!completed) await reader.cancel()
    reader.releaseLock()
  }
}

function normalizeEventStreamNewlines(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}
