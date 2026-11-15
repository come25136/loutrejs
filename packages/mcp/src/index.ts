import { defineMcpImplementation } from './declaration.js'
import { defineTool, toolError } from './tool.js'

export type { McpImplementation } from './declaration.js'
export type {
  McpImplementationOptions,
  McpToolDefinition,
  McpToolOptions,
  McpToolHandlers,
  McpRuntime,
} from './contract.js'
export type {
  McpOAuthOptions,
  McpOAuthRuntime,
  McpVerifiedAccessToken,
} from './oauth.js'

export const mcp = Object.freeze({
  tool: defineTool,
  implementation: defineMcpImplementation,
  toolError,
})

export type { McpPrincipal, McpContextInput } from './types.js'
