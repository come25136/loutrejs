import {
  type StandardSchemaV1,
  type StandardJSONSchemaV1,
  type SchemaOutput,
  type SchemaInput,
  type LayerState,
} from '@loutrejs/loutre'
import { type McpOAuthRuntime, type McpOAuthOptions } from './oauth.js'
import { type McpToolContext, type McpPrincipal } from './types.js'
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
  TPrincipal extends McpPrincipal | undefined = McpPrincipal,
> = {
  readonly [K in keyof TContract['tools']]: (
    context: McpToolContext<
      SchemaOutput<TContract['tools'][K]['input']>,
      TState,
      TPrincipal
    >,
  ) =>
    | SchemaInput<TContract['tools'][K]['output']>
    | Promise<SchemaInput<TContract['tools'][K]['output']>>
}

export type McpRuntime<
  TContract extends McpContract = McpContract,
  TState extends object = object,
  TPrincipal extends McpPrincipal | undefined = McpPrincipal,
> = ([TPrincipal] extends [undefined]
  ? { readonly oauth?: undefined }
  : { readonly oauth: McpOAuthRuntime }) & {
  readonly context?: never
  readonly tools: McpToolHandlers<TContract, TState, TPrincipal>
}

export interface ProtocolRuntime {
  readonly oauth?: McpOAuthRuntime | undefined
  readonly tools: Readonly<Record<string, unknown>>
}

type RouteState<TRoute> = TRoute extends {
  readonly middlewares: infer TLayers extends NonNullable<
    HttpContractRawRoute['middlewares']
  >
}
  ? LayerState<TLayers>
  : {}

export type McpEndpointOptions<
  TRoute extends HttpContractRawRoute,
  TContract extends McpContract,
  TOAuth extends McpOAuthOptions | undefined,
  THandlers = unknown,
> = {
  readonly name: string
  readonly version: string
  readonly route: TRoute
  readonly contract: TContract
  readonly tools?: never
  readonly oauth?: TOAuth
  readonly allowedHosts?: TOAuth extends undefined ? readonly string[] : never
  readonly factory: () => McpRuntime<
    NoInfer<TContract>,
    RouteState<TRoute>,
    TOAuth extends undefined ? undefined : McpPrincipal
  > & { readonly tools: THandlers }
} & ([TOAuth] extends [undefined]
  ? { readonly oauth?: undefined }
  : { readonly oauth: McpOAuthOptions })

export type McpImplementationOptions<
  TRoute extends HttpContractRawRoute = HttpContractRawRoute,
  TContract extends McpContract = McpContract,
> =
  | McpEndpointOptions<TRoute, TContract, McpOAuthOptions>
  | McpEndpointOptions<TRoute, TContract, undefined>

import { type HttpRawExecutionContext } from '@loutrejs/loutre/http'

export interface McpHttpRuntime {
  request(context: HttpRawExecutionContext): Promise<Response>
  metadata(context: HttpRawExecutionContext): Response
}
