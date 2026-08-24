import type {
  ContractDefinition,
  ContextProvidedBeforeTerminal,
  HasValidationBeforeTerminal,
  PipelineItem,
  ProtocolDescriptor,
  ProtocolFactory,
  SchemaOutput,
  ShortCircuitDeclarationsOf,
  ShortCircuitResultOf,
  StandardSchemaV1,
  TerminalLayerDescriptor,
  ValidationLayerDescriptor,
} from '@loutrejs/core'
import type { Logger } from '@loutrejs/runtime'

export interface HttpRequestDefinition {
  readonly params?: StandardSchemaV1
  readonly query?: StandardSchemaV1
  readonly headers?: StandardSchemaV1
  readonly body?: StandardSchemaV1
}

export type HttpHeaderValue = string | readonly string[]
export type HttpHeaders = Readonly<
  Record<string, HttpHeaderValue | undefined>
>

export interface HttpErrorMatcher<TError extends { readonly data: unknown }> {
  is(error: unknown): error is TError
}

export interface HttpErrorMapping<
  TError extends { readonly data: unknown } = { readonly data: unknown },
  TResult = unknown,
> {
  readonly kind: 'http-error-mapping'
  readonly definition: HttpErrorMatcher<TError>
  readonly map: (error: TError) => TResult | Promise<TResult>
}

export interface HttpResponseDefinition {
  readonly status: number
  readonly body: StandardSchemaV1
  readonly headers?: StandardSchemaV1
  readonly staticHeaders?: HttpHeaders
  readonly error?: HttpErrorMapping<any, any>
  readonly stream?: 'server'
}

export interface HttpProtocolDefinition {
  readonly method: string
  readonly path: string
  readonly request?: HttpRequestDefinition
  readonly responses: Readonly<Record<string, HttpResponseDefinition>>
  readonly pipeline: readonly PipelineItem[]
  readonly interaction?: 'unary' | 'server-stream'
}

export interface HttpProtocol<
  TDefinition extends HttpProtocolDefinition = HttpProtocolDefinition,
> extends ProtocolDescriptor<
    'http',
    HttpControllerContextDefinition<TDefinition>,
    DeclaredHttpResults<TDefinition['responses']>
  > {
  readonly definition: TDefinition
  readonly interaction: TDefinition extends { readonly interaction: infer TInteraction }
    ? TInteraction & ('unary' | 'server-stream')
    : 'unary'
}

const controller: TerminalLayerDescriptor<'http'> = Object.freeze({
  kind: 'terminal',
  name: 'http.controller',
  role: 'terminal',
  protocol: 'http',
})

type IsHttpPipelineCompatible<
  TPipeline extends readonly PipelineItem[],
  TResponses extends HttpProtocolDefinition['responses'],
> = number extends TPipeline['length']
  ? false
  : TPipeline extends readonly [infer THead, ...infer TTail]
    ? IsLayerShortCircuitCompatible<
        ShortCircuitResultOf<THead>,
        TResponses
      > extends true
      ? IsShortCircuitDeclarationsCompatible<
          ShortCircuitDeclarationsOf<THead>,
          TResponses
        > extends true
        ? IsHttpPipelineCompatible<
            Extract<TTail, readonly PipelineItem[]>,
            TResponses
          >
        : false
      : false
    : true

type IsAny<T> = 0 extends 1 & T ? true : false

type IsUnknown<T> = unknown extends T
  ? [keyof T] extends [never]
    ? true
    : false
  : false

type ResponseBodyOutput<TResponse extends HttpResponseDefinition> =
  TResponse extends { readonly stream: 'server' }
    ? AsyncIterable<SchemaOutput<TResponse['body']>>
    : SchemaOutput<TResponse['body']>

type ResponseHeadersOutput<TResponse extends HttpResponseDefinition> =
  TResponse extends {
    readonly headers: infer THeaders extends StandardSchemaV1
  }
    ? SchemaOutput<THeaders>
    : never

type DeclaredHttpResults<
  TResponses extends HttpProtocolDefinition['responses'],
> = string extends keyof TResponses
  ? LogicalHttpResult
  : {
      [TVariant in keyof TResponses & string]: NonNullable<
        TResponses[TVariant]
      > extends infer TResponse extends HttpResponseDefinition
        ? LogicalHttpResult<
            TVariant,
            ResponseBodyOutput<TResponse>,
            ResponseHeadersOutput<TResponse>
          >
        : never
    }[keyof TResponses & string]

type IsResultHeadersCompatible<
  TResult,
  TResponses extends HttpProtocolDefinition['responses'],
> = string extends keyof TResponses
  ? true
  : TResult extends {
        readonly variant: infer TVariant extends keyof TResponses
      }
    ? TResult extends { readonly headers: infer TResultHeaders }
      ? NonNullable<TResponses[TVariant]> extends infer TResponse extends HttpResponseDefinition
        ? [ResponseHeadersOutput<TResponse>] extends [never]
          ? false
          : Exclude<
                keyof TResultHeaders,
                keyof NonNullable<ResponseHeadersOutput<TResponse>>
              > extends never
            ? true
            : false
        : false
      : true
    : false

