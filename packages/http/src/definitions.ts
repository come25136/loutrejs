import type {
  ContractDefinition,
  ContextProvidedBeforeTerminal,
  HasValidationBeforeTerminal,
  PipelineItem,
  ProtocolDescriptor,
  ProtocolFactory,
  SchemaOutput,
  StandardSchemaV1,
  TerminalLayerDescriptor,
  ValidationLayerDescriptor,
} from '@loutrefw/core'
import type { Logger } from '@loutrefw/runtime'

export interface HttpInputDefinition {
  readonly params?: StandardSchemaV1
  readonly query?: StandardSchemaV1
  readonly headers?: StandardSchemaV1
  readonly body?: StandardSchemaV1
}

export type HttpHeaderValue = string | readonly string[]
export type HttpHeaders = Readonly<Record<string, HttpHeaderValue>>

export interface HttpResponseDefinition {
  readonly status: number
  readonly body: StandardSchemaV1
  readonly headers?: HttpHeaders
  readonly error?: unknown
  readonly stream?: 'server'
}

export interface HttpProtocolDefinition {
  readonly method: string
  readonly path: string
  readonly input?: HttpInputDefinition
  readonly responses: Readonly<Record<string, HttpResponseDefinition>>
  readonly pipeline: readonly PipelineItem[]
  readonly interaction?: 'unary' | 'server-stream'
}

export interface HttpProtocol<
  TDefinition extends HttpProtocolDefinition = HttpProtocolDefinition,
> extends ProtocolDescriptor<
    'http',
    HttpControllerContextDefinition<TDefinition>,
    LogicalHttpResult
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

function defineHttp<const TDefinition extends HttpProtocolDefinition>(
  definition: TDefinition,
): HttpProtocol<TDefinition> {
  return {
    kind: 'protocol',
    protocol: 'http',
    interaction: definition.interaction ?? 'unary',
    definition,
  } as HttpProtocol<TDefinition>
}

export const http = Object.assign(defineHttp, {
  protocol: 'http' as const,
  controller,
}) satisfies ProtocolFactory<'http'> & {
  <const TDefinition extends HttpProtocolDefinition>(
    definition: TDefinition,
  ): HttpProtocol<TDefinition>
  readonly controller: TerminalLayerDescriptor<'http'>
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
  TPart extends keyof HttpInputDefinition,
> = HasValidationBeforeTerminal<TDefinition['pipeline'], TPart> extends false
  ? unknown
  : TDefinition['input'] extends HttpInputDefinition
  ? TPart extends keyof TDefinition['input']
    ? NonNullable<TDefinition['input'][TPart]> extends StandardSchemaV1
      ? SchemaOutput<NonNullable<TDefinition['input'][TPart]>>
      : unknown
    : unknown
  : unknown

export interface HttpResponseResult<TBody> {
  readonly body: TBody
  readonly headers?: HttpHeaders
}

export interface LogicalHttpResult<TVariant extends string = string, TBody = unknown> {
  readonly kind: 'http-result'
  readonly variant: TVariant
  readonly body: TBody
  readonly headers?: HttpHeaders
}

type ResponseHelpers<TDefinition extends HttpProtocolDefinition> = {
  [TVariant in keyof TDefinition['responses'] & string]: (
    result: HttpResponseResult<TDefinition['responses'][TVariant] extends {
      readonly stream: 'server'
    }
      ? AsyncIterable<
          SchemaOutput<TDefinition['responses'][TVariant]['body']>
        >
      : SchemaOutput<TDefinition['responses'][TVariant]['body']>
    >,
  ) => LogicalHttpResult<
    TVariant,
    TDefinition['responses'][TVariant] extends {
      readonly stream: 'server'
    }
      ? AsyncIterable<
          SchemaOutput<TDefinition['responses'][TVariant]['body']>
        >
      : SchemaOutput<TDefinition['responses'][TVariant]['body']>
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
      ) => LogicalHttpResult | Promise<LogicalHttpResult>
    }
  : never

export type ContextOf<
  TController,
  TProcedure extends keyof TController,
> = TController[TProcedure] extends (context: infer TContext, ...args: any[]) => any
  ? TContext
  : never
