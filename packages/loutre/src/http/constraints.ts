import {
  type HttpExecutionResponseDefinition,
  type HttpExecutionRouteDefinition,
  type ResponseHeadersSchema,
  type HttpHeaders,
  type HttpErrorMapping,
  type HttpResponseResult,
  type ResponseBodyOutput,
  type ResponseHeadersOutput,
  httpMiddlewareShortCircuit,
  type HttpRouteMiddleware,
  type DeclaredHttpResults,
  type HttpContractRouteDefinition,
  type HttpContractRawRouteDefinition,
} from './contract.js'
import {
  type StandardSchemaV1,
  type SchemaOutput,
  type SchemaInput,
} from '../core/index.js'
import { type PathParamNames } from './path.js'

type HttpStatusDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'

type HttpStatusHundreds = '2' | '3' | '4' | '5'

type IsValidHttpResponseStatus<TStatus extends number> = number extends TStatus
  ? false
  : `${TStatus}` extends `${HttpStatusHundreds}${HttpStatusDigit}${HttpStatusDigit}`
    ? true
    : false

type IsBodylessHttpStatus<TStatus extends number> = TStatus extends
  | 204
  | 205
  | 304
  ? true
  : false

type IsResponseStatusCompatible<TResponse> =
  TResponse extends HttpExecutionResponseDefinition
    ? IsValidHttpResponseStatus<TResponse['status']> extends true
      ? IsBodylessHttpStatus<TResponse['status']> extends true
        ? TResponse extends
            | { readonly body: StandardSchemaV1 }
            | { readonly stream: 'server' }
          ? false
          : true
        : TResponse extends { readonly stream: 'server' }
          ? TResponse extends { readonly body: StandardSchemaV1 }
            ? true
            : false
          : true
      : false
    : false

type AreResponseStatusesCompatible<
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsResponseStatusCompatible<
    TResponses[TVariant]
  >
}[keyof TResponses]
  ? false
  : true

type IsResponseHeadersSchemaCompatible<TResponse> =
  ResponseHeadersSchema<TResponse> extends infer THeaders
    ? [THeaders] extends [never]
      ? true
      : THeaders extends StandardSchemaV1
        ? SchemaOutput<THeaders> extends HttpHeaders | undefined
          ? true
          : false
        : true
    : true

type AreResponseHeadersSchemasCompatible<
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsResponseHeadersSchemaCompatible<
    TResponses[TVariant]
  >
}[keyof TResponses]
  ? false
  : true

type ErrorMappingResult<TResponse> = TResponse extends {
  readonly error: infer TMapping extends HttpErrorMapping<any, any>
}
  ? Awaited<ReturnType<TMapping['map']>>
  : never

type IsErrorMappingCompatible<TResponse> =
  TResponse extends HttpExecutionResponseDefinition
    ? TResponse extends { readonly error: HttpErrorMapping<any, any> }
      ? TResponse extends { readonly body: StandardSchemaV1 }
        ? ErrorMappingResult<TResponse> extends HttpResponseResult<
            ResponseBodyOutput<TResponse>,
            ResponseHeadersOutput<TResponse>
          >
          ? true
          : false
        : false
      : true
    : false

type AreErrorMappingsCompatible<
  TResponses extends HttpExecutionRouteDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsErrorMappingCompatible<TResponses[TVariant]>
}[keyof TResponses]
  ? false
  : true

type HasRequiredStringContentType<TValue> = [TValue] extends [
  { readonly 'content-type': string },
]
  ? true
  : false

type IsExactParamsSchemaMap<
  TPath extends string,
  TSchemas extends Readonly<Record<string, StandardSchemaV1>>,
> =
  Exclude<keyof TSchemas, PathParamNames<TPath>> extends never
    ? Exclude<PathParamNames<TPath>, keyof TSchemas> extends never
      ? true
      : false
    : false

type IsRawStringCompatible<TInput> = string extends TInput
  ? true
  : [Extract<TInput, string>] extends [never]
    ? false
    : true

type DoParamsSchemasAcceptStrings<
  TSchemas extends Readonly<Record<string, StandardSchemaV1>>,
> = false extends {
  [TName in keyof TSchemas]: IsRawStringCompatible<SchemaInput<TSchemas[TName]>>
}[keyof TSchemas]
  ? false
  : true

type MiddlewareShortCircuit<TMiddleware> =
  typeof httpMiddlewareShortCircuit extends keyof TMiddleware
    ? TMiddleware extends {
        readonly [httpMiddlewareShortCircuit]?: infer TResult
      }
      ? Exclude<TResult, undefined>
      : never
    : never

type RouteMiddlewareShortCircuits<TRoute extends HttpExecutionRouteDefinition> =
  TRoute extends {
    readonly middlewares: infer TMiddlewares extends
      readonly HttpRouteMiddleware[]
  }
    ? MiddlewareShortCircuit<TMiddlewares[number]>
    : never

type AreMiddlewareShortCircuitsCompatible<
  TRoute extends HttpExecutionRouteDefinition,
> = [RouteMiddlewareShortCircuits<TRoute>] extends [never]
  ? true
  : Exclude<
        RouteMiddlewareShortCircuits<TRoute>,
        DeclaredHttpResults<TRoute>
      > extends never
    ? true
    : false

type HttpRouteConstraint<TRoute extends HttpExecutionRouteDefinition> =
  (AreResponseStatusesCompatible<TRoute['responses']> extends true
    ? AreResponseHeadersSchemasCompatible<TRoute['responses']> extends true
      ? AreErrorMappingsCompatible<TRoute['responses']> extends true
        ? unknown
        : { readonly responses: never }
      : { readonly responses: never }
    : { readonly responses: never }) &
    (TRoute['request'] extends { readonly body: StandardSchemaV1 }
      ? TRoute['request'] extends {
          readonly headers: infer THeaders extends StandardSchemaV1
        }
        ? HasRequiredStringContentType<SchemaInput<THeaders>> extends true
          ? HasRequiredStringContentType<SchemaOutput<THeaders>> extends true
            ? unknown
            : { readonly request: never }
          : { readonly request: never }
        : { readonly request: never }
      : unknown) &
    (TRoute['request'] extends {
      readonly params: infer TParams extends Readonly<
        Record<string, StandardSchemaV1>
      >
    }
      ? IsExactParamsSchemaMap<TRoute['path'], TParams> extends true
        ? DoParamsSchemasAcceptStrings<TParams> extends true
          ? unknown
          : { readonly request: never }
        : { readonly request: never }
      : unknown) &
    (AreMiddlewareShortCircuitsCompatible<TRoute> extends true
      ? unknown
      : { readonly middlewares: never })

export type HttpContractConstraint<
  TRoutes extends Readonly<Record<string, HttpContractRouteDefinition>>,
> = {
  readonly [
    TName in keyof TRoutes
  ]: TRoutes[TName] extends HttpContractRawRouteDefinition
    ? unknown
    : HttpRouteConstraint<Extract<TRoutes[TName], HttpExecutionRouteDefinition>>
}
