import {
  childPipelineOf,
  layer,
  layerDefinitionOf,
  type LayerDescriptor,
  type PipelineItem,
} from '../core/index.js'

export type CorsOrigin =
  | string
  | readonly string[]
  | ((origin: string) => boolean | Promise<boolean>)

export interface CorsOptions {
  readonly origin?: CorsOrigin
  readonly allowMethods?: readonly string[]
  readonly allowHeaders?: readonly string[]
  readonly exposeHeaders?: readonly string[]
  readonly credentials?: boolean
  readonly maxAge?: number
  readonly name?: string
}

export interface CorsLayerDescriptor extends LayerDescriptor<
  readonly [],
  readonly [],
  never,
  readonly [],
  string,
  'framework',
  readonly [],
  object
> {
  readonly role: 'framework'
}

type NormalizedCorsOrigin =
  | { readonly kind: 'wildcard' }
  | { readonly kind: 'exact'; readonly origins: ReadonlySet<string> }
  | {
      readonly kind: 'predicate'
      readonly predicate: (origin: string) => boolean | Promise<boolean>
    }

interface CorsPolicy {
  readonly origin: NormalizedCorsOrigin
  readonly allowMethods: readonly string[] | undefined
  readonly allowHeaders: readonly string[] | undefined
  readonly exposeHeaders: readonly string[]
  readonly credentials: boolean
  readonly maxAge: number | undefined
}

const policies = new WeakMap<object, CorsPolicy>()
const httpToken = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export function cors(options: CorsOptions = {}): CorsLayerDescriptor {
  const policy = normalizeCorsOptions(options)
  const descriptor = layer<
    readonly [],
    readonly [],
    object,
    never,
    readonly [],
    string,
    'framework'
  >({
    name: options.name ?? 'cors',
    role: 'framework',
    factory: () => async (_ctx, next) => {
      await next()
    },
  }) as CorsLayerDescriptor
  policies.set(descriptor, policy)
  return descriptor
}

export async function createCorsActualResponseHeaders(
  pipeline: readonly PipelineItem[],
  request: Request,
): Promise<Headers | undefined> {
  const policy = corsPolicyOfPipeline(pipeline)
  if (!policy) return undefined

  const origin = request.headers.get('origin')
  const headers = new Headers()
  if (policy.origin.kind !== 'wildcard') appendVary(headers, 'Origin')
  if (origin === null) return headers

  await applyOrigin(headers, policy, origin)
  if (!headers.has('access-control-allow-origin')) return headers

  if (policy.credentials) {
    headers.set('access-control-allow-credentials', 'true')
  }
  if (policy.exposeHeaders.length > 0) {
    headers.set(
      'access-control-expose-headers',
      policy.exposeHeaders.join(', '),
    )
  }
  return headers
}

export async function createCorsPreflightResponseHeaders(
  pipeline: readonly PipelineItem[],
  request: Request,
  targetMethod: string,
): Promise<Headers | undefined> {
  const policy = corsPolicyOfPipeline(pipeline)
  if (!policy) return undefined

  const headers = new Headers()
  appendVary(headers, 'Access-Control-Request-Method')

  const origin = request.headers.get('origin')
  if (origin === null) return headers
  await applyOrigin(headers, policy, origin)
  if (!headers.has('access-control-allow-origin')) return headers

  if (policy.credentials) {
    headers.set('access-control-allow-credentials', 'true')
  }

  const methods = policy.allowMethods ?? [targetMethod.toUpperCase()]
  if (methods.length > 0) {
    headers.set('access-control-allow-methods', methods.join(', '))
  }

  if (policy.allowHeaders === undefined) {
    const requested = request.headers.get('access-control-request-headers')
    if (requested !== null && requested.trim().length > 0) {
      headers.set('access-control-allow-headers', requested)
      appendVary(headers, 'Access-Control-Request-Headers')
    }
  } else if (policy.allowHeaders.length > 0) {
    headers.set('access-control-allow-headers', policy.allowHeaders.join(', '))
  }

  if (policy.maxAge !== undefined) {
    headers.set('access-control-max-age', String(policy.maxAge))
  }
  return headers
}

function corsPolicyOfPipeline(
  pipeline: readonly PipelineItem[],
): CorsPolicy | undefined {
  let found: CorsPolicy | undefined

  const visit = (items: readonly PipelineItem[]): void => {
    for (const item of items) {
      if (item.kind !== 'layer') continue
      const definition = layerDefinitionOf(item)
      const policy = policies.get(definition)
      if (policy) found = policy
      const child = childPipelineOf(item)
      if (child) visit(child)
    }
  }

  visit(pipeline)
  return found
}

async function applyOrigin(
  headers: Headers,
  policy: CorsPolicy,
  origin: string,
): Promise<void> {
  if (policy.origin.kind === 'wildcard') {
    headers.set('access-control-allow-origin', '*')
    return
  }

  appendVary(headers, 'Origin')
  const allowed =
    policy.origin.kind === 'exact'
      ? policy.origin.origins.has(origin)
      : await policy.origin.predicate(origin)
  if (allowed) headers.set('access-control-allow-origin', origin)
}

function normalizeCorsOptions(options: CorsOptions): CorsPolicy {
  const origin = normalizeOrigin(
    options.origin ?? '*',
    options.credentials ?? false,
  )
  return Object.freeze({
    origin,
    allowMethods:
      options.allowMethods === undefined
        ? undefined
        : normalizeTokens(options.allowMethods, 'allowMethods', true),
    allowHeaders:
      options.allowHeaders === undefined
        ? undefined
        : normalizeTokens(options.allowHeaders, 'allowHeaders', false),
    exposeHeaders: normalizeTokens(
      options.exposeHeaders ?? [],
      'exposeHeaders',
      false,
    ),
    credentials: options.credentials ?? false,
    maxAge: normalizeMaxAge(options.maxAge),
  })
}

function normalizeOrigin(
  origin: CorsOrigin,
  credentials: boolean,
): NormalizedCorsOrigin {
  if (typeof origin === 'function') {
    return Object.freeze({ kind: 'predicate', predicate: origin })
  }

  const origins = typeof origin === 'string' ? [origin] : [...origin]
  if (origins.length === 0) {
    return Object.freeze({ kind: 'exact', origins: new Set<string>() })
  }
  for (const value of origins) {
    if (value.length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new TypeError(
        'CORS originには空文字列または制御文字を使用できません',
      )
    }
  }
  if (origins.includes('*')) {
    if (credentials) {
      throw new TypeError(
        'credentialsを有効にする場合、CORS originにワイルドカードは使用できません',
      )
    }
    return Object.freeze({ kind: 'wildcard' })
  }
  return Object.freeze({
    kind: 'exact',
    origins: new Set(origins),
  })
}

function normalizeTokens(
  values: readonly string[],
  option: string,
  uppercase: boolean,
): readonly string[] {
  return Object.freeze(
    values.map((value) => {
      const token = value.trim()
      if (!httpToken.test(token)) {
        throw new TypeError(`CORS ${option}に不正なHTTP tokenが含まれています`)
      }
      return uppercase ? token.toUpperCase() : token
    }),
  )
}

function normalizeMaxAge(maxAge: number | undefined): number | undefined {
  if (maxAge === undefined) return undefined
  if (!Number.isSafeInteger(maxAge) || maxAge < 0) {
    throw new TypeError('CORS maxAgeには0以上の安全な整数を指定してください')
  }
  return maxAge
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get('vary')
  if (current === null) {
    headers.set('vary', value)
    return
  }
  const values = current
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
    values.push(value)
  }
  headers.set('vary', values.join(', '))
}
