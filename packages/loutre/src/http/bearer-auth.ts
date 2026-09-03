import {
  defineLayer,
  registerLayerShortCircuits,
  shortCircuit,
  type LayerDescriptor,
} from '../core/index.js'
import type { LogicalHttpResult } from './definitions.js'

export interface BearerAuthUnauthorized<TResponse extends string, TBody> {
  readonly response: TResponse
  readonly body: TBody
}

export interface BearerAuthDefinition {
  readonly realm: string
  readonly name?: string
}

type BearerAuthShortCircuits<TResponse extends string> = readonly [
  {
    readonly protocol: 'http'
    readonly response: TResponse
    readonly metadata: { readonly status: 401 }
  },
]

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

export interface BearerAuthBuilder {
  factory<
    TContribution extends object,
    const TResponse extends string,
    TUnauthorizedBody,
  >(
    factory: () => BearerAuthRuntime<
      TContribution,
      TResponse,
      TUnauthorizedBody
    >,
  ): BearerAuthLayerDescriptor<TContribution, TResponse, TUnauthorizedBody>
}

export interface BearerAuthLayerDescriptor<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> extends LayerDescriptor<
  TContribution,
  readonly [],
  string extends TResponse
    ? unknown
    : LogicalHttpResult<
        TResponse,
        TUnauthorizedBody,
        BearerAuthResponseHeaders
      >,
  BearerAuthShortCircuits<TResponse>,
  string,
  readonly [],
  BearerAuthContext
> {}

export interface BearerAuthContext {
  readonly input: {
    readonly headers: Readonly<Record<string, string | undefined>>
  }
}

export function defineBearerAuth(
  definition: BearerAuthDefinition,
): BearerAuthBuilder {
  const challenge = formatBearerChallenge(definition.realm)

  return Object.freeze({
    factory<
      TContribution extends object,
      const TResponse extends string,
      TUnauthorizedBody,
    >(
      factory: () => BearerAuthRuntime<
        TContribution,
        TResponse,
        TUnauthorizedBody
      >,
    ): BearerAuthLayerDescriptor<TContribution, TResponse, TUnauthorizedBody> {
      let descriptor: BearerAuthLayerDescriptor<
        TContribution,
        TResponse,
        TUnauthorizedBody
      >

      descriptor = defineLayer({
        name: definition.name ?? 'bearerAuth',
      }).factory<
        TContribution,
        BearerAuthContext,
        string extends TResponse
          ? unknown
          : LogicalHttpResult<
              TResponse,
              TUnauthorizedBody,
              BearerAuthResponseHeaders
            >
      >(() => {
        const runtime = factory()
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
      }) as unknown as BearerAuthLayerDescriptor<
        TContribution,
        TResponse,
        TUnauthorizedBody
      >

      return descriptor
    },
  })
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
