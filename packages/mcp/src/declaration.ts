import { type EndpointDefinition } from './compiled.js'
import {
  type ExecutionDefinition,
  type DeclaredExecutionMethods,
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
  mcpContractBrand,
  type McpImplementationOptions,
  type McpTools,
  type McpToolOptions,
  type McpContract,
  type ProtocolRuntime,
  type McpEndpointOptions,
} from './contract.js'
import {
  getOAuthProtectedResourceMetadataUrl,
  localhostAllowedHostnames,
} from '@modelcontextprotocol/server'

import type { McpOAuthOptions } from './oauth.js'

type McpEndpointDefinition = EndpointDefinition &
  ExecutionDefinition<typeof extension>

export interface McpImplementation<
  TOAuth extends McpOAuthOptions | false = McpOAuthOptions | false,
> extends ExecutionGroup<
  TOAuth extends false
    ? readonly [McpEndpointDefinition, HttpRawExecutionDefinition]
    : readonly [
        McpEndpointDefinition,
        HttpRawExecutionDefinition,
        HttpRawExecutionDefinition,
      ]
> {}

export function defineMcpContract<const TTools extends McpTools>(
  tools: TTools &
    Record<Extract<keyof TTools, symbol>, never> & {
      [K in keyof TTools]: Record<
        Exclude<keyof TTools[K], keyof McpToolOptions>,
        never
      >
    },
): McpContract<{
  readonly [K in keyof TTools]: Readonly<Omit<TTools[K], 'scopes'>> & {
    readonly scopes: Readonly<TTools[K]['scopes']>
  }
}>
export function defineMcpContract(tools: McpTools): McpContract {
  if (Object.getOwnPropertySymbols(tools).length)
    throw new TypeError(
      'MCP Tool一覧にSymbolキーが含まれています。Tool名には文字列を指定してください。',
    )
  const contract = {
    kind: 'mcp-contract' as const,
    [mcpContractBrand]: true as const,
    tools: Object.freeze(
      Object.fromEntries(
        Object.entries(tools).map(([name, tool]) => {
          if ('name' in tool)
            throw new TypeError(
              'MCP Tool名はContractのキーで指定してください。',
            )
          return [
            name,
            Object.freeze({ ...tool, scopes: Object.freeze([...tool.scopes]) }),
          ]
        }),
      ),
    ),
  }
  Object.defineProperty(contract, mcpContractBrand, { enumerable: false })
  return Object.freeze(contract)
}

export function defineMcpImplementation<
  const TRoute extends HttpContractRawRoute,
  const TContract extends McpContract,
  const THandlers extends object,
  const TOAuth extends McpOAuthOptions | false = McpOAuthOptions,
>(
  options: McpEndpointOptions<
    TRoute,
    TContract,
    TOAuth,
    THandlers & NoInfer<DeclaredExecutionMethods<THandlers, TContract['tools']>>
  >,
): McpImplementation<TOAuth>

export function defineMcpImplementation(
  options: Omit<McpImplementationOptions, 'factory'> & {
    readonly factory: () => ProtocolRuntime
  },
): ExecutionGroup {
  const { route, name, version, contract, factory } = options
  if (
    !contract ||
    !Object.hasOwn(contract, mcpContractBrand) ||
    contract[mcpContractBrand] !== true ||
    'tools' in options
  )
    throw new TypeError(
      'MCP endpointのToolはmcp.contract()で宣言してください。',
    )
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
  const endpoint = defineExecution(extension, {
    name,
    version,
    path: route.path,
    tools: Object.freeze(
      Object.entries(contract.tools).map(([toolName, tool]) =>
        Object.freeze({ ...tool, name: toolName }),
      ),
    ),
    allowedHosts: Object.freeze([
      ...(options.allowedHosts ?? localhostAllowedHostnames()),
    ]),
    oauth:
      options.oauth === false
        ? false
        : Object.freeze({
            requiredScopes: Object.freeze([
              ...(options.oauth?.requiredScopes ?? []),
            ]),
            allowedOrigins: Object.freeze([
              ...(options.oauth?.allowedOrigins ?? []),
            ]),
          }),
    factory,
  })
  const transport = http.delegate({
    name: `${name}.mcp.http`,
    route: inheritSourceLocation({ ...route, protocol: 'mcp' }, route),
    delegate: delegateExecution(
      endpoint,
      (runtime, id) => runtime.endpoint(id).request,
    ),
  })
  const executions = [endpoint, transport]
  if (options.oauth !== false) {
    executions.push(
      http.delegate({
        name: `${name}.mcp.oauth-metadata`,
        route: {
          method: 'GET',
          path: new URL(getOAuthProtectedResourceMetadataUrl(routeUrl))
            .pathname,
          protocol: 'mcp',
        },
        delegate: delegateExecution(
          endpoint,
          (runtime, id) => runtime.endpoint(id).metadata,
        ),
      }),
    )
  }
  return Object.freeze({
    kind: 'execution-group',
    name,
    executions: Object.freeze(executions),
  })
}
