import { defineMcpContract, defineMcpImplementation } from './declaration.js'
import { toolError } from './tool.js'

export type { McpImplementation } from './declaration.js'
export type {
  McpImplementationOptions,
  McpContract,
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
  contract: defineMcpContract,
  implementation: defineMcpImplementation,
  toolError,
})

export type { McpPrincipal, McpContextInput } from './types.js'
