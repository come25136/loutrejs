import type { JsonObject, JsonValue } from './json.js'

export interface McpPrincipal {
  readonly subject: string
  readonly issuer: string
  readonly scopes: readonly string[]
}

export interface McpContextInput<TState extends object = object> {
  readonly request: Request
  readonly state: Readonly<TState>
  readonly principal: McpPrincipal
  readonly signal: AbortSignal
}

export interface McpToolDescriptor {
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonObject & { readonly type: 'object' }
  readonly outputSchema: JsonObject
}

export type McpToolResult =
  | { readonly kind: 'success'; readonly value: JsonValue }
  | { readonly kind: 'error'; readonly message: string }

export interface McpToolRuntime {
  readonly descriptor: McpToolDescriptor
  readonly scopes: readonly string[]
  invoke(
    input: unknown,
    context: McpContextInput<object>,
  ): Promise<McpToolResult>
}
