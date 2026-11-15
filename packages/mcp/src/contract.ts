import {
  type StandardSchemaV1,
  type StandardJSONSchemaV1,
  type SchemaOutput,
  type SchemaInput,
  type LayerState,
} from '@loutrejs/loutre'
import { type McpOAuthRuntime, type McpOAuthOptions } from './oauth.js'
import { type McpContextInput } from './types.js'
import { type HttpContractRawRoute } from '@loutrejs/loutre/http'

export type Schema = StandardSchemaV1 & StandardJSONSchemaV1

export interface McpToolOptions<
  TName extends string,
  TInput extends Schema,
  TOutput extends Schema,
> {
  readonly name: TName
  readonly description: string
  readonly scopes: readonly string[]
  readonly input: TInput
  readonly output: TOutput
}

export interface McpToolDefinition<
  TName extends string = string,
  TInput extends Schema = Schema,
  TOutput extends Schema = Schema,
> extends McpToolOptions<TName, TInput, TOutput> {}

export type McpToolHandlers<
  TTools extends readonly McpToolDefinition[],
  TContext extends object,
> = {
  readonly [TName in TTools[number]['name']]: (
    input: SchemaOutput<
      Extract<TTools[number], { readonly name: TName }>['input']
    >,
    context: TContext,
  ) =>
    | SchemaInput<Extract<TTools[number], { readonly name: TName }>['output']>
    | Promise<
        SchemaInput<Extract<TTools[number], { readonly name: TName }>['output']>
      >
}

export interface McpRuntime<
  TTools extends readonly McpToolDefinition[] = readonly McpToolDefinition[],
  TContext extends object = object,
  TState extends object = object,
> {
  readonly oauth: McpOAuthRuntime
  context(input: McpContextInput<TState>): TContext | Promise<TContext>
  readonly tools: McpToolHandlers<TTools, NoInfer<TContext>>
}

export interface ProtocolRuntime {
  readonly oauth: McpOAuthRuntime
  context(input: McpContextInput<object>): object | Promise<object>
  readonly tools: Readonly<Record<string, unknown>>
}

type RouteState<TRoute> = TRoute extends {
  readonly middlewares: infer TLayers extends NonNullable<
    HttpContractRawRoute['middlewares']
  >
}
  ? LayerState<TLayers>
  : {}

export interface McpImplementationOptions<
  TRoute extends HttpContractRawRoute = HttpContractRawRoute,
  TTools extends readonly McpToolDefinition[] = readonly McpToolDefinition[],
  TContext extends object = object,
> {
  readonly name: string
  readonly version: string
  readonly route: TRoute
  readonly tools: TTools
  readonly oauth?: McpOAuthOptions
  readonly factory: () => McpRuntime<
    NoInfer<TTools>,
    TContext,
    RouteState<TRoute>
  >
}
import { type HttpRawExecutionContext } from '@loutrejs/loutre/http'

export interface McpHttpRuntime {
  request(context: HttpRawExecutionContext): Promise<Response>
  metadata(context: HttpRawExecutionContext): Response
}