type AreResultHeadersCompatible<
  TResult,
  TResponses extends HttpProtocolDefinition['responses'],
> = false extends (TResult extends unknown
  ? IsResultHeadersCompatible<TResult, TResponses>
  : never)
  ? false
  : true

type IsLayerShortCircuitCompatible<
  TResult,
  TResponses extends HttpProtocolDefinition['responses'],
> = IsAny<TResult> extends true
  ? true
  : IsUnknown<TResult> extends true
    ? true
    : [TResult] extends [never]
      ? true
      : [TResult] extends [DeclaredHttpResults<TResponses>]
        ? AreResultHeadersCompatible<TResult, TResponses>
        : false

type IsShortCircuitDeclarationsCompatible<
  TDeclarations,
  TResponses extends HttpProtocolDefinition['responses'],
> = IsAny<TDeclarations> extends true
  ? true
  : IsUnknown<TDeclarations> extends true
    ? true
    : TDeclarations extends readonly unknown[]
      ? number extends TDeclarations['length']
        ? true
        : TDeclarations extends readonly [infer THead, ...infer TTail]
          ? IsHttpShortCircuitDeclarationCompatible<
              THead,
              TResponses
            > extends true
            ? IsShortCircuitDeclarationsCompatible<TTail, TResponses>
            : false
          : true
      : true

type IsHttpShortCircuitDeclarationCompatible<
  TDeclaration,
  TResponses extends HttpProtocolDefinition['responses'],
> = TDeclaration extends {
  readonly protocol: 'http'
  readonly variant: infer TVariant extends string
}
  ? string extends TVariant
    ? true
    : TVariant extends keyof TResponses
      ? NonNullable<TResponses[TVariant]> extends HttpResponseDefinition
        ? TDeclaration extends {
            readonly response: { readonly status: infer TStatus extends number }
          }
          ? NonNullable<TResponses[TVariant]>['status'] extends TStatus
            ? true
            : number extends NonNullable<TResponses[TVariant]>['status']
              ? true
              : false
          : true
        : false
      : false
  : true

type HttpPipelineConstraint<TDefinition extends HttpProtocolDefinition> =
  IsHttpPipelineCompatible<
    TDefinition['pipeline'],
    TDefinition['responses']
  > extends true
    ? unknown
    : { readonly pipeline: never }

type IsResponseHeadersSchemaCompatible<TResponse> =
  TResponse extends HttpResponseDefinition
    ? TResponse extends {
        readonly headers: infer THeaders extends StandardSchemaV1
      }
      ? SchemaOutput<THeaders> extends HttpHeaders | undefined
        ? true
        : false
      : true
    : false

type AreResponseHeadersSchemasCompatible<
  TResponses extends HttpProtocolDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsResponseHeadersSchemaCompatible<
    TResponses[TVariant]
  >
}[keyof TResponses]
  ? false
  : true

type HttpResponseConstraint<TDefinition extends HttpProtocolDefinition> =
  string extends keyof TDefinition['responses']
    ? { readonly responses: never }
    : AreResponseHeadersSchemasCompatible<TDefinition['responses']> extends true
      ? AreErrorMappingsCompatible<TDefinition['responses']> extends true
        ? unknown
        : { readonly responses: never }
      : { readonly responses: never }

type ErrorMappingResult<TResponse> = TResponse extends {
  readonly error: infer TMapping extends HttpErrorMapping<any, any>
}
  ? Awaited<ReturnType<TMapping['map']>>
  : never

type IsErrorMappingCompatible<TResponse> =
  TResponse extends HttpResponseDefinition
    ? TResponse extends { readonly error: HttpErrorMapping<any, any> }
      ? ErrorMappingResult<TResponse> extends HttpResponseResult<
          ResponseBodyOutput<TResponse>,
          ResponseHeadersOutput<TResponse>
        >
        ? true
        : false
      : true
    : false

type AreErrorMappingsCompatible<
  TResponses extends HttpProtocolDefinition['responses'],
> = false extends {
  [TVariant in keyof TResponses]: IsErrorMappingCompatible<
    TResponses[TVariant]
  >
}[keyof TResponses]
  ? false
  : true

function defineHttp<const TDefinition extends HttpProtocolDefinition>(
  definition: TDefinition &
    HttpPipelineConstraint<TDefinition> &
    HttpResponseConstraint<TDefinition>,
): HttpProtocol<TDefinition> {
  return {
    kind: 'protocol',
    protocol: 'http',
    interaction: definition.interaction ?? 'unary',
    definition,
  } as unknown as HttpProtocol<TDefinition>
}

export const http = Object.assign(defineHttp, {
  protocol: 'http' as const,
  controller,
  error: httpError,
}) satisfies ProtocolFactory<'http'> & {
  readonly controller: TerminalLayerDescriptor<'http'>
  readonly error: typeof httpError
}

