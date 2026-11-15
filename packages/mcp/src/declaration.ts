import { type EndpointDefinition } from './compiled.js'
import {
  type ExecutionDefinition,
  type ExecutionGroup,
  defineExecution,
  inheritSourceLocation,
  delegateExecution,
} from '@loutrejs/loutre'
import { extension } from './extension.js'
import {
  type HttpRawExecutionDefinition,
  type HttpContractRawRoute,
  isHttpRawContractRoute,
  parseHttpPath,
  http,
} from '@loutrejs/loutre/http'
import {
  type McpImplementationOptions,
  type McpToolDefinition,
  type ProtocolRuntime,
} from './contract.js'
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server'

type McpEndpointDefinition = EndpointDefinition &
  ExecutionDefinition<typeof extension>

export interface McpImplementation extends ExecutionGroup<
  readonly [
    McpEndpointDefinition,
    HttpRawExecutionDefinition,
    HttpRawExecutionDefinition,
  ]
> {}

export function defineMcpImplementation<
  const TRoute extends HttpContractRawRoute,
  const TTools extends readonly McpToolDefinition[],
  TContext extends object,
>(
  options: McpImplementationOptions<TRoute, TTools, TContext>,
): McpImplementation

export function defineMcpImplementation(
  options: Omit<McpImplementationOptions, 'factory'> & {
    readonly factory: () => ProtocolRuntime
  },
): ExecutionGroup {
  const { route, name, version, tools, factory } = options
  if (typeof factory !== 'function')
    throw new TypeError('MCP endpointにはfactoryを指定してください。')
  if (!isHttpRawContractRoute(route) || route.method !== '*')
    throw new TypeError(
      'MCPにはHTTP Contractのワイルドカードrawルートを指定してください。',
    )
  const routeUrl = new URL(route.path, 'https://localhost')
  if (
    routeUrl.origin !== 'https://localhost' ||
    routeUrl.pathname !== route.path ||
    parseHttpPath(route.path).some((segment) => segment.kind === 'param')
  )
    throw new TypeError('MCPには正規化済みの静的なHTTPパスを指定してください。')
  const metadataPath = new URL(getOAuthProtectedResourceMetadataUrl(routeUrl))
    .pathname
  const endpoint = defineExecution(extension, {
    name,
    version,
    path: route.path,
    tools: Object.freeze([...tools]),
    oauth: Object.freeze({
      requiredScopes: Object.freeze([...(options.oauth?.requiredScopes ?? [])]),
      allowedOrigins: Object.freeze([...(options.oauth?.allowedOrigins ?? [])]),
    }),
    factory,
  })
  return Object.freeze({
    kind: 'execution-group',
    name,
    executions: Object.freeze([
      endpoint,
      http.delegate({
        name: `${name}.mcp.http`,
        route: inheritSourceLocation({ ...route, protocol: 'mcp' }, route),
        delegate: delegateExecution(
          endpoint,
          (runtime, id) => runtime.endpoint(id).request,
        ),
      }),
      http.delegate({
        name: `${name}.mcp.oauth-metadata`,
        route: { method: 'GET', path: metadataPath, protocol: 'mcp' },
        delegate: delegateExecution(
          endpoint,
          (runtime, id) => runtime.endpoint(id).metadata,
        ),
      }),
    ]),
  })
}
