import {
  layer,
  shortCircuit,
  type ContextKey,
  type ContextKeyValue,
  type ContextProperties,
  type LayerDescriptor,
} from '@loutrefw/core'
import type { LogicalHttpResult } from './definitions.js'

export interface BasicAuthCredentials {
  readonly username: string
  readonly password: string
}

export interface BasicAuthUnauthorized<
  TVariant extends string,
  TBody,
> {
  readonly variant: TVariant
  readonly body: TBody
}

export interface BasicAuthOptions<
  TPrincipal extends ContextKey,
  TVariant extends string,
  TUnauthorizedBody,
> {
  readonly realm: string
  readonly principal: TPrincipal
  readonly authenticate: (
    credentials: BasicAuthCredentials,
  ) =>
    | ContextKeyValue<TPrincipal>
    | null
    | undefined
    | Promise<ContextKeyValue<TPrincipal> | null | undefined>
  readonly unauthorized: BasicAuthUnauthorized<TVariant, TUnauthorizedBody>
  readonly name?: string
}

export interface BasicAuthLayerDescriptor<TPrincipal extends ContextKey>
  extends LayerDescriptor<
    BasicAuthContext,
    void,
    readonly [],
    readonly [TPrincipal]
  > {
  readonly basicAuth: {
    readonly realm: string
    readonly unauthorizedVariant: string
  }
}

export interface BasicAuthContext {
  readonly headers: Readonly<Record<string, string | undefined>>
}

/**
 * HTTP adapterがdecodeしたAuthorization headerをBasic credentialsとして認証し、
 * 認証済みprincipalをExecution Contextへ追加するLayerを生成する。
 */
export function basicAuth<
  TPrincipal extends ContextKey,
  const TVariant extends string,
  TUnauthorizedBody,
>(
  options: BasicAuthOptions<TPrincipal, TVariant, TUnauthorizedBody>,
): BasicAuthLayerDescriptor<TPrincipal> {
  const challenge = formatBasicChallenge(options.realm)
  const descriptor = layer<readonly [], readonly [TPrincipal], BasicAuthContext>({
    name: options.name ?? 'basicAuth',
    role: 'authentication',
    provides: [options.principal],
    inbound: async (ctx) => {
      const credentials = decodeBasicCredentials(ctx.headers.authorization)
      if (!credentials) {
        return unauthorizedResult(options.unauthorized, challenge)
      }

      const principal = await options.authenticate(credentials)
      if (principal == null) {
        return unauthorizedResult(options.unauthorized, challenge)
      }

      return {
        [options.principal.name]: principal,
      } as ContextProperties<readonly [TPrincipal]>
    },
  })
  return Object.freeze({
    ...descriptor,
    basicAuth: Object.freeze({
      realm: options.realm,
      unauthorizedVariant: options.unauthorized.variant,
    }),
  })
}

function unauthorizedResult<TVariant extends string, TBody>(
  unauthorized: BasicAuthUnauthorized<TVariant, TBody>,
  challenge: string,
) {
  return shortCircuit<LogicalHttpResult<TVariant, TBody>>({
    kind: 'http-result',
    variant: unauthorized.variant,
    body: unauthorized.body,
    headers: {
      'www-authenticate': challenge,
    },
  })
}

function formatBasicChallenge(realm: string): string {
  if (realm.length === 0 || /[\u0000-\u001f\u007f]/.test(realm)) {
    throw new TypeError('Basic認証のrealmには空文字列または制御文字を使用できません')
  }
  const escaped = realm.replace(/[\\"]/g, '\\$&')
  return `Basic realm="${escaped}", charset="UTF-8"`
}

function decodeBasicCredentials(
  authorization: string | null | undefined,
): BasicAuthCredentials | undefined {
  const match = /^Basic +([A-Za-z0-9+/]+={0,2})$/i.exec(authorization ?? '')
  if (!match?.[1]) return undefined

  try {
    const binary = atob(match[1])
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const separator = decoded.indexOf(':')
    if (separator < 0) return undefined
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    }
  } catch {
    return undefined
  }
}
