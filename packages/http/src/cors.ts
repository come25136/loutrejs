import { defineLayer } from '@loutrejs/loutre'
import {
  normalizeCorsPolicy,
  registerCorsPolicy,
  type CorsOrigin,
} from './cors-internal.js'
import type {
  HttpExecutionResult,
  HttpMiddlewareContext,
} from './extension.js'

export type { CorsOrigin } from './cors-internal.js'

export interface CorsOptions {
  readonly origin?: CorsOrigin
  readonly allowMethods?: readonly string[]
  readonly allowHeaders?: readonly string[]
  readonly exposeHeaders?: readonly string[]
  readonly credentials?: boolean
  readonly maxAge?: number
  readonly name?: string
}

export function cors(options: CorsOptions = {}) {
  const policy = normalizeCorsPolicy(options)
  const middleware = defineLayer<
    HttpMiddlewareContext,
    {},
    HttpExecutionResult
  >({
    name: options.name ?? 'cors',
    factory: () => async (_context, next) => next(),
  })
  registerCorsPolicy(middleware, policy)
  return middleware
}
