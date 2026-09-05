import { defineLayer, type TokenLike, type TokenValue } from '@loutrejs/loutre'
import type {
  HttpExecutionResult,
  HttpLayer,
  HttpLayerContext,
} from './extension.js'

export interface BasicAuthCredentials {
  readonly username: string
  readonly password: string
}

export interface HttpAuthenticationFailure<TResponse extends string, TBody> {
  readonly response: TResponse
  readonly body: TBody
}

export interface BasicAuthRuntime<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  authenticate(
    credentials: BasicAuthCredentials,
  ):
    | TContribution
    | null
    | undefined
    | Promise<TContribution | null | undefined>
  unauthorized(): HttpAuthenticationFailure<TResponse, TUnauthorizedBody>
}

export function basicAuth<
  const TContribution extends object,
  const TResponse extends string,
  TUnauthorizedBody,
  const TInject extends readonly TokenLike[] = readonly [],
>(definition: {
  readonly name?: string
  readonly realm: string
  readonly inject?: TInject
  readonly factory: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => BasicAuthRuntime<TContribution, TResponse, TUnauthorizedBody>
}): HttpLayer<TContribution, TInject> {
  const challenge = `Basic realm="${escapeChallengeValue(definition.realm)}", charset="UTF-8"`
  return defineLayer<
    HttpLayerContext,
    TContribution,
    HttpExecutionResult,
    TInject
  >({
    name: definition.name ?? 'basicAuth',
    ...(definition.inject === undefined ? {} : { inject: definition.inject }),
    factory: (...dependencies) => {
      const runtime = definition.factory(...dependencies)
      return async (context, next) => {
        const credentials = decodeBasicCredentials(
          context.request.headers.get('authorization'),
        )
        if (!credentials) {
          return authenticationFailure(runtime.unauthorized(), challenge)
        }
        const contribution = await runtime.authenticate(credentials)
        if (contribution == null) {
          return authenticationFailure(runtime.unauthorized(), challenge)
        }
        return next(contribution)
      }
    },
  })
}

export interface BearerAuthRuntime<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  authenticate(
    token: string,
  ):
    | TContribution
    | null
    | undefined
    | Promise<TContribution | null | undefined>
  unauthorized(): HttpAuthenticationFailure<TResponse, TUnauthorizedBody>
}

export function bearerAuth<
  const TContribution extends object,
  const TResponse extends string,
  TUnauthorizedBody,
  const TInject extends readonly TokenLike[] = readonly [],
>(definition: {
  readonly name?: string
  readonly realm: string
  readonly inject?: TInject
  readonly factory: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => BearerAuthRuntime<TContribution, TResponse, TUnauthorizedBody>
}): HttpLayer<TContribution, TInject> {
  const challenge = `Bearer realm="${escapeChallengeValue(definition.realm)}"`
  return defineLayer<
    HttpLayerContext,
    TContribution,
    HttpExecutionResult,
    TInject
  >({
    name: definition.name ?? 'bearerAuth',
    ...(definition.inject === undefined ? {} : { inject: definition.inject }),
    factory: (...dependencies) => {
      const runtime = definition.factory(...dependencies)
      return async (context, next) => {
        const token = readBearerToken(
          context.request.headers.get('authorization'),
        )
        if (!token) {
          return authenticationFailure(runtime.unauthorized(), challenge)
        }
        const contribution = await runtime.authenticate(token)
        if (contribution == null) {
          return authenticationFailure(runtime.unauthorized(), challenge)
        }
        return next(contribution)
      }
    },
  })
}

function authenticationFailure<TResponse extends string, TBody>(
  failure: HttpAuthenticationFailure<TResponse, TBody>,
  challenge: string,
): HttpExecutionResult<TResponse, TBody> {
  return {
    kind: 'http-result',
    response: failure.response,
    body: failure.body,
    headers: { 'www-authenticate': challenge },
  }
}

function decodeBasicCredentials(
  authorization: string | null,
): BasicAuthCredentials | undefined {
  if (!authorization?.startsWith('Basic ')) return undefined
  const encoded = authorization.slice('Basic '.length).trim()
  if (encoded.length === 0) return undefined
  try {
    const decoded = atob(encoded)
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

function readBearerToken(authorization: string | null): string | undefined {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const token = authorization.slice('Bearer '.length).trim()
  return token.length === 0 ? undefined : token
}

function escapeChallengeValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
