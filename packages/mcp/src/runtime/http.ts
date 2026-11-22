import { type McpPrincipal, type McpToolRuntime } from '../types.js'
import { type ExecutionContextView } from '@loutrejs/loutre'
import {
  type McpOAuthOptions,
  type McpOAuthRuntime,
  httpsUrl,
  type McpVerifiedAccessToken,
} from '../oauth.js'
import {
  getOAuthProtectedResourceMetadataUrl,
  createMcpHandler,
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  type CallToolResult,
  hostHeaderValidationResponse,
  originValidationResponse,
  requireBearerAuth,
  OAuthError,
  OAuthErrorCode,
} from '@modelcontextprotocol/server'
import { match } from 'ts-pattern'
import { type McpHttpRuntime } from '../contract.js'

interface RequestState {
  readonly principal: McpPrincipal
  rateLimited: boolean
  readonly request: Request
  readonly state: Readonly<Record<string, unknown>>
  readonly execution: ExecutionContextView
  readonly pending: Set<Promise<unknown>>
}

const requestTimeoutMs = 30_000

export function createMcpHttpRuntime(
  info: { readonly name: string; readonly version: string },
  tools: ReadonlyMap<string, McpToolRuntime>,
  path: string,
  oauth: McpOAuthOptions,
  options: McpOAuthRuntime,
  shutdownSignal: AbortSignal,
): McpHttpRuntime {
  const origin = httpsUrl(options.publicOrigin)
  if (origin.pathname !== '/') {
    throw new TypeError('MCP OAuthのpublicOriginにはパスを含められません。')
  }
  const resource = new URL(path, origin)
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resource)
  const authorizationServers = [...new Set(options.authorizationServers)]
  if (authorizationServers.length === 0) {
    throw new TypeError('MCP OAuthの認可サーバーを指定してください。')
  }
  for (const issuer of authorizationServers) httpsUrl(issuer)
  const origins = [...(oauth.allowedOrigins ?? [])]
  const requestStates = new WeakMap<Request, RequestState>()
  const requiredScopes = [...new Set(oauth.requiredScopes ?? [])].toSorted()
  const metadataDocument = JSON.stringify({
    resource: resource.href,
    resource_name: info.name,
    ...(requiredScopes.length > 0 ? { scopes_supported: requiredScopes } : {}),
    authorization_servers: authorizationServers,
    bearer_methods_supported: ['header'],
  })

  const handler = createMcpHandler(
    ({ requestInfo }) => {
      const state = requestInfo && requestStates.get(requestInfo)
      if (!state) throw new Error('MCPリクエストの認証状態がありません。')
      const { principal } = state
      const permits = (scopes: readonly string[]) =>
        scopes.every((scope) => principal.scopes.includes(scope))
      const server = new McpServer(info, {
        capabilities: { tools: { listChanged: false } },
      })
      // SDKのTool登録で契約を再構築すると、Graphと応答の正本が分かれる。
      server.resolveScopeChallenge = ({ request }) => {
        const name = request.params?.name
        if (request.method !== 'tools/call' || typeof name !== 'string') return
        const scopes = tools.get(name)?.scopes
        if (scopes?.length && !permits(scopes)) {
          const [first, ...rest] = [
            ...new Set([...requiredScopes, ...scopes]),
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
              allowed = await options.allowInvocation(principal, signal)
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
    hostHeaderValidationResponse(request, [resource.hostname]) ??
    originValidationResponse(request, origins)

  return {
    metadata({ request }) {
      return (
        validateRequest(request) ??
        new Response(metadataDocument, {
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
        let principal: McpPrincipal | undefined
        const authInfo = await requireBearerAuth({
          resourceMetadataUrl,
          requiredScopes,
          verifier: {
            async verifyAccessToken(token) {
              const header = request.headers.get('authorization')
              if (!header || !/^Bearer [A-Za-z0-9._~+/-]+=*$/i.test(header)) {
                throw new OAuthError(
                  OAuthErrorCode.InvalidToken,
                  'Invalid access token',
                )
              }
              let verified: McpVerifiedAccessToken | undefined
              try {
                verified = await options.verifyAccessToken(token, signal)
              } catch {
                throw new Error('MCPアクセストークンの検証に失敗しました。')
              }
              if (
                !verified ||
                !verified.subject ||
                !authorizationServers.includes(verified.issuer) ||
                verified.resource !== resource.href ||
                !Number.isFinite(verified.expiresAt) ||
                verified.expiresAt <= Date.now() / 1_000
              )
                throw new OAuthError(
                  OAuthErrorCode.InvalidToken,
                  'Invalid access token',
                )
              principal = Object.freeze({
                subject: verified.subject,
                issuer: verified.issuer,
                scopes: Object.freeze([...verified.scopes]),
              })
              return {
                token,
                clientId: verified.subject,
                scopes: [...principal.scopes],
                expiresAt: verified.expiresAt,
                resource,
              }
            },
          },
        })(request)
        if (authInfo instanceof Response) return authInfo
        signal.throwIfAborted()

        const exchange = new Request(request, { signal })
        if (!principal) throw new Error('MCPリクエストの認証主体がありません。')
        const state: RequestState = {
          principal,
          rateLimited: false,
          request,
          state: middlewareState,
          execution,
          pending: new Set(),
        }
        requestStates.set(exchange, state)
        try {
          const response = await handler.fetch(exchange, { authInfo })
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
