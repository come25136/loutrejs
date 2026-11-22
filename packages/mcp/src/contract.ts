import {
  type StandardSchemaV1,
  type StandardJSONSchemaV1,
  type SchemaOutput,
  type SchemaInput,
  type LayerState,
} from '@loutrejs/loutre'
import { type McpOAuthRuntime, type McpOAuthOptions } from './oauth.js'
import { type McpToolContext } from './types.js'
import { type HttpContractRawRoute } from '@loutrejs/loutre/http'

export type Schema = StandardSchemaV1 & StandardJSONSchemaV1

export interface McpToolOptions {
  readonly description: string
  readonly scopes: readonly string[]
  readonly input: Schema
  readonly output: Schema
}

export interface McpToolDefinition extends McpToolOptions {
  readonly name: string
}

export type McpTools = Readonly<Record<string, McpToolOptions>>

export const mcpContractBrand: unique symbol = Symbol.for('loutre.mcp-contract')

export interface McpContract<TTools extends McpTools = McpTools> {
  readonly kind: 'mcp-contract'
  readonly [mcpContractBrand]: true
  readonly tools: TTools
}

export type McpToolHandlers<
  TContract extends McpContract,
  TState extends object = object,
> = {
  readonly [K in keyof TContract['tools']]: (
    context: McpToolContext<
      SchemaOutput<TContract['tools'][K]['input']>,
      TState
    >,
  ) =>
    | SchemaInput<TContract['tools'][K]['output']>
    | Promise<SchemaInput<TContract['tools'][K]['output']>>
}

export interface McpRuntime<
  TContract extends McpContract = McpContract,
  TState extends object = object,
> {
  readonly oauth: McpOAuthRuntime
  readonly context?: never
  readonly tools: McpToolHandlers<TContract, TState>
}

export interface ProtocolRuntime {
  readonly oauth: McpOAuthRuntime
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
  TContract extends McpContract = McpContract,
> {
  readonly name: string
  readonly version: string
  readonly route: TRoute
  readonly contract: TContract
  readonly tools?: never
  readonly oauth?: McpOAuthOptions
  readonly factory: () => McpRuntime<NoInfer<TContract>, RouteState<TRoute>>
}
import { type HttpRawExecutionContext } from '@loutrejs/loutre/http'

export interface McpHttpRuntime {
  request(context: HttpRawExecutionContext): Promise<Response>
  metadata(context: HttpRawExecutionContext): Response
}
