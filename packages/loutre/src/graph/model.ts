import {
  diagnostic,
  tokenName,
  type ApplicationModel,
  type ApplicationModelEdge,
  type ApplicationModelNode,
  type Diagnostic,
  type ExecutionModelNode,
} from '../core/index.js'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[]

export interface GraphNodeIR {
  readonly id: string
  readonly kind: ApplicationModelNode['kind']
  readonly name?: string
  readonly module?: string
  readonly executionKind?: string
  readonly capabilities?: readonly string[]
  readonly extension?: {
    readonly name: string
    readonly metadata?: JsonValue
  }
  readonly attributes?: Readonly<Record<string, JsonValue>>
}

export interface GraphEdgeIR {
  readonly from: string
  readonly to: string
  readonly kind: ApplicationModelEdge['kind']
}

export interface ApplicationModelGraphIR {
  readonly nodes: readonly GraphNodeIR[]
  readonly edges: readonly GraphEdgeIR[]
  readonly diagnostics: readonly Diagnostic[]
  readonly modules: readonly GraphNodeIR[]
  readonly providers: readonly GraphNodeIR[]
  readonly executions: readonly GraphNodeIR[]
}

export function projectApplicationModel(
  model: ApplicationModel,
): ApplicationModelGraphIR {
  const diagnostics = [...model.diagnostics]
  const nodes = model.nodes.map((node) => projectNode(node, diagnostics))
  const edges = model.edges.map((edge) => ({ ...edge }))
  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    diagnostics: Object.freeze(diagnostics),
    modules: Object.freeze(nodes.filter((node) => node.kind === 'module')),
    providers: Object.freeze(nodes.filter((node) => node.kind === 'provider')),
    executions: Object.freeze(
      nodes.filter((node) => node.kind === 'execution'),
    ),
  })
}

function projectNode(
  node: ApplicationModelNode,
  diagnostics: Diagnostic[],
): GraphNodeIR {
  switch (node.kind) {
    case 'module':
      return {
        id: node.id,
        kind: node.kind,
        ...(node.name === undefined ? {} : { name: node.name }),
        ...(node.description === undefined
          ? {}
          : { attributes: { description: node.description } }),
      }
    case 'provider':
      return {
        id: node.id,
        kind: node.kind,
        name: tokenName(node.token),
        module: node.moduleId,
        attributes: {
          providerKind: node.provider.kind,
          scope: node.provider.scope,
        },
      }
    case 'execution':
      return projectExecution(node, diagnostics)
    case 'lifecycle':
      return {
        id: node.id,
        kind: node.kind,
        name: node.phase,
        module: node.moduleId,
      }
    case 'framework':
      return {
        id: node.id,
        kind: node.kind,
        name: node.name,
        attributes: { frameworkKind: node.frameworkKind },
      }
  }
}

function projectExecution(
  execution: ExecutionModelNode,
  diagnostics: Diagnostic[],
): GraphNodeIR {
  let metadata: JsonValue | undefined
  if (execution.extension.project) {
    try {
      const projected = execution.extension.project({
        execution: execution as never,
      })
      if (projected !== undefined) {
        if (!isJsonValue(projected)) {
          diagnostics.push(
            diagnostic(
              'LUTRE_EXTENSION_PROJECTION_NOT_SERIALIZABLE',
              `Extension ${execution.extension.name} returned non-serializable metadata.`,
              execution.id,
            ),
          )
        } else {
          metadata = projected
        }
      }
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'LUTRE_EXTENSION_PROJECTION',
          error instanceof Error ? error.message : String(error),
          execution.id,
        ),
      )
    }
  }
  return {
    id: execution.id,
    kind: execution.kind,
    module: execution.moduleId,
    executionKind: execution.executionKind,
    capabilities: execution.capabilities.map((capability) => capability.id),
    extension: {
      name: execution.extension.name,
      ...(metadata === undefined ? {} : { metadata }),
    },
  }
}

function isJsonValue(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set(),
): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (ancestors.has(value)) return false
  const nextAncestors = new Set(ancestors).add(value)
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item, nextAncestors))
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(value).every((item) => isJsonValue(item, nextAncestors))
}
