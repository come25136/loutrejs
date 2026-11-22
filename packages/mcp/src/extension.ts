import {
  defineExecutionExtension,
  dependencyConsumerId,
} from '@loutrejs/loutre'
import { oauthScopePattern } from './oauth.js'
import { compileTool, validateRuntime } from './compiler.js'
import { createEndpointRuntime } from './runtime/endpoint.js'
import {
  type EndpointDefinition,
  type CompiledEndpoint,
  type EndpointRuntime,
} from './compiled.js'

export const extension = defineExecutionExtension<
  EndpointDefinition,
  CompiledEndpoint,
  never,
  {},
  EndpointRuntime
>({
  kind: 'execution-extension',
  name: 'loutre:mcp',
  abiVersion: '6',
  compile(definition, context) {
    if (!definition.name.trim() || !definition.version.trim())
      throw new TypeError('MCP endpointのnameとversionを指定してください。')
    if (
      definition.oauth !== false &&
      !(definition.oauth.requiredScopes ?? []).every((scope) =>
        oauthScopePattern.test(scope),
      )
    )
      throw new TypeError('MCP OAuthのrequiredScopesが不正です。')
    const tools = definition.tools
      .map(compileTool)
      .toSorted((left, right) =>
        left.descriptor.name < right.descriptor.name ? -1 : 1,
      )
    if (
      definition.oauth === false &&
      tools.some((tool) => tool.scopes.length > 0)
    )
      throw new TypeError(
        'OAuthなしのMCP endpointにはscope付きToolを登録できません。',
      )
    const names = tools.map((tool) => tool.descriptor.name)
    if (new Set(names).size !== names.length)
      throw new TypeError('MCP endpoint内のTool名が重複しています。')
    const id = `${definition.name}.mcp`
    const handler = context.compileHandler(
      {
        kind: 'factory',
        factory: () =>
          validateRuntime(
            definition.factory(),
            tools,
            definition.oauth !== false,
          ),
      },
      {
        kind: 'execution',
        id: dependencyConsumerId(id),
        name: definition.name,
      },
    )
    return {
      kind: 'execution',
      id,
      executionKind: 'mcp.endpoint',
      capabilities: [],
      compiled: Object.freeze({
        name: definition.name,
        version: definition.version,
        path: definition.path,
        tools: Object.freeze(tools),
        oauth: definition.oauth,
        allowedHosts: definition.allowedHosts,
        handler,
      }),
    }
  },
  projectGraph({ execution: { compiled } }) {
    return {
      name: compiled.name,
      version: compiled.version,
      path: compiled.path,
      tools: compiled.tools.map((tool) => ({
        ...tool.descriptor,
        scopes: tool.scopes,
      })),
    }
  },
  createRuntime: createEndpointRuntime,
})
