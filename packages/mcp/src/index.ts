import { defineMcpImplementation, defineTool, toolError } from './extension.js'

export type {
  McpImplementation,
  McpImplementationOptions,
  McpToolDefinition,
  McpToolOptions,
  McpToolHandlers,
  McpRuntime,
} from './extension.js'
export type {
  McpOAuthOptions,
  McpOAuthRuntime,
  McpVerifiedAccessToken,
} from './http.js'

export const mcp = Object.freeze({
  tool: defineTool,
  implementation: defineMcpImplementation,
  toolError,
})

export type { McpPrincipal, McpContextInput } from './types.js'
