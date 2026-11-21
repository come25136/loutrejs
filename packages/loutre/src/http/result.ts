import {
  type HttpErrorMatcher,
  type HttpErrorMapping,
  type HttpExecutionResult,
  type HttpHeaders,
} from './contract.js'

type ErrorOf<TDefinition> =
  TDefinition extends HttpErrorMatcher<infer TError> ? TError : never

export function httpError<
  TDefinition extends HttpErrorMatcher<{ readonly data: unknown }>,
>(
  definition: TDefinition,
): HttpErrorMapping<
  ErrorOf<TDefinition>,
  { readonly body: ErrorOf<TDefinition>['data'] }
>

export function httpError<
  TDefinition extends HttpErrorMatcher<{ readonly data: unknown }>,
  const TResult,
>(
  definition: TDefinition,
  map: (error: ErrorOf<TDefinition>) => TResult | Promise<TResult>,
): HttpErrorMapping<ErrorOf<TDefinition>, TResult>

export function httpError(
  definition: HttpErrorMatcher<{ readonly data: unknown }>,
  map?: (error: { readonly data: unknown }) => unknown | Promise<unknown>,
): HttpErrorMapping {
  return Object.freeze({
    kind: 'http-error-mapping',
    definition,
    map: map ?? ((error) => ({ body: error.data })),
  })
}

export const httpFrameworkHeaders = Symbol('loutre.http.framework-headers')

export type HttpExecutionResultWithFrameworkHeaders = HttpExecutionResult & {
  readonly [httpFrameworkHeaders]?: HttpHeaders
}

export function withHttpFrameworkHeaders(
  result: HttpExecutionResult,
  headers: HttpHeaders,
): HttpExecutionResult {
  const current = (result as HttpExecutionResultWithFrameworkHeaders)[
    httpFrameworkHeaders
  ]
  return {
    ...result,
    [httpFrameworkHeaders]: { ...current, ...headers },
  } as HttpExecutionResultWithFrameworkHeaders
}

export function isHttpInputRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
