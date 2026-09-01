type AsciiLowercase =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'

type AsciiLetter = AsciiLowercase | Uppercase<AsciiLowercase>
type AsciiDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type ParamNameStart = AsciiLetter | '_'
type ParamNameContinuation = ParamNameStart | AsciiDigit

type HttpMethodTokenCharacter =
  | AsciiLetter
  | AsciiDigit
  | '!'
  | '#'
  | '$'
  | '%'
  | '&'
  | "'"
  | '*'
  | '+'
  | '-'
  | '.'
  | '^'
  | '_'
  | '`'
  | '|'
  | '~'

type IsHttpMethodTokenRest<TMethod extends string> = TMethod extends ''
  ? true
  : TMethod extends `${HttpMethodTokenCharacter}${infer TRest}`
    ? IsHttpMethodTokenRest<TRest>
    : false

export type IsValidHttpMethod<TMethod extends string> = string extends TMethod
  ? false
  : TMethod extends `${HttpMethodTokenCharacter}${infer TRest}`
    ? IsHttpMethodTokenRest<TRest>
    : false

type IsParamNameRest<TName extends string> = TName extends ''
  ? true
  : TName extends `${ParamNameContinuation}${infer TRest}`
    ? IsParamNameRest<TRest>
    : false

type IsParamName<TName extends string> =
  TName extends `${ParamNameStart}${infer TRest}`
    ? IsParamNameRest<TRest>
    : false

type IsStaticSegment<TSegment extends string> = TSegment extends ''
  ? false
  : TSegment extends `${string}{${string}` | `${string}}${string}`
    ? false
    : TSegment extends `${string}?${string}` | `${string}#${string}`
      ? false
      : true

type ValidatePathSegments<
  TSegments extends string,
  TSeen extends string = never,
> = TSegments extends `${infer THead}/${infer TTail}`
  ? ValidatePathSegment<THead, TSeen> extends infer TResult
    ? TResult extends {
        readonly valid: true
        readonly seen: infer TNext extends string
      }
      ? ValidatePathSegments<TTail, TNext>
      : false
    : false
  : ValidatePathSegment<TSegments, TSeen> extends { readonly valid: true }
    ? true
    : false

type ValidatePathSegment<
  TSegment extends string,
  TSeen extends string,
> = TSegment extends `{${infer TName}}`
  ? IsParamName<TName> extends true
    ? TName extends TSeen
      ? { readonly valid: false }
      : { readonly valid: true; readonly seen: TSeen | TName }
    : { readonly valid: false }
  : IsStaticSegment<TSegment> extends true
    ? { readonly valid: true; readonly seen: TSeen }
    : { readonly valid: false }

export type IsValidHttpPath<TPath extends string> = string extends TPath
  ? false
  : TPath extends '/'
    ? true
    : TPath extends `/${infer TSegments}`
      ? ValidatePathSegments<TSegments>
      : false

type PathParamNamesFromSegments<TSegments extends string> =
  TSegments extends `${infer THead}/${infer TTail}`
    ? PathParamName<THead> | PathParamNamesFromSegments<TTail>
    : PathParamName<TSegments>

type PathParamName<TSegment extends string> =
  TSegment extends `{${infer TName}}` ? TName : never

export type PathParamNames<TPath extends string> =
  TPath extends `/${infer TSegments}`
    ? PathParamNamesFromSegments<TSegments>
    : never

export type RawPathParams<TPath extends string> = Readonly<{
  [TName in PathParamNames<TPath>]: string
}>

type NormalizeHttpPathSegments<TSegments extends string> =
  TSegments extends `${infer THead}/${infer TTail}`
    ? `${NormalizeHttpPathSegment<THead>}/${NormalizeHttpPathSegments<TTail>}`
    : NormalizeHttpPathSegment<TSegments>

type NormalizeHttpPathSegment<TSegment extends string> =
  TSegment extends `{${string}}` ? '{}' : TSegment

export type NormalizeHttpPath<TPath extends string> = TPath extends '/'
  ? '/'
  : string extends TPath
    ? string
    : TPath extends `/${infer TSegments}`
      ? `/${NormalizeHttpPathSegments<TSegments>}`
      : never

export type HttpDispatchKey<
  TMethod extends string,
  TPath extends string,
> = `http:${Uppercase<TMethod>}:${NormalizeHttpPath<TPath>}`

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
  for (let index = 0; index < segments.length; index += 1) {
    const routeSegment = segments[index]!
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

export function compareHttpPathSpecificity(
  left: readonly HttpPathSegment[],
  right: readonly HttpPathSegment[],
): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftSegment = left[index]!
    const rightSegment = right[index]!
    if (leftSegment.kind === rightSegment.kind) continue
    return leftSegment.kind === 'static' ? -1 : 1
  }
  return right.length - left.length
}

export class HttpPathDecodeError extends Error {
  constructor(readonly cause: unknown) {
    super('HTTP path decode failed', { cause })
    this.name = 'HttpPathDecodeError'
  }
}
