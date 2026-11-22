import { type CompiledTool } from './compiled.js'
import {
  type McpPrincipal,
  type McpToolContext,
  type McpToolResult,
} from './types.js'
import { validateSchema, SchemaValidationError } from '@loutrejs/loutre'
import { snapshotJson } from './json.js'
class PublicToolError extends Error {}

export function toolError(message: string): Error {
  return new PublicToolError(message)
}

type Invocation = McpToolContext<unknown, object, McpPrincipal | undefined>

export async function executeTool(
  tool: CompiledTool,
  context: Invocation,
  handler: (context: Invocation) => unknown,
): Promise<McpToolResult> {
  context.signal.throwIfAborted()
  let parsed
  try {
    parsed = await validateSchema(tool.input, context.input)
  } catch (error) {
    if (error instanceof SchemaValidationError)
      return {
        kind: 'error',
        message: 'Toolの入力がスキーマに適合していません。',
      }
    throw error
  }
  context.signal.throwIfAborted()
  let result: unknown
  try {
    result = await handler({ ...context, input: parsed })
  } catch (error) {
    if (error instanceof PublicToolError)
      return { kind: 'error', message: error.message }
    throw error
  }
  context.signal.throwIfAborted()
  const value = snapshotJson(await validateSchema(tool.output, result))
  context.signal.throwIfAborted()
  return { kind: 'success', value }
}
