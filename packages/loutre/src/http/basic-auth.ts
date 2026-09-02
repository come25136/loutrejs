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
  TProvided extends ContextKey,
  TVariant extends string,
  TUnauthorizedBody,
> {
  readonly realm: string
  readonly provides: readonly [TProvided]
  readonly factory: () => (
    credentials: BasicAuthCredentials,
  ) =>
    | ContextKeyValue<TProvided>
    | null
    | undefined
    | Promise<ContextKeyValue<TProvided> | null | undefined>
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
  TProvided extends ContextKey,
  TVariant extends string,
  TUnauthorizedBody,
> extends LayerDescriptor<
  readonly [],
  readonly [TProvided],
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
  TProvided extends ContextKey,
  const TVariant extends string,
  TUnauthorizedBody,
>(
  options: BasicAuthOptions<TProvided, TVariant, TUnauthorizedBody>,
): BasicAuthLayerDescriptor<TProvided, TVariant, TUnauthorizedBody> {
  const challenge = formatBasicChallenge(options.realm)
  const provided = options.provides[0]
  const descriptor = layer<
    readonly [],
    readonly [TProvided],
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
    provides: options.provides,
    shortCircuits: [
      {
        protocol: 'http',
        variant: options.unauthorized.variant,
        response: { status: 401 },
      },
    ],
    factory: () => {
      const authenticate = options.factory()
      return async (ctx, next) => {
        const credentials = decodeBasicCredentials(ctx.headers.authorization)
        if (!credentials) {
          return unauthorizedResult(options.unauthorized, challenge)
        }

        const value = await authenticate(credentials)
        if (value == null) {
          return unauthorizedResult(options.unauthorized, challenge)
        }

        await next({
          [provided.name]: value,
        } as ContextProperties<readonly [TProvided]>)
      }
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
