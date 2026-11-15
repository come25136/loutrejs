import {
  collectInjectedDependencies,
  defineExecution,
  defineExecutionExtension,
  delegateExecution,
  dependencyConsumerId,
  inheritSourceLocation,
  runInInjectionContext,
  SchemaValidationError,
  validateSchema,
  type ExecutionDefinition,
  type ExecutionExtensionRuntime,
  type ExecutionGroup,
  type ExecutionNodeId,
  type LayerState,
  type SchemaInput,
  type SchemaOutput,
  type StandardJSONSchemaV1,
  type StandardSchemaV1,
} from '@loutrejs/loutre'
import {
  http,
  isHttpRawContractRoute,
  parseHttpPath,
  type HttpContractRawRoute,
  type HttpRawExecutionDefinition,
} from '@loutrejs/loutre/http'
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server'
import {
  createMcpHttpRuntime,
  oauthScopePattern,
  type McpHttpRuntime,
  type McpOAuthOptions,
  type McpOAuthRuntime,
} from './http.js'
import { isJsonObject, snapshotJson, type JsonObject } from './json.js'
import type {
  McpContextInput,
  McpToolDescriptor,
  McpToolResult,
  McpToolRuntime,
} from './types.js'

type Schema = StandardSchemaV1 & StandardJSONSchemaV1

export interface McpToolOptions<
  TName extends string,
  TInput extends Schema,
  TOutput extends Schema,
> {
  readonly name: TName
  readonly description: string
  readonly scopes: readonly string[]
  readonly input: TInput
  readonly output: TOutput
}

export interface McpToolDefinition<
  TName extends string = string,
  TInput extends Schema = Schema,
  TOutput extends Schema = Schema,
> extends McpToolOptions<TName, TInput, TOutput> {}

export type McpToolHandlers<
  TTools extends readonly McpToolDefinition[],
  TContext extends object,
> = {
  readonly [TName in TTools[number]['name']]: (
    input: SchemaOutput<
      Extract<TTools[number], { readonly name: TName }>['input']
    >,
    context: TContext,
  ) =>
    | SchemaInput<Extract<TTools[number], { readonly name: TName }>['output']>
    | Promise<
        SchemaInput<Extract<TTools[number], { readonly name: TName }>['output']>
      >
}

export interface McpRuntime<
  TTools extends readonly McpToolDefinition[] = readonly McpToolDefinition[],
  TContext extends object = object,
  TState extends object = object,
> {
  readonly oauth: McpOAuthRuntime
  context(input: McpContextInput<TState>): TContext | Promise<TContext>
  readonly tools: McpToolHandlers<TTools, NoInfer<TContext>>
}

interface ProtocolRuntime {
  readonly oauth: McpOAuthRuntime
  context(input: McpContextInput<object>): object | Promise<object>
  readonly tools: Readonly<Record<string, unknown>>
}

type RouteState<TRoute> = TRoute extends {
  readonly middlewares: infer TLayers extends NonNullable<
    HttpContractRawRoute['middlewares']
  >
}
  ? LayerState<TLayers>
  : {}

export interface McpImplementationOptions<
  TRoute extends HttpContractRawRoute = HttpContractRawRoute,
  TTools extends readonly McpToolDefinition[] = readonly McpToolDefinition[],
  TContext extends object = object,
> {
  readonly name: string
  readonly version: string
  readonly route: TRoute
  readonly tools: TTools
  readonly oauth?: McpOAuthOptions
  readonly factory: () => McpRuntime<
    NoInfer<TTools>,
    TContext,
    RouteState<TRoute>
  >
}

interface EndpointDefinition extends ExecutionDefinition {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly tools: readonly McpToolDefinition[]
  readonly oauth: McpOAuthOptions
  readonly factory: () => ProtocolRuntime
}

interface CompiledTool {
  readonly descriptor: McpToolDescriptor
  readonly scopes: readonly string[]
  readonly input: Schema
  readonly output: Schema
}

interface CompiledEndpoint {
  readonly name: string
  readonly version: string
  readonly path: string
  readonly tools: readonly CompiledTool[]
  readonly oauth: McpOAuthOptions
  readonly factory: () => ProtocolRuntime
}

interface EndpointRuntime extends ExecutionExtensionRuntime {
  endpoint(id: ExecutionNodeId): McpHttpRuntime
}

class PublicToolError extends Error {}

export function toolError(message: string): Error {
  return new PublicToolError(message)
}

function compileTool(tool: McpToolDefinition): CompiledTool {
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

function validateRuntime(
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
  const names = new Set(tools.map((tool) => tool.descriptor.name))
  for (const name of names) {
    if (
      !Object.hasOwn(runtime.tools, name) ||
      typeof runtime.tools[name] !== 'function'
    ) {
      throw new TypeError(`MCP Toolのhandlerがありません。 ${name}`)
    }
  }
  for (const name of Object.keys(runtime.tools)) {
    if (!names.has(name))
      throw new TypeError(`MCP Toolの契約がありません。 ${name}`)
  }
  return runtime
}

const extension = defineExecutionExtension<
  EndpointDefinition,
  CompiledEndpoint,
  never,
  {},
  EndpointRuntime
>({
  kind: 'execution-extension',
  name: 'loutre:mcp',
  abiVersion: '1',
  compile(definition) {
    if (!definition.name.trim() || !definition.version.trim())
      throw new TypeError('MCP endpointのnameとversionを指定してください。')
    if (
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
    const names = tools.map((tool) => tool.descriptor.name)
    if (new Set(names).size !== names.length)
      throw new TypeError('MCP endpoint内のTool名が重複しています。')
    const id = `${definition.name}.mcp`
    return {
      kind: 'execution',
      id,
      executionKind: 'mcp.endpoint',
      dependencies: collectInjectedDependencies(
        {
          kind: 'execution',
          id: dependencyConsumerId(id),
          name: definition.name,
        },
        () => validateRuntime(definition.factory(), tools),
      ),
      capabilities: [],
      compiled: Object.freeze({
        name: definition.name,
        version: definition.version,
        path: definition.path,
        tools: Object.freeze(tools),
        oauth: definition.oauth,
        factory: definition.factory,
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
  createRuntime({ executions }) {
    const endpoints = new Map<
      ExecutionNodeId,
      { readonly shutdown: AbortController; readonly http: McpHttpRuntime }
    >()
    for (const { execution, resolve } of executions) {
      const { compiled } = execution
      const runtime = runInInjectionContext(
        {
          consumer: {
            kind: 'execution',
            id: dependencyConsumerId(execution.id),
            name: compiled.name,
          },
          resolve: (token, consumer) => resolve(token, { consumer }),
        },
        () => validateRuntime(compiled.factory(), compiled.tools),
      )
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
            executeTool(
              tool,
              input,
              context,
              (value) => runtime.context(value),
              (value, state) => handler(value, state),
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
  },
})

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

async function executeTool(
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
