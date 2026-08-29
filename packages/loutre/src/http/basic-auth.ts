import {
  layer,
  shortCircuit,
  type ContextKey,
  type ContextKeyValue,
  type ContextProperties,
  type LayerDescriptor,
} from '../core/index.js'
import type { LogicalHttpResult } from './definitions.js'

export interface BasicAuthCredentials {
  readonly username: string
  readonly password: string
}

export interface BasicAuthUnauthorized<TVariant extends string, TBody> {
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

type BasicAuthShortCircuits<TVariant extends string> = readonly [
  {
    readonly protocol: 'http'
    readonly variant: TVariant
    readonly response: { readonly status: 401 }
  },
]

type BasicAuthResponseHeaders = {
  readonly 'www-authenticate': string
}

export interface BasicAuthLayerDescriptor<
  TPrincipal extends ContextKey,
  TVariant extends string,
  TUnauthorizedBody,
> extends LayerDescriptor<
  readonly [],
  readonly [TPrincipal],
  string extends TVariant
    ? unknown
    : LogicalHttpResult<TVariant, TUnauthorizedBody, BasicAuthResponseHeaders>,
  BasicAuthShortCircuits<TVariant>,
  string,
  'authentication',
  readonly [],
  BasicAuthContext
> {
  readonly role: 'authentication'
}

export interface BasicAuthContext {
  readonly headers: Readonly<Record<string, string | undefined>>
}

export function basicAuth<
  TPrincipal extends ContextKey,
  const TVariant extends string,
  TUnauthorizedBody,
>(
  options: BasicAuthOptions<TPrincipal, TVariant, TUnauthorizedBody>,
): BasicAuthLayerDescriptor<TPrincipal, TVariant, TUnauthorizedBody> {
  const challenge = formatBasicChallenge(options.realm)
  const descriptor = layer<
    readonly [],
    readonly [TPrincipal],
    BasicAuthContext,
    string extends TVariant
      ? unknown
      : LogicalHttpResult<
          TVariant,
          TUnauthorizedBody,
          BasicAuthResponseHeaders
        >,
    BasicAuthShortCircuits<TVariant>,
    string,
    'authentication'
  >({
    name: options.name ?? 'basicAuth',
    role: 'authentication',
    provides: [options.principal],
    shortCircuits: [
      {
        protocol: 'http',
        variant: options.unauthorized.variant,
        response: { status: 401 },
      },
    ],
    factory: () => async (ctx, next) => {
      const credentials = decodeBasicCredentials(ctx.headers.authorization)
      if (!credentials) {
        return unauthorizedResult(options.unauthorized, challenge)
      }

      const principal = await options.authenticate(credentials)
      if (principal == null) {
        return unauthorizedResult(options.unauthorized, challenge)
      }

      await next({
        [options.principal.name]: principal,
      } as ContextProperties<readonly [TPrincipal]>)
    },
  })
  return Object.freeze(descriptor)
}

function unauthorizedResult<TVariant extends string, TBody>(
  unauthorized: BasicAuthUnauthorized<TVariant, TBody>,
  challenge: string,
) {
  return shortCircuit<
    LogicalHttpResult<TVariant, TBody, BasicAuthResponseHeaders>
  >({
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
    throw new TypeError(
      'Basic authentication realm cannot be empty or contain control characters',
    )
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
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    )
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
