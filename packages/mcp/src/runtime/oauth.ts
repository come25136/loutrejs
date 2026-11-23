import type { McpPrincipal } from '../types.js'
import {
  httpsUrl,
  type McpOAuthOptions,
  type McpOAuthRuntime,
  type McpVerifiedAccessToken,
} from '../oauth.js'
import {
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
  OAuthError,
  OAuthErrorCode,
} from '@modelcontextprotocol/server'

export function createOAuth(
  name: string,
  path: string,
  oauth: McpOAuthOptions,
  options: McpOAuthRuntime | undefined,
) {
  if (!options)
    throw new TypeError(
      '認証付きMCP endpointのfactoryにはoauthを指定してください。',
    )
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
  const requiredScopes = [...new Set(oauth.requiredScopes ?? [])].toSorted()
  const metadataDocument = JSON.stringify({
    resource: resource.href,
    resource_name: name,
    ...(requiredScopes.length > 0 ? { scopes_supported: requiredScopes } : {}),
    authorization_servers: authorizationServers,
    bearer_methods_supported: ['header'],
  })

  return {
    hostname: resource.hostname,
    origins,
    requiredScopes,
    metadataDocument,
    allowInvocation: (principal: McpPrincipal, signal: AbortSignal) =>
      options.allowInvocation(principal, signal),
    async authenticate(request: Request, signal: AbortSignal) {
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
      if (!principal) throw new Error('MCPリクエストの認証主体がありません。')
      return { principal, authInfo }
    },
  }
}
