import { defineLayer } from '@loutrejs/loutre'
import type {
  HttpExecutionResult,
  HttpMiddleware,
  HttpMiddlewareContext,
} from './extension.js'

export interface BasicAuthCredentials {
  readonly username: string
  readonly password: string
}

export interface HttpAuthenticationFailure<TResponse extends string, TBody> {
  readonly response: TResponse
  readonly body: TBody
}

type AuthenticationChallengeHeaders = {
  readonly 'www-authenticate': string
}

type AuthenticationShortCircuit<
  TResponse extends string,
  TBody,
> = HttpExecutionResult<TResponse, TBody, AuthenticationChallengeHeaders>

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
>(definition: {
  readonly name?: string
  readonly realm: string
  readonly factory: () => BasicAuthRuntime<
    TContribution,
    TResponse,
    TUnauthorizedBody
  >
}): HttpMiddleware<
  TContribution,
  HttpMiddlewareContext,
  AuthenticationShortCircuit<TResponse, TUnauthorizedBody>
> {
  const challenge = formatBasicChallenge(definition.realm)
  return defineLayer<HttpMiddlewareContext, TContribution, HttpExecutionResult>(
    {
      name: definition.name ?? 'basicAuth',
      factory: () => {
        const runtime = definition.factory()
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
    },
  )
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
>(definition: {
  readonly name?: string
  readonly realm: string
  readonly factory: () => BearerAuthRuntime<
    TContribution,
    TResponse,
    TUnauthorizedBody
  >
}): HttpMiddleware<
  TContribution,
  HttpMiddlewareContext,
  AuthenticationShortCircuit<TResponse, TUnauthorizedBody>
> {
  const challenge = formatBearerChallenge(definition.realm)
  return defineLayer<HttpMiddlewareContext, TContribution, HttpExecutionResult>(
    {
      name: definition.name ?? 'bearerAuth',
      factory: () => {
        const runtime = definition.factory()
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
    },
  )
}

function authenticationFailure<TResponse extends string, TBody>(
  failure: HttpAuthenticationFailure<TResponse, TBody>,
  challenge: string,
): AuthenticationShortCircuit<TResponse, TBody> {
  return {
    kind: 'http-result',
    response: failure.response,
    body: failure.body,
    headers: { 'www-authenticate': challenge },
  }
}

function formatBasicChallenge(realm: string): string {
  assertValidRealm(realm, 'Basic')
  return `Basic realm="${escapeChallengeValue(realm)}", charset="UTF-8"`
}

function formatBearerChallenge(realm: string): string {
  assertValidRealm(realm, 'Bearer')
  return `Bearer realm="${escapeChallengeValue(realm)}"`
}

function assertValidRealm(realm: string, scheme: 'Basic' | 'Bearer'): void {
  if (realm.length === 0 || containsControlCharacter(realm)) {
    throw new TypeError(
      `${scheme} authentication realm cannot be empty or contain control characters`,
    )
  }
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function decodeBasicCredentials(
  authorization: string | null,
): BasicAuthCredentials | undefined {
  const encoded = /^Basic +([A-Za-z0-9+/]+={0,2})$/i.exec(
    authorization ?? '',
  )?.[1]
  if (!encoded) return undefined
  try {
    const binary = atob(encoded)
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

function readBearerToken(authorization: string | null): string | undefined {
  return /^Bearer +([^\s]+)$/i.exec(authorization ?? '')?.[1]
}

function escapeChallengeValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
