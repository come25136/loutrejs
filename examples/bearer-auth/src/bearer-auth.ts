import {
  layer,
  shortCircuit,
  type ContextKey,
  type ContextKeyValue,
  type ContextProperties,
} from '@loutrejs/core'
import type { LogicalHttpResult } from '@loutrejs/http'

type BearerAuthResponseHeaders = {
  readonly 'www-authenticate': string
}

export interface BearerAuthContext {
  readonly headers: Readonly<Record<string, string | undefined>>
}

export interface BearerAuthOptions<
  TPrincipal extends ContextKey,
  TVariant extends string,
  TUnauthorizedBody,
> {
  readonly realm: string
  readonly principal: TPrincipal
  readonly authenticate: (
    token: string,
  ) =>
    | ContextKeyValue<TPrincipal>
    | null
    | undefined
    | Promise<ContextKeyValue<TPrincipal> | null | undefined>
  readonly unauthorized: {
    readonly variant: TVariant
    readonly body: TUnauthorizedBody
  }
  readonly name?: string
}

export function bearerAuth<
  TPrincipal extends ContextKey,
  const TVariant extends string,
  TUnauthorizedBody,
>(
  options: BearerAuthOptions<TPrincipal, TVariant, TUnauthorizedBody>,
) {
  const challenge = formatBearerChallenge(options.realm)
  return layer({
    name: options.name ?? 'bearerAuth',
    role: 'authentication',
    provides: [options.principal],
    shortCircuits: [
      {
        protocol: 'http',
        variant: options.unauthorized.variant,
        response: { status: 401 },
      },
    ],
    inbound: async (context: BearerAuthContext) => {
      const token = readBearerToken(context.headers.authorization)
      if (!token) {
        return unauthorizedResult(options.unauthorized, challenge)
      }
      const principal = await options.authenticate(token)
      if (principal == null) {
        return unauthorizedResult(options.unauthorized, challenge)
      }
      return {
        [options.principal.name]: principal,
      } as ContextProperties<readonly [TPrincipal]>
    },
  })
}

function unauthorizedResult<TVariant extends string, TBody>(
  unauthorized: { readonly variant: TVariant; readonly body: TBody },
  challenge: string,
) {
  return shortCircuit<
    LogicalHttpResult<TVariant, TBody, BearerAuthResponseHeaders>
  >({
    kind: 'http-result',
    variant: unauthorized.variant,
    body: unauthorized.body,
    headers: { 'www-authenticate': challenge },
  })
}

function readBearerToken(authorization: string | undefined): string | undefined {
  return /^Bearer +([^\s]+)$/i.exec(authorization ?? '')?.[1]
}

function formatBearerChallenge(realm: string): string {
  if (realm.length === 0 || /[\u0000-\u001f\u007f]/.test(realm)) {
    throw new TypeError('Bearer認証のrealmには空文字列または制御文字を使用できません')
  }
  return `Bearer realm="${realm.replace(/[\\"]/g, '\\$&')}"`
}
