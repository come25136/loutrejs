export type CorsOrigin =
  | string
  | readonly string[]
  | ((origin: string) => boolean | Promise<boolean>)

export interface CorsPolicyOptions {
  readonly origin?: CorsOrigin
  readonly allowMethods?: readonly string[]
  readonly allowHeaders?: readonly string[]
  readonly exposeHeaders?: readonly string[]
  readonly credentials?: boolean
  readonly maxAge?: number
}

export type CorsPolicy = Readonly<{
  origin:
    | { readonly kind: 'wildcard' }
    | { readonly kind: 'exact'; readonly origins: ReadonlySet<string> }
    | {
        readonly kind: 'predicate'
        readonly predicate: (origin: string) => boolean | Promise<boolean>
      }
  allowMethods: readonly string[] | undefined
  allowHeaders: readonly string[] | undefined
  exposeHeaders: readonly string[]
  credentials: boolean
  maxAge: number | undefined
}>

const policies = new WeakMap<object, CorsPolicy>()
const httpToken = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export function normalizeCorsPolicy(options: CorsPolicyOptions): CorsPolicy {
  const credentials = options.credentials ?? false
  return Object.freeze({
    origin: normalizeOrigin(options.origin ?? '*', credentials),
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
    credentials,
    maxAge: normalizeMaxAge(options.maxAge),
  })
}

export function registerCorsPolicy(
  middleware: object,
  policy: CorsPolicy,
): void {
  policies.set(middleware, policy)
}

export async function createCorsActualResponseHeaders(
  middlewares: readonly object[],
  request: Request,
): Promise<Headers | undefined> {
  const policy = corsPolicyOfMiddlewares(middlewares)
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
  middlewares: readonly object[],
  request: Request,
  targetMethod: string,
): Promise<Headers | undefined> {
  const policy = corsPolicyOfMiddlewares(middlewares)
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

function corsPolicyOfMiddlewares(
  middlewares: readonly object[],
): CorsPolicy | undefined {
  let found: CorsPolicy | undefined
  for (const middleware of middlewares) {
    const policy = policies.get(middleware)
    if (policy) found = policy
  }
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

function normalizeOrigin(
  origin: CorsOrigin,
  credentials: boolean,
): CorsPolicy['origin'] {
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
        'CORS origin cannot be empty or contain control characters',
      )
    }
  }
  if (origins.includes('*')) {
    if (credentials) {
      throw new TypeError(
        'CORS origin cannot be a wildcard when credentials are enabled',
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
        throw new TypeError(`CORS ${option} contains an invalid HTTP token`)
      }
      return uppercase ? token.toUpperCase() : token
    }),
  )
}

function normalizeMaxAge(maxAge: number | undefined): number | undefined {
  if (maxAge === undefined) return undefined
  if (!Number.isSafeInteger(maxAge) || maxAge < 0) {
    throw new TypeError('CORS maxAge must be a non-negative safe integer')
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
