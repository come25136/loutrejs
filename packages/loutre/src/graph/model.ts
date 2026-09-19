import {
  diagnostic,
  tokenName,
  type AnyExecutionExtension,
  type ApplicationModel,
  type ApplicationModelEdge,
  type ApplicationModelExtension,
  type ApplicationModelNode,
  type Diagnostic,
  type ExecutionModelNode,
  type SourceLocation,
} from '../core/index.js'
import { match } from 'ts-pattern'

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
    readonly hostNamespace?: string
    readonly metadata?: JsonValue
  }
  readonly attributes?: Readonly<Record<string, JsonValue>>
  readonly source?: SourceLocation
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
  const projectedExecutions = new Map<string, GraphNodeIR>()
  for (const group of model.extensions) {
    for (const execution of projectExtensionGroup(group, diagnostics)) {
      projectedExecutions.set(execution.id, execution)
    }
  }
  const nodes = model.nodes.map((node) =>
    node.kind === 'execution'
      ? (projectedExecutions.get(node.id) ?? projectExecutionBase(node))
      : projectCoreNode(node),
  )
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

function projectCoreNode(
  node: Exclude<ApplicationModelNode, ExecutionModelNode>,
): GraphNodeIR {
  return match(node)
    .with({ kind: 'module' }, (candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      ...(candidate.source === undefined ? {} : { source: candidate.source }),
      ...(candidate.name === undefined ? {} : { name: candidate.name }),
      ...(candidate.description === undefined
        ? {}
        : { attributes: { description: candidate.description } }),
    }))
    .with({ kind: 'provider' }, (candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      name: tokenName(candidate.token),
      module: candidate.moduleId,
      ...(candidate.source === undefined ? {} : { source: candidate.source }),
      attributes: {
        providerKind: candidate.provider.kind,
        scope: candidate.provider.scope,
      },
    }))
    .with({ kind: 'lifecycle' }, (candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      name: candidate.phase,
      module: candidate.moduleId,
      ...(candidate.source === undefined ? {} : { source: candidate.source }),
    }))
    .with({ kind: 'framework' }, (candidate) => ({
      id: candidate.id,
      kind: candidate.kind,
      name: candidate.name,
      ...(candidate.source === undefined ? {} : { source: candidate.source }),
      attributes: { frameworkKind: candidate.frameworkKind },
    }))
    .exhaustive()
}

function projectExtensionGroup<TExtension extends AnyExecutionExtension>(
  group: ApplicationModelExtension<TExtension>,
  diagnostics: Diagnostic[],
): readonly GraphNodeIR[] {
  return group.executions.map((execution) => {
    let metadata: JsonValue | undefined
    const project = group.extension.projectGraph
    if (project) {
      try {
        const projected = project({ execution })
        if (projected !== undefined) {
          if (!isJsonValue(projected)) {
            diagnostics.push(
              diagnostic(
                'LUTRE_EXTENSION_PROJECTION_NOT_SERIALIZABLE',
                `Extension ${group.extension.name} returned non-serializable metadata.`,
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
      ...projectExecutionBase(execution),
      extension: {
        name: group.extension.name,
        ...(group.extension.host === undefined
          ? {}
          : { hostNamespace: group.extension.host.namespace }),
        ...(metadata === undefined ? {} : { metadata }),
      },
    }
  })
}

function projectExecutionBase(execution: ExecutionModelNode): GraphNodeIR {
  return {
    id: execution.id,
    kind: execution.kind,
    module: execution.moduleId,
    executionKind: execution.executionKind,
    capabilities: execution.capabilities.map((capability) => capability.id),
    ...(execution.source === undefined ? {} : { source: execution.source }),
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
