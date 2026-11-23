import type { CompiledEndpoint } from '../compiled.js'
import { type McpPrincipal, type McpToolRuntime } from '../types.js'
import { type ExecutionContextView } from '@loutrejs/loutre'
import { type McpOAuthRuntime } from '../oauth.js'
import {
  createMcpHandler,
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type CallToolResult,
  hostHeaderValidationResponse,
  originValidationResponse,
} from '@modelcontextprotocol/server'
import { createOAuth } from './oauth.js'
import { match } from 'ts-pattern'
import { type McpHttpRuntime } from '../contract.js'

interface RequestState {
  readonly principal: McpPrincipal | undefined
  rateLimited: boolean
  readonly request: Request
  readonly state: Readonly<Record<string, unknown>>
  readonly execution: ExecutionContextView
  readonly pending: Set<Promise<unknown>>
}

const requestTimeoutMs = 30_000

export function createMcpHttpRuntime(
  endpoint: CompiledEndpoint,
  tools: ReadonlyMap<string, McpToolRuntime>,
  options: McpOAuthRuntime | undefined,
  shutdownSignal: AbortSignal,
): McpHttpRuntime {
  const auth =
    endpoint.oauth === undefined
      ? undefined
      : createOAuth(endpoint.name, endpoint.path, endpoint.oauth, options)
  const hosts = auth ? [auth.hostname] : [...endpoint.allowedHosts]
  const requestStates = new WeakMap<Request, RequestState>()

  const handler = createMcpHandler(
    ({ requestInfo }) => {
      const state = requestInfo && requestStates.get(requestInfo)
      if (!state) throw new Error('MCPリクエストの状態がありません。')
      const { principal } = state
      const permits = (scopes: readonly string[]) =>
        scopes.every((scope) => principal?.scopes.includes(scope))
      const server = new McpServer(
        { name: endpoint.name, version: endpoint.version },
        {
          capabilities: { tools: { listChanged: false } },
        },
      )
      // SDKのTool登録で契約を再構築すると、Graphと応答の正本が分かれる。
      server.resolveScopeChallenge = ({ request }) => {
        const name = request.params?.name
        if (request.method !== 'tools/call' || typeof name !== 'string') return
        const scopes = tools.get(name)?.scopes
        if (auth && scopes?.length && !permits(scopes)) {
          const [first, ...rest] = [
            ...new Set([...auth.requiredScopes, ...scopes]),
          ].toSorted()
          return { scopes: [first!, ...rest] }
        }
      }
      server.toolInputSchemaJson = (name) =>
        tools.get(name)?.descriptor.inputSchema
      server.server.setRequestHandler('tools/list', () => ({
        tools: [...tools.values()]
          .filter((tool) => permits(tool.scopes))
          .map((tool) => tool.descriptor),
        ttlMs: 0,
        cacheScope: 'private',
      }))
      server.server.setRequestHandler(
        'tools/call',
        async ({ params }, context) => {
          const tool = tools.get(params.name)
          if (!tool)
            throw new ProtocolError(
              ProtocolErrorCode.InvalidParams,
              '未知のMCP Toolです。',
            )
          if (!permits(tool.scopes))
            throw new ProtocolError(
              ProtocolErrorCode.InvalidParams,
              'MCP Toolを利用できません。',
            )
          const invoke = async (): Promise<CallToolResult> => {
            const { signal } = context.mcpReq
            let allowed: boolean
            try {
              signal.throwIfAborted()
              allowed = auth
                ? !!principal && (await auth.allowInvocation(principal, signal))
                : true
            } catch {
              throw new ProtocolError(
                ProtocolErrorCode.InternalError,
                'MCP Toolの実行に失敗しました。',
              )
            }
            if (allowed !== true) {
              state.rateLimited = true
              return { content: [], isError: true }
            }
            const operation = state.execution.beginOperation({
              kind: 'mcp.tool',
              name: tool.descriptor.name,
            })
            try {
              const run = () =>
                tool.invoke({
                  input: params.arguments ?? {},
                  principal,
                  signal,
                  request: state.request,
                  state: state.state,
                })
              const result = await (operation.run ? operation.run(run) : run())
              operation.annotate?.({ 'mcp.result': result.kind })
              return match(result)
                .returnType<CallToolResult>()
                .with({ kind: 'error' }, ({ message }) => ({
                  content: [{ type: 'text', text: message }],
                  isError: true,
                }))
                .with({ kind: 'success' }, ({ value }) => ({
                  structuredContent: value,
                  content: [{ type: 'text', text: JSON.stringify(value) }],
                }))
                .exhaustive()
            } catch {
              operation.fail?.(new Error('MCP Toolの実行に失敗しました。'))
              throw new ProtocolError(
                ProtocolErrorCode.InternalError,
                'MCP Toolの実行に失敗しました。',
              )
            } finally {
              operation.complete()
            }
          }
          const pending = invoke()
          state.pending.add(pending)
          try {
            return await pending
          } finally {
            state.pending.delete(pending)
          }
        },
      )
      return server
    },
    { legacy: 'reject', maxSubscriptions: 0 },
  )

  const validateRequest = (request: Request) =>
    hostHeaderValidationResponse(request, hosts) ??
    originValidationResponse(request, auth?.origins ?? [])

  return {
    metadata({ request }) {
      if (!auth) return new Response(null, { status: 404 })
      return (
        validateRequest(request) ??
        new Response(auth.metadataDocument, {
          headers: { 'content-type': 'application/json' },
        })
      )
    },
    async request({ request, execution, state: middlewareState }) {
      const rejection = validateRequest(request)
      if (rejection) return rejection
      try {
        const signal = AbortSignal.any([
          request.signal,
          execution.signal,
          shutdownSignal,
          AbortSignal.timeout(requestTimeoutMs),
        ])
        const authentication = await auth?.authenticate(request, signal)
        if (authentication instanceof Response) return authentication
        signal.throwIfAborted()

        const exchange = new Request(request, { signal })
        const state: RequestState = {
          principal: authentication?.principal,
          rateLimited: false,
          request,
          state: middlewareState,
          execution,
          pending: new Set(),
        }
        requestStates.set(exchange, state)
        try {
          const response = await handler.fetch(
            exchange,
            authentication && { authInfo: authentication.authInfo },
          )
          if (!state.rateLimited) {
            response.headers.set('cache-control', 'no-store')
            return response
          }
          await response.body?.cancel()
          return Response.json({ error: 'too_many_requests' }, { status: 429 })
        } finally {
          // SDKは中断応答を先に返す場合があるため、handlerの完了までHTTP Leaseを保持する。
          await Promise.allSettled(state.pending)
          requestStates.delete(exchange)
        }
      } catch {
        return Response.json({ error: 'server_error' }, { status: 500 })
      }
    },
  }
}
