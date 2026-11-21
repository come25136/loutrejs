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
    throw new TypeError('MCP Tool名には文字列を指定してください。')
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
  TContext extends object,
  const THandlers extends object,
>(
  options: Omit<
    McpImplementationOptions<TRoute, TContract, TContext>,
    'factory'
  > & {
    readonly factory: () => ReturnType<
      McpImplementationOptions<TRoute, NoInfer<TContract>, TContext>['factory']
    > & {
      readonly tools: THandlers &
        NoInfer<DeclaredExecutionMethods<THandlers, TContract['tools']>>
    }
  },
): McpImplementation

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
  const metadataPath = new URL(getOAuthProtectedResourceMetadataUrl(routeUrl))
    .pathname
  const endpoint = defineExecution(extension, {
    name,
    version,
    path: route.path,
    tools: Object.freeze(
      Object.entries(contract.tools).map(([toolName, tool]) =>
        Object.freeze({ ...tool, name: toolName }),
      ),
    ),
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
