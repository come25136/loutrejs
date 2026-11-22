import {
  type ExecutionExtensionRuntimeContext,
  type ExecutionNodeId,
} from '@loutrejs/loutre'
import { type CompiledEndpoint, type EndpointRuntime } from '../compiled.js'
import { type McpHttpRuntime } from '../contract.js'
import { type McpToolRuntime } from '../types.js'
import { executeTool } from '../tool.js'
import { createMcpHttpRuntime } from './http.js'

export function createEndpointRuntime({
  executions,
}: ExecutionExtensionRuntimeContext<CompiledEndpoint>): EndpointRuntime {
  const endpoints = new Map<
    ExecutionNodeId,
    { readonly shutdown: AbortController; readonly http: McpHttpRuntime }
  >()
  for (const binding of executions) {
    const { execution } = binding
    const { compiled } = execution
    const runtime = compiled.handler.createResolver(binding)()
    const tools = new Map<string, McpToolRuntime>()
    for (const tool of compiled.tools) {
      const handler = runtime.tools[tool.descriptor.name]
      if (typeof handler !== 'function')
        throw new TypeError(
          `MCP Toolのhandlerがありません。 ${tool.descriptor.name}`,
        )
      tools.set(tool.descriptor.name, {
        descriptor: tool.descriptor,
        scopes: tool.scopes,
        invoke: (input, context) =>
          executeTool(tool, input, context, (value, toolContext) =>
            handler(value, toolContext),
          ),
      })
    }
    const shutdown = new AbortController()
    endpoints.set(execution.id, {
      shutdown,
      http: createMcpHttpRuntime(
        { name: compiled.name, version: compiled.version },
        tools,
        compiled.path,
        compiled.oauth,
        runtime.oauth,
        shutdown.signal,
      ),
    })
  }
  return {
    endpoint(id) {
      const endpoint = endpoints.get(id)
      if (!endpoint) throw new Error(`MCP endpointを解決できません。 ${id}`)
      return endpoint.http
    },
    drain() {
      for (const endpoint of endpoints.values())
        endpoint.shutdown.abort(new Error('MCP endpointを終了しています。'))
    },
    close() {
      endpoints.clear()
    },
  }
}
