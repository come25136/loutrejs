import { defineLayer } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpMiddlewareContext } from './extension.js'

export interface CorsOptions {
  readonly origin?: string | readonly string[]
  readonly allowMethods?: readonly string[]
  readonly allowHeaders?: readonly string[]
  readonly exposeHeaders?: readonly string[]
  readonly credentials?: boolean
  readonly maxAge?: number
  readonly name?: string
}

export function cors(options: CorsOptions = {}) {
  if (options.credentials && isWildcardOrigin(options.origin)) {
    throw new TypeError(
      'CORS origin cannot be a wildcard when credentials are enabled',
    )
  }
  return defineLayer<HttpMiddlewareContext, {}, HttpExecutionResult>({
    name: options.name ?? 'cors',
    factory: () => async (context, next) => {
      const result = await next()
      const origin = context.request.headers.get('origin')
      if (!origin || !isAllowedOrigin(options.origin, origin)) return result
      const headers = new Headers(result.headers)
      headers.set(
        'access-control-allow-origin',
        isWildcardOrigin(options.origin) ? '*' : origin,
      )
      if (!isWildcardOrigin(options.origin)) appendVary(headers, 'Origin')
      if (options.credentials)
        headers.set('access-control-allow-credentials', 'true')
      if (context.request.method === 'OPTIONS') {
        if (options.allowMethods?.length)
          headers.set(
            'access-control-allow-methods',
            options.allowMethods.join(', '),
          )
        if (options.allowHeaders?.length)
          headers.set(
            'access-control-allow-headers',
            options.allowHeaders.join(', '),
          )
        if (options.maxAge !== undefined)
          headers.set('access-control-max-age', String(options.maxAge))
      } else if (options.exposeHeaders?.length) {
        headers.set(
          'access-control-expose-headers',
          options.exposeHeaders.join(', '),
        )
      }
      return { ...result, headers }
    },
  })
}

function isAllowedOrigin(
  configured: string | readonly string[] | undefined,
  origin: string,
): boolean {
  if (configured === undefined) return true
  if (isWildcardOrigin(configured)) return true
  return typeof configured === 'string'
    ? configured === origin
    : configured.includes(origin)
}

function isWildcardOrigin(
  configured: string | readonly string[] | undefined,
): boolean {
  if (configured === undefined || configured === '*') return true
  return typeof configured !== 'string' && configured.includes('*')
}

function appendVary(headers: Headers, value: string): void {
  const values = (headers.get('vary') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value)
  }
  headers.set('vary', values.join(', '))
}
