import { type McpPrincipal } from './types.js'

type Awaitable<T> = T | Promise<T>

export interface McpVerifiedAccessToken extends McpPrincipal {
  readonly resource: string
  readonly expiresAt: number
}

export interface McpOAuthRuntime {
  readonly publicOrigin: string
  readonly authorizationServers: readonly string[]
  readonly verifyAccessToken: (
    token: string,
    signal: AbortSignal,
  ) => Awaitable<McpVerifiedAccessToken | undefined>
  readonly allowInvocation: (
    principal: McpPrincipal,
    signal: AbortSignal,
  ) => Awaitable<boolean>
}

export interface McpOAuthOptions {
  readonly requiredScopes?: readonly string[]
  readonly allowedOrigins?: readonly string[]
}

export const oauthScopePattern = /^[\x21\x23-\x5B\x5D-\x7E]+$/

export function httpsUrl(value: string): URL {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new TypeError(
      'MCP OAuthのURLにはHTTPSを使い、認証情報、クエリ、フラグメントを除いてください。',
    )
  }
  return url
}
