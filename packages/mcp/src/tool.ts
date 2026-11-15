import { type CompiledTool } from './compiled.js'
import { type McpContextInput, type McpToolResult } from './types.js'
import { validateSchema, SchemaValidationError } from '@loutrejs/loutre'
import { snapshotJson } from './json.js'
import {
  type McpToolOptions,
  type Schema,
  type McpToolDefinition,
} from './contract.js'

class PublicToolError extends Error {}

export function toolError(message: string): Error {
  return new PublicToolError(message)
}

export async function executeTool(
  tool: CompiledTool,
  input: unknown,
  context: McpContextInput<object>,
  createContext: (input: McpContextInput<object>) => object | Promise<object>,
  handler: (input: unknown, context: object) => unknown,
): Promise<McpToolResult> {
  context.signal.throwIfAborted()
  let parsed
  try {
    parsed = await validateSchema(tool.input, input)
  } catch (error) {
    if (error instanceof SchemaValidationError)
      return {
        kind: 'error',
        message: 'Toolの入力がスキーマに適合していません。',
      }
    throw error
  }
  context.signal.throwIfAborted()
  const state = await createContext(context)
  context.signal.throwIfAborted()
  let result: unknown
  try {
    result = await handler(parsed, state)
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

export function defineTool<
  const TName extends string,
  TInput extends Schema,
  TOutput extends Schema,
>(
  options: McpToolOptions<TName, TInput, TOutput>,
): McpToolDefinition<TName, TInput, TOutput> {
  return Object.freeze({
    name: options.name,
    description: options.description,
    scopes: Object.freeze([...options.scopes]),
    input: options.input,
    output: options.output,
  })
}
