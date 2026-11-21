import {
  type McpToolDefinition,
  type ProtocolRuntime,
  type Schema,
} from './contract.js'
import { oauthScopePattern } from './oauth.js'
import { type CompiledTool } from './compiled.js'
import { snapshotJson, isJsonObject, type JsonObject } from './json.js'
import {
  assertDeclaredExecutionMethods,
  resolveExecutionMethod,
  type ExecutionMethod,
} from '@loutrejs/loutre'

export function compileTool(tool: McpToolDefinition): CompiledTool {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name) || !tool.description.trim()) {
    throw new TypeError(
      `MCP Toolのnameまたはdescriptionが不正です。 ${tool.name}`,
    )
  }
  if (!tool.scopes.every((scope) => oauthScopePattern.test(scope))) {
    throw new TypeError(`MCP Toolのscopeが不正です。 ${tool.name}`)
  }
  const inputSchema = schemaDocument(tool.input, 'input')
  if (inputSchema.type !== 'object')
    throw new TypeError(
      `MCP Toolの入力はオブジェクトである必要があります。 ${tool.name}`,
    )
  return {
    descriptor: Object.freeze({
      name: tool.name,
      description: tool.description,
      inputSchema: Object.freeze({ ...inputSchema, type: 'object' }),
      outputSchema: schemaDocument(tool.output, 'output'),
    }),
    scopes: Object.freeze([...new Set(tool.scopes)].toSorted()),
    input: tool.input,
    output: tool.output,
  }
}

export function validateRuntime(
  runtime: ProtocolRuntime,
  tools: readonly CompiledTool[],
): ProtocolRuntime {
  if (
    !runtime ||
    typeof runtime.context !== 'function' ||
    !runtime.tools ||
    typeof runtime.tools !== 'object' ||
    !runtime.oauth
  ) {
    throw new TypeError(
      'MCPのfactoryにはoauth、context、toolsを指定してください。',
    )
  }
  assertDeclaredExecutionMethods(
    runtime.tools,
    tools.map((tool) => tool.descriptor.name),
  )
  const handlers = new Map<string, ExecutionMethod>()
  for (const {
    descriptor: { name },
  } of tools) {
    const handler = resolveExecutionMethod(runtime.tools, name)
    if (!handler) {
      throw new TypeError(`MCP Toolのhandlerがありません。 ${name}`)
    }
    handlers.set(name, handler)
  }
  return {
    oauth: runtime.oauth,
    context: runtime.context.bind(runtime),
    tools: Object.fromEntries(handlers),
  }
}

function schemaDocument(
  schema: Schema,
  direction: 'input' | 'output',
): JsonObject {
  const document = snapshotJson(
    schema['~standard'].jsonSchema[direction]({ target: 'draft-2020-12' }),
  )
  if (!isJsonObject(document))
    throw new TypeError(
      'MCP ToolのJSON Schemaはオブジェクトである必要があります。',
    )
  return document
}
