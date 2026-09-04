import {
  layer,
  registerLayerShortCircuits,
  shortCircuit,
} from '../core/index.js'
import type { Type } from '../core/index.js'
import type { LogicalHttpResult } from './definitions.js'

export interface BasicAuthCredentials {
  readonly username: string
  readonly password: string
}

export interface BasicAuthUnauthorized<TResponse extends string, TBody> {
  readonly response: TResponse
  readonly body: TBody
}

export interface BasicAuthDefinition<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  readonly realm: string
  readonly name?: string
  readonly state: Type<TContribution>
  readonly factory: () => BasicAuthRuntime<
    TContribution,
    TResponse,
    TUnauthorizedBody
  >
}

type BasicAuthResponseHeaders = {
  readonly 'www-authenticate': string
}

export interface BasicAuthRuntime<
  TContribution extends object,
  TResponse extends string,
  TUnauthorizedBody,
> {
  readonly authenticate: (
    credentials: BasicAuthCredentials,
  ) =>
    | TContribution
    | null
    | undefined
    | Promise<TContribution | null | undefined>
  readonly unauthorized: () => BasicAuthUnauthorized<
    TResponse,
    TUnauthorizedBody
  >
}

export interface BasicAuthContext {
  readonly input: {
    readonly headers: Readonly<Record<string, string | undefined>>
  }
}

export function basicAuth<
  const TContribution extends object,
  const TResponse extends string,
  TUnauthorizedBody,
>(
  definition: BasicAuthDefinition<TContribution, TResponse, TUnauthorizedBody>,
) {
  const challenge = formatBasicChallenge(definition.realm)
  const descriptor = layer({
    name: definition.name ?? 'basicAuth',
    state: definition.state,
    factory: () => {
      const runtime = definition.factory()
      registerLayerShortCircuits(descriptor, [
        {
          protocol: 'http',
          response: runtime.unauthorized().response,
          metadata: { status: 401 },
        },
      ])

      return async (ctx: BasicAuthContext, next) => {
        const credentials = decodeBasicCredentials(
          ctx.input.headers.authorization,
        )
        if (!credentials) {
          return unauthorizedResult(runtime.unauthorized(), challenge)
        }

        const value = await runtime.authenticate(credentials)
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
  unauthorized: BasicAuthUnauthorized<TResponse, TBody>,
  challenge: string,
) {
  return shortCircuit<
    LogicalHttpResult<TResponse, TBody, BasicAuthResponseHeaders>
  >({
    kind: 'http-result',
    response: unauthorized.response,
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
