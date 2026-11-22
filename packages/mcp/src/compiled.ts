import {
  type ExecutionDefinition,
  type ExecutionHandlerResolver,
  type ExecutionExtensionRuntime,
  type ExecutionNodeId,
} from '@loutrejs/loutre'
import {
  type McpToolDefinition,
  type ProtocolRuntime,
  type Schema,
  type McpHttpRuntime,
} from './contract.js'
import { type McpOAuthOptions } from './oauth.js'
import { type McpToolDescriptor } from './types.js'

export interface EndpointDefinition extends ExecutionDefinition {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly tools: readonly McpToolDefinition[]
  readonly allowedHosts: readonly string[]
  readonly oauth?: McpOAuthOptions
  readonly factory: () => ProtocolRuntime
}

export interface CompiledTool {
  readonly descriptor: McpToolDescriptor
  readonly scopes: readonly string[]
  readonly input: Schema
  readonly output: Schema
}

export interface CompiledEndpoint {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly tools: readonly CompiledTool[]
  readonly allowedHosts: readonly string[]
  readonly oauth?: McpOAuthOptions
  readonly handler: ExecutionHandlerResolver<ProtocolRuntime>
}

export interface EndpointRuntime extends ExecutionExtensionRuntime {
  endpoint(id: ExecutionNodeId): McpHttpRuntime
}
