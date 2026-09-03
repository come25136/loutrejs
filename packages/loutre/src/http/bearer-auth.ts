import {
  layer,
  shortCircuit,
  type ContextKey,
  type ContextKeyValue,
  type ContextShape,
  type LayerDescriptor,
} from '../core/index.js'
import type { LogicalHttpResult } from './definitions.js'

export interface BearerAuthUnauthorized<TVariant extends string, TBody> {
  readonly variant: TVariant
  readonly body: TBody
}

export interface BearerAuthOptions<
  TProvided extends ContextKey<any, any>,
  TVariant extends string,
  TUnauthorizedBody,
> {
  readonly realm: string
  readonly provide: TProvided
  readonly factory: () => (
    token: string,
  ) =>
    | ContextKeyValue<TProvided>
    | null
    | undefined
    | Promise<ContextKeyValue<TProvided> | null | undefined>
  readonly unauthorized: BearerAuthUnauthorized<TVariant, TUnauthorizedBody>
  readonly name?: string
}

type BearerAuthShortCircuits<TVariant extends string> = readonly [
  {
    readonly protocol: 'http'
    readonly variant: TVariant
    readonly response: { readonly status: 401 }
  },
]

type BearerAuthResponseHeaders = {
  readonly 'www-authenticate': string
}

export interface BearerAuthLayerDescriptor<
  TProvided extends ContextKey<any, any>,
  TVariant extends string,
  TUnauthorizedBody,
> extends LayerDescriptor<
  readonly [],
  TProvided,
  string extends TVariant
    ? unknown
    : LogicalHttpResult<TVariant, TUnauthorizedBody, BearerAuthResponseHeaders>,
  BearerAuthShortCircuits<TVariant>,
  string,
  'authentication',
  readonly [],
  BearerAuthContext
> {
  readonly role: 'authentication'
}

export interface BearerAuthContext {
  readonly headers: Readonly<Record<string, string | undefined>>
}

export function bearerAuth<
  TProvided extends ContextKey<any, any>,
  const TVariant extends string,
  TUnauthorizedBody,
>(
  options: BearerAuthOptions<TProvided, TVariant, TUnauthorizedBody>,
): BearerAuthLayerDescriptor<TProvided, TVariant, TUnauthorizedBody> {
  const challenge = formatBearerChallenge(options.realm)
  const provided = options.provide
  const descriptor = layer<
    readonly [],
    TProvided,
    BearerAuthContext,
    string extends TVariant
      ? unknown
      : LogicalHttpResult<
          TVariant,
          TUnauthorizedBody,
          BearerAuthResponseHeaders
        >,
    BearerAuthShortCircuits<TVariant>,
    string,
    'authentication'
  >({
    name: options.name ?? 'bearerAuth',
    role: 'authentication',
    provide: options.provide,
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
        const token = readBearerToken(ctx.headers.authorization)
        if (!token) {
          return unauthorizedResult(options.unauthorized, challenge)
        }

        const value = await authenticate(token)
        if (value == null) {
          return unauthorizedResult(options.unauthorized, challenge)
        }

        await next({
          [provided.name]: value,
        } as ContextShape<TProvided>)
      }
    },
  })
  return Object.freeze(descriptor)
}

function unauthorizedResult<TVariant extends string, TBody>(
  unauthorized: BearerAuthUnauthorized<TVariant, TBody>,
  challenge: string,
) {
  return shortCircuit<
    LogicalHttpResult<TVariant, TBody, BearerAuthResponseHeaders>
  >({
    kind: 'http-result',
    variant: unauthorized.variant,
    body: unauthorized.body,
    headers: {
      'www-authenticate': challenge,
    },
  })
}

function readBearerToken(
  authorization: string | null | undefined,
): string | undefined {
  return /^Bearer +([^\s]+)$/i.exec(authorization ?? '')?.[1]
}

function formatBearerChallenge(realm: string): string {
  if (realm.length === 0 || /[\u0000-\u001f\u007f]/.test(realm)) {
    throw new TypeError(
      'Bearer authentication realm cannot be empty or contain control characters',
    )
  }
  const escaped = realm.replace(/[\\"]/g, '\\$&')
  return `Bearer realm="${escaped}"`
}
