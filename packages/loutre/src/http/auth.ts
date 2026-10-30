import { defineLayer } from '../core/index.js'
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

export type BasicAuthUnauthorized<
  TResponse extends string,
  TBody,
> = HttpAuthenticationFailure<TResponse, TBody>

export type BearerAuthUnauthorized<
  TResponse extends string,
  TBody,
> = HttpAuthenticationFailure<TResponse, TBody>

export interface BasicAuthContext {
  readonly input: {
    readonly headers: Readonly<Record<string, string | undefined>>
  }
}

export interface BearerAuthContext {
  readonly input: {
    readonly headers: Readonly<Record<string, string | undefined>>
  }
}

export type BearerAuthenticator<TIdentity extends object = object> = (
  token: string,
  input: { readonly signal: AbortSignal },
) => TIdentity | null | undefined | Promise<TIdentity | null | undefined>

export async function authenticateBearer<TIdentity extends object>(
  authorization: unknown,
  authenticate: BearerAuthenticator<TIdentity>,
  input: { readonly signal: AbortSignal },
): Promise<TIdentity | null> {
  const { signal } = input
  signal.throwIfAborted()
  const token =
    typeof authorization === 'string'
      ? readBearerToken(authorization)
      : undefined
  if (!token) return null
  let abort!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    const identity = await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted()
        return authenticate(token, input)
      }),
      aborted,
    ])
    signal.throwIfAborted()
    if (identity != null && typeof identity !== 'object')
      throw new TypeError(
        'Bearer authenticateは利用者のオブジェクトかnullを返してください。',
      )
    return identity ?? null
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

type AuthenticationChallengeHeaders = {
  readonly 'www-authenticate': string
}

type AuthenticationShortCircuit<
  TResponse extends string,
  TBody,
> = HttpExecutionResult<TResponse, TBody, AuthenticationChallengeHeaders>

export interface BasicAuthDefinition<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  readonly name?: string
  readonly realm: string
  readonly factory: () => BasicAuthRuntime<
    TContribution,
    TResponse,
    TUnauthorizedBody
  >
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
  unauthorized():
    | HttpAuthenticationFailure<TResponse, TUnauthorizedBody>
    | Response
}

export function basicAuth<
  const TContribution extends object,
  const TResponse extends string,
  TUnauthorizedBody,
>(
  definition: BasicAuthDefinition<TContribution, TResponse, TUnauthorizedBody>,
): HttpMiddleware<
  TContribution,
  HttpMiddlewareContext,
  AuthenticationShortCircuit<TResponse, TUnauthorizedBody>
> {
  const challenge = formatBasicChallenge(definition.realm)
  return defineLayer<
    TContribution,
    HttpMiddlewareContext,
    HttpExecutionResult | Response
  >({
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
        await next(contribution)
      }
    },
  })
}

export interface BearerAuthDefinition<
  TIdentity extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  readonly name?: string
  readonly realm: string
  readonly factory: () => BearerAuthRuntime<
    TIdentity,
    TResponse,
    TUnauthorizedBody
  >
}

export interface BearerAuthRuntime<
  TIdentity extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  authenticate: BearerAuthenticator<TIdentity>
  unauthorized():
    | HttpAuthenticationFailure<TResponse, TUnauthorizedBody>
    | Response
}

export function bearerAuth<
  const TIdentity extends object,
  const TResponse extends string,
  TUnauthorizedBody,
>(
  definition: BearerAuthDefinition<TIdentity, TResponse, TUnauthorizedBody>,
): HttpMiddleware<
  { readonly identity: TIdentity },
  HttpMiddlewareContext,
  AuthenticationShortCircuit<TResponse, TUnauthorizedBody>
> {
  const challenge = formatBearerChallenge(definition.realm)
  return defineLayer<
    { readonly identity: TIdentity },
    HttpMiddlewareContext,
    HttpExecutionResult | Response
  >({
    name: definition.name ?? 'bearerAuth',
    factory: () => {
      const runtime = definition.factory()
      return async (context, next) => {
        const identity = await authenticateBearer(
          context.request.headers.get('authorization'),
          (token, input) => runtime.authenticate(token, input),
          { signal: context.signal },
        )
        if (identity === null) {
          return authenticationFailure(runtime.unauthorized(), challenge)
        }
        await next({ identity })
      }
    },
  })
}

function authenticationFailure<TResponse extends string, TBody>(
  failure: HttpAuthenticationFailure<TResponse, TBody> | Response,
  challenge: string,
): AuthenticationShortCircuit<TResponse, TBody> | Response {
  if (failure instanceof Response) {
    const headers = new Headers(failure.headers)
    headers.set('www-authenticate', challenge)
    return new Response(failure.body, {
      status: failure.status,
      statusText: failure.statusText,
      headers,
    })
  }
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
