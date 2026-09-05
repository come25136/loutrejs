export type HttpPathSegment =
  | { readonly kind: 'static'; readonly value: string }
  | { readonly kind: 'param'; readonly name: string }

const PARAM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const HTTP_METHOD_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

export function assertValidHttpMethod(method: string): void {
  if (!HTTP_METHOD_PATTERN.test(method)) {
    throw new Error(`Invalid HTTP method: ${JSON.stringify(method)}`)
  }
}

export function parseHttpPath(path: string): readonly HttpPathSegment[] {
  if (path === '/') return Object.freeze([])
  if (!path.startsWith('/')) {
    throw new Error(`Invalid HTTP path: ${path}`)
  }
  if (path.endsWith('/') || path.includes('//')) {
    throw new Error(`Invalid HTTP path segment: ${path}`)
  }
  if (path.includes('?') || path.includes('#')) {
    throw new Error(`HTTP path must not contain a query or fragment: ${path}`)
  }

  const names = new Set<string>()
  const segments = path
    .slice(1)
    .split('/')
    .map((segment): HttpPathSegment => {
      if (segment.startsWith('{') || segment.endsWith('}')) {
        const match = /^\{([^{}]*)\}$/.exec(segment)
        const name = match?.[1]
        if (!name || !PARAM_NAME_PATTERN.test(name)) {
          throw new Error(`Invalid HTTP path parameter: ${segment}`)
        }
        if (names.has(name)) {
          throw new Error(`Duplicate HTTP path parameter: ${name}`)
        }
        names.add(name)
        return Object.freeze({ kind: 'param', name })
      }
      if (segment.includes('{') || segment.includes('}')) {
        throw new Error(
          `Inline HTTP path parameters are not supported: ${segment}`,
        )
      }
      return Object.freeze({ kind: 'static', value: segment })
    })
  return Object.freeze(segments)
}

export function normalizeHttpPath(
  segments: readonly HttpPathSegment[],
): string {
  if (segments.length === 0) return '/'
  return `/${segments
    .map((segment) => (segment.kind === 'static' ? segment.value : '{}'))
    .join('/')}`
}

export function createHttpDispatchKey(
  method: string,
  segments: readonly HttpPathSegment[],
): string {
  return `http:${method.toUpperCase()}:${normalizeHttpPath(segments)}`
}

export function matchHttpPath(
  segments: readonly HttpPathSegment[],
  pathname: string,
): Record<string, string> | undefined {
  const requestSegments = pathname === '/' ? [] : pathname.slice(1).split('/')
  if (requestSegments.length !== segments.length) return undefined

  const params: Record<string, string> = {}
  for (const [index, routeSegment] of segments.entries()) {
    const requestSegment = requestSegments[index]!
    if (routeSegment.kind === 'static') {
      if (routeSegment.value !== requestSegment) return undefined
      continue
    }
    try {
      params[routeSegment.name] = decodeURIComponent(requestSegment)
    } catch (error) {
      throw new HttpPathDecodeError(error)
    }
  }
  return params
}

export class HttpPathDecodeError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP path decode failed', { cause })
    this.name = 'HttpPathDecodeError'
  }
}
