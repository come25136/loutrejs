import {
  type CompiledHttpRoute,
  type CompiledHttpContractRoute,
} from '../compiled.js'
import { match as patternMatch } from 'ts-pattern'
import {
  validateSchema,
  type ExecutionKernelRuntime,
} from '../../core/index.js'
import { decodeQuery, validateRequestHeaders } from '../codecs/request.js'
import { createHttpResponseHelpers, isHttpInputRecord } from '../result.js'
import {
  type InitialHttpContext,
  type RuntimeHttpContext,
  type RuntimeHttpRoute,
} from './types.js'
import { type HttpMiddlewareOutcome } from '../contract.js'

export async function createHttpContext(
  request: Request,
  url: URL,
  rawParams: Readonly<Record<string, string>>,
  route: CompiledHttpRoute,
  signal: AbortSignal,
): Promise<InitialHttpContext> {
  const definition = patternMatch(route)
    .with(
      { kind: 'contract' },
      ({ definition: routeDefinition }) => routeDefinition.request,
    )
    .with({ kind: 'raw' }, () => undefined)
    .exhaustive()
  const params = definition?.params
    ? Object.fromEntries(
        await Promise.all(
          Object.entries(definition.params).map(async ([name, schema]) => [
            name,
            await validateSchema(schema, rawParams[name]),
          ]),
        ),
      )
    : rawParams
  const rawQuery = decodeQuery(url.searchParams)
  const query = definition?.query
    ? await validateSchema(definition.query, rawQuery)
    : rawQuery
  const headers = definition?.headers
    ? await validateRequestHeaders(
        definition.headers,
        definition.body !== undefined,
        request.headers,
      )
    : Object.fromEntries(request.headers.entries())
  const body = definition?.body ? request.body : undefined
  const response = patternMatch(route)
    .with({ kind: 'contract' }, ({ definition: routeDefinition }) =>
      createHttpResponseHelpers(routeDefinition.responses),
    )
    .with({ kind: 'raw' }, () => createHttpResponseHelpers({}))
    .exhaustive()
  return {
    request,
    input: { params, query, headers, body },
    response,
    signal,
  }
}

export async function replayHttpHandler(
  applicationRuntime: ExecutionKernelRuntime,
  handler: (
    context: RuntimeHttpContext,
  ) => HttpMiddlewareOutcome | Promise<HttpMiddlewareOutcome>,
  match: RuntimeHttpRoute & {
    readonly route: CompiledHttpContractRoute
    readonly params: Record<string, string>
  },
  input: unknown,
  state: Readonly<Record<string, unknown>>,
): Promise<HttpMiddlewareOutcome> {
  if (!isHttpInputRecord(input) || !isHttpInputRecord(input.params)) {
    throw new TypeError('LUTRE_DEVTOOLS_HTTP_HANDLER_INPUT_REQUIRED')
  }
  const params = input.params
  const lease = applicationRuntime.beginExecution({
    executionId: match.executionId,
    executionKind: 'http.handler',
    graphNodeId: match.executionId,
    name: `${match.executionId}.${match.route.name}`,
  })
  const invoke = () =>
    handler({
      kind: 'contract',
      input: {
        params,
        query: input.query,
        headers: input.headers,
        body: input.body,
      },
      response: createHttpResponseHelpers(match.route.definition.responses),
      signal: lease.signal,
      state,
    })
  let result: HttpMiddlewareOutcome | undefined
  let hasResult = false
  try {
    result = await (lease.run ? lease.run(invoke) : invoke())
    hasResult = true
    return result
  } catch (error) {
    lease.fail?.(error)
    throw error
  } finally {
    if (hasResult) lease.complete(result)
    else lease.complete()
  }
}