function validationLayer<const TPart extends ValidationLayerDescriptor['part']>(
  part: TPart,
): ValidationLayerDescriptor & {
  readonly part: TPart
  readonly name: `validate.${TPart}`
} {
  return Object.freeze({
    kind: 'validation',
    name: `validate.${part}`,
    role: 'validation',
    part,
  }) as ValidationLayerDescriptor & {
    readonly part: TPart
    readonly name: `validate.${TPart}`
  }
}

export const validate = Object.freeze({
  params: validationLayer('params'),
  query: validationLayer('query'),
  headers: validationLayer('headers'),
  body: validationLayer('body'),
})

type ProceduresForHttp<TContract extends ContractDefinition> = {
  [K in keyof TContract['procedures']]:
    'http' extends keyof TContract['procedures'][K]['protocols'] ? K : never
}[keyof TContract['procedures']] & string

type HttpProtocolAt<
  TContract extends ContractDefinition,
  TProcedure extends keyof TContract['procedures'],
> = TContract['procedures'][TProcedure]['protocols']['http' & keyof TContract['procedures'][TProcedure]['protocols']] extends infer TProtocol
  ? TProtocol extends { readonly definition: infer TDefinition }
    ? TDefinition extends HttpProtocolDefinition
      ? HttpProtocol<TDefinition>
      : never
    : never
  : never

type PartOutput<
  TDefinition extends HttpProtocolDefinition,
  TPart extends keyof HttpRequestDefinition,
> = HasValidationBeforeTerminal<TDefinition['pipeline'], TPart> extends false
  ? unknown
  : TDefinition['request'] extends HttpRequestDefinition
  ? TPart extends keyof TDefinition['request']
    ? NonNullable<TDefinition['request'][TPart]> extends StandardSchemaV1
      ? SchemaOutput<NonNullable<TDefinition['request'][TPart]>>
      : unknown
    : unknown
  : unknown

type HttpResultHeaders<THeaders> = IsAny<THeaders> extends true
  ? { readonly headers?: HttpHeaders }
  : IsUnknown<THeaders> extends true
    ? { readonly headers?: HttpHeaders }
    : [THeaders] extends [never]
      ? { readonly headers?: never }
      : undefined extends THeaders
        ? { readonly headers?: Exclude<THeaders, undefined> }
        : { readonly headers: THeaders }

export type HttpResponseResult<TBody, THeaders = unknown> = {
  readonly body: TBody
} & HttpResultHeaders<THeaders>

type ErrorOf<TDefinition> = TDefinition extends HttpErrorMatcher<infer TError>
  ? TError
  : never

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

export type LogicalHttpResult<
  TVariant extends string = string,
  TBody = unknown,
  THeaders = unknown,
> = {
  readonly kind: 'http-result'
  readonly variant: TVariant
  readonly body: TBody
} & HttpResultHeaders<THeaders>

type ResponseHelpers<TDefinition extends HttpProtocolDefinition> = {
  [TVariant in keyof TDefinition['responses'] & string]: (
    result: HttpResponseResult<
      ResponseBodyOutput<TDefinition['responses'][TVariant]>,
      ResponseHeadersOutput<TDefinition['responses'][TVariant]>
    >,
  ) => LogicalHttpResult<
    TVariant,
    ResponseBodyOutput<TDefinition['responses'][TVariant]>,
    ResponseHeadersOutput<TDefinition['responses'][TVariant]>
  >
}

type HttpControllerContextDefinition<
  TDefinition extends HttpProtocolDefinition,
> = {
  readonly params: PartOutput<TDefinition, 'params'>
  readonly query: PartOutput<TDefinition, 'query'>
  readonly headers: PartOutput<TDefinition, 'headers'>
  readonly body: PartOutput<TDefinition, 'body'>
  readonly response: ResponseHelpers<TDefinition>
  readonly logger: Logger
} & ContextProvidedBeforeTerminal<TDefinition['pipeline']>

export type HttpControllerContext<TProtocol extends HttpProtocol<any>> =
  HttpControllerContextDefinition<TProtocol['definition']>

export type ControllerOf<
  TContract extends ContractDefinition,
  TProtocol extends 'http',
  TProcedures extends ProceduresForHttp<TContract> = ProceduresForHttp<TContract>,
> = TProtocol extends 'http'
  ? {
      [K in TProcedures]: (
        context: HttpControllerContext<HttpProtocolAt<TContract, K>>,
      ) =>
        | DeclaredHttpResults<
            HttpProtocolAt<TContract, K>['definition']['responses']
          >
        | Promise<
            DeclaredHttpResults<
              HttpProtocolAt<TContract, K>['definition']['responses']
            >
          >
    }
  : never

export type ContextOf<
  TController,
  TProcedure extends keyof TController,
> = TController[TProcedure] extends (context: infer TContext, ...args: any[]) => any
  ? TContext
  : never
