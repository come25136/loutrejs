import {
  type HttpExecutionRouteDefinition,
  type HttpExecutionResult,
  type HttpHeaders,
} from '../contract.js'
import {
  validateResponseHeaders,
  responseHeadersSchema,
  mergeResponseHeaders,
  responseHeadersDefaults,
  applyFrameworkResponseHeaders,
  applyResponseHeaders,
} from '../codecs/response.js'
import {
  type HttpExecutionResultWithFrameworkHeaders,
  httpFrameworkHeaders,
} from '../result.js'
import {
  createServerSentEventStream,
  createLeasedReadableStream,
} from './stream.js'
import { validateSchema } from '../../core/index.js'
import { type FinalizedHttpResult } from './types.js'

export async function finalizeHttpResult(
  route: HttpExecutionRouteDefinition,
  result: HttpExecutionResult,
  signal: AbortSignal,
  completeExecution: () => void,
): Promise<FinalizedHttpResult> {
  const response = route.responses[result.response]
  if (!Object.hasOwn(route.responses, result.response) || !response) {
    throw new Error(`LUTRE_HTTP_RESPONSE_UNDECLARED: ${result.response}`)
  }
  const responseHeaders = await validateResponseHeaders(
    responseHeadersSchema(response.headers),
    result.headers,
  )
  const headers = mergeResponseHeaders(
    responseHeadersDefaults(response.headers),
    responseHeaders,
  )
  applyFrameworkResponseHeaders(
    headers,
    (result as HttpExecutionResultWithFrameworkHeaders)[httpFrameworkHeaders],
  )

  if (response.stream === 'server') {
    if (!response.body || !isAsyncIterable(result.body)) {
      throw new Error('Server-stream response requires an AsyncIterable body')
    }
    applyResponseHeaders(headers, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
    })
    const serverStream = createServerSentEventStream(
      result.body,
      response.body,
      signal,
      completeExecution,
    )
    return {
      response: new Response(serverStream.stream, {
        status: response.status,
        headers,
      }),
      streamControl: serverStream,
    }
  }

  const body = response.body
    ? await validateSchema(response.body, result.body)
    : undefined
  if (body === undefined) {
    return {
      response: new Response(null, { status: response.status, headers }),
    }
  }
  if (body instanceof ReadableStream) {
    const responseStream = createLeasedReadableStream(
      body,
      signal,
      completeExecution,
    )
    return {
      response: new Response(responseStream.stream, {
        status: response.status,
        headers,
      }),
      streamControl: responseStream,
    }
  }
  if (
    typeof body === 'string' ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams
  ) {
    return {
      response: new Response(body as BodyInit, {
        status: response.status,
        headers,
      }),
    }
  }
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json; charset=utf-8')
  }
  return {
    response: new Response(JSON.stringify(body), {
      status: response.status,
      headers,
    }),
  }
}

export async function mapDeclaredError(
  route: HttpExecutionRouteDefinition,
  error: unknown,
): Promise<HttpExecutionResult | undefined> {
  for (const [responseName, response] of Object.entries(route.responses)) {
    const mapping = response.error
    if (!mapping?.definition.is(error)) continue
    const mapped = await mapping.map(error)
    if (typeof mapped !== 'object' || mapped === null || !('body' in mapped)) {
      throw new Error('HTTP error mapping must return a body')
    }
    return {
      kind: 'http-result',
      response: responseName,
      body: mapped.body,
      ...('headers' in mapped
        ? { headers: mapped.headers as HttpHeaders }
        : {}),
    }
  }
  return undefined
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  )
}
