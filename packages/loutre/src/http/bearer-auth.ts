import {
  layer,
  registerLayerShortCircuits,
  shortCircuit,
  type as typeCarrier,
} from '../core/index.js'
import type { LayerDescriptor, Type, TypeOf } from '../core/index.js'
import type { LogicalHttpResult } from './definitions.js'

export interface BearerAuthUnauthorized<TResponse extends string, TBody> {
  readonly response: TResponse
  readonly body: TBody
}

export interface BearerAuthDefinition<
  TState extends Type<object>,
  TResponse extends string,
  TUnauthorizedBody,
> {
  readonly realm: string
  readonly name?: string
  readonly state: TState
  readonly factory: () => BearerAuthRuntime<
    TypeOf<TState>,
    TResponse,
    TUnauthorizedBody
  >
}

type BearerAuthResponseHeaders = {
  readonly 'www-authenticate': string
}

export interface BearerAuthRuntime<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  readonly authenticate: (
    token: string,
  ) =>
    | TContribution
    | null
    | undefined
    | Promise<TContribution | null | undefined>
  readonly unauthorized: () => BearerAuthUnauthorized<
    TResponse,
    TUnauthorizedBody
  >
}

export type BearerAuthLayerDescriptor<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> = LayerDescriptor<
  TContribution,
  readonly [],
  string extends TResponse
    ? unknown
    : LogicalHttpResult<
        TResponse,
        TUnauthorizedBody,
        BearerAuthResponseHeaders
      >,
  readonly [],
  string,
  readonly [],
  BearerAuthContext
>

export interface BearerAuthContext {
  readonly input: {
    readonly headers: Readonly<Record<string, string | undefined>>
  }
}

export function bearerAuth<
  const TState extends Type<object>,
  const TResponse extends string,
  TUnauthorizedBody,
>(
  definition: BearerAuthDefinition<TState, TResponse, TUnauthorizedBody>,
): BearerAuthLayerDescriptor<TypeOf<TState>, TResponse, TUnauthorizedBody> {
  const challenge = formatBearerChallenge(definition.realm)
  const descriptor = layer({
    name: definition.name ?? 'bearerAuth',
    state: definition.state,
    context: typeCarrier<BearerAuthContext>(),
    result:
      typeCarrier<
        string extends TResponse
          ? unknown
          : LogicalHttpResult<
              TResponse,
              TUnauthorizedBody,
              BearerAuthResponseHeaders
            >
      >(),
    factory: () => {
      const runtime = definition.factory()
      registerLayerShortCircuits(descriptor, [
        {
          protocol: 'http',
          response: runtime.unauthorized().response,
          metadata: { status: 401 },
        },
      ])

      return async (ctx, next) => {
        const token = readBearerToken(ctx.input.headers.authorization)
        if (!token) {
          return unauthorizedResult(runtime.unauthorized(), challenge)
        }

        const value = await runtime.authenticate(token)
        if (value == null) {
          return unauthorizedResult(runtime.unauthorized(), challenge)
        }
        await next(value)
      }
    },
  })

  return descriptor
}

function unauthorizedResult<TResponse extends string, TBody>(
  unauthorized: BearerAuthUnauthorized<TResponse, TBody>,
  challenge: string,
) {
  return shortCircuit<
    LogicalHttpResult<TResponse, TBody, BearerAuthResponseHeaders>
  >({
    kind: 'http-result',
    response: unauthorized.response,
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
