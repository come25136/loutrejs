import {
  moduleId,
  providerNodeId,
  executionNodeId,
  capabilityNodeId,
  entrypointNodeId,
  middlewareStepNodeId,
  handlerNodeId,
  graphViewNodeId,
} from './devtools-identity'
import type {
  ModuleId,
  ProviderNodeId,
  ExecutionNodeId,
  CapabilityNodeId,
  EntrypointNodeId,
  MiddlewareStepNodeId,
  HandlerNodeId,
  GraphViewNodeId,
} from './devtools-identity'
import { optional } from './devtools-decoder'
import { devtoolsRequest, subscribeDevtoolsEvents } from './devtools-client'

export const graphNodeKinds = [
  'module',
  'provider',
  'execution',
  'entrypoint',
  'middleware',
  'handler',
  'runtime-capability',
] as const

export type GraphNodeKind = (typeof graphNodeKinds)[number]
export interface SourceLocation {
  readonly file: string
  readonly line?: number
  readonly column?: number
}

interface GraphNodeBase {
  readonly label: string
  readonly module?: ModuleId | 'application'
  readonly entrypointKind?: string
  readonly executionKind?: string
  readonly capabilities?: readonly string[]
  readonly extension?: {
    readonly name: string
    readonly hostNamespace?: string
    readonly metadata?: unknown
  }
  readonly attributes?: Readonly<Record<string, unknown>>
  readonly source?: SourceLocation
}

type KindId = {
  module: ModuleId
  provider: ProviderNodeId
  execution: ExecutionNodeId
  'runtime-capability': CapabilityNodeId
  entrypoint: EntrypointNodeId
  middleware: MiddlewareStepNodeId
  handler: HandlerNodeId
}
export type GraphNode = {
  [Kind in GraphNodeKind]: GraphNodeBase & {
    readonly kind: Kind
    readonly id: KindId[Kind]
  }
}[GraphNodeKind]

export interface GraphEdge {
  readonly from: GraphViewNodeId
  readonly to: GraphViewNodeId
  readonly kind: string
  readonly label?: string
}

export interface GraphDiagnostic {
  readonly code: string
  readonly message: string
  readonly path: string
  readonly severity?: 'error' | 'warning'
}

export interface GraphSnapshot {
  readonly schemaVersion: 1
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  readonly diagnostics: readonly GraphDiagnostic[]
}

export function parseGraphNode<const Kind extends GraphNodeKind>(
  value: { readonly kind: Kind } & Readonly<Record<string, unknown>>,
): Extract<GraphNode, { kind: Kind }>
export function parseGraphNode(value: unknown): GraphNode
export function parseGraphNode(value: unknown): GraphNode {
  if (!isGraphNode(value)) throw new Error('Invalid Graph node.')
  const { id, kind, module, ...properties } = value
  const base = {
    ...properties,
    ...(module === undefined
      ? {}
      : {
          module:
            module === 'application'
              ? ('application' as const)
              : moduleId(module),
        }),
  }
  switch (kind) {
    case 'module':
      return { ...base, kind, id: moduleId(id) }
    case 'provider':
      return { ...base, kind, id: providerNodeId(id) }
    case 'execution':
      return { ...base, kind, id: executionNodeId(id) }
    case 'runtime-capability':
      return { ...base, kind, id: capabilityNodeId(id) }
    case 'entrypoint':
      return { ...base, kind, id: entrypointNodeId(id) }
    case 'middleware':
      return { ...base, kind, id: middlewareStepNodeId(id) }
    case 'handler':
      return { ...base, kind, id: handlerNodeId(id) }
  }
}
export function parseGraphEdge(value: unknown): GraphEdge {
  if (!isGraphEdge(value)) throw new Error('Invalid Graph edge.')
  return {
    ...value,
    from: graphViewNodeId(value.from),
    to: graphViewNodeId(value.to),
  }
}

export function parseGraphSnapshot(value: unknown): GraphSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('Unsupported Loutre Graph protocol.')
  }
  if (
    !Array.isArray(value.nodes) ||
    !value.nodes.every(isGraphNode) ||
    !Array.isArray(value.edges) ||
    !value.edges.every(isGraphEdge) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every(isGraphDiagnostic)
  ) {
    throw new Error('The CLI returned an invalid Graph Snapshot.')
  }
  return {
    schemaVersion: value.schemaVersion,
    nodes: value.nodes.map(parseGraphNode),
    edges: value.edges.map(parseGraphEdge),
    diagnostics: value.diagnostics,
  }
}

export function parseGraphError(value: unknown): {
  readonly error: string
  readonly snapshot?: GraphSnapshot
} {
  if (!isRecord(value) || typeof value.error !== 'string') {
    throw new Error('The CLI returned an invalid error response.')
  }
  return {
    error: value.error,
    ...(value.snapshot === undefined
      ? {}
      : { snapshot: parseGraphSnapshot(value.snapshot) }),
  }
}

type RawGraphNode = Omit<GraphNodeBase, 'module'> & {
  readonly id: string
  readonly kind: GraphNodeKind
  readonly module?: string
}

function isGraphNode(value: unknown): value is RawGraphNode {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    graphNodeKinds.some((kind) => kind === value.kind) &&
    typeof value.label === 'string' &&
    optional(
      value,
      ['module', 'entrypointKind', 'executionKind'],
      (item) => typeof item === 'string',
    ) &&
    optional(
      value,
      ['capabilities'],
      (item) =>
        Array.isArray(item) &&
        item.every((capability) => typeof capability === 'string'),
    ) &&
    optional(value, ['attributes'], isRecord) &&
    optional(
      value,
      ['source'],
      (item) =>
        isRecord(item) &&
        typeof item.file === 'string' &&
        optional(item, ['line', 'column'], (part) => typeof part === 'number'),
    ) &&
    optional(
      value,
      ['extension'],
      (item) =>
        isRecord(item) &&
        typeof item.name === 'string' &&
        optional(item, ['hostNamespace'], (part) => typeof part === 'string'),
    )
  )
}

function isGraphEdge(value: unknown): value is Omit<
  GraphEdge,
  'from' | 'to'
> & {
  readonly from: string
  readonly to: string
} {
  return (
    isRecord(value) &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.kind === 'string' &&
    optional(value, ['label'], (item) => typeof item === 'string')
  )
}

function isGraphDiagnostic(value: unknown): value is GraphDiagnostic {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.path === 'string' &&
    (value.severity === undefined ||
      value.severity === 'error' ||
      value.severity === 'warning')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface GraphControlState {
  readonly revision: number
  readonly snapshot?: GraphSnapshot
  readonly error?: string
}

export async function fetchGraphState(
  baseUrl: string,
): Promise<GraphControlState> {
  return parseGraphControlState(await devtoolsRequest(baseUrl, 'graph.get'))
}

export async function reloadGraph(baseUrl: string): Promise<GraphControlState> {
  return parseGraphControlState(await devtoolsRequest(baseUrl, 'graph.reload'))
}

export function subscribeGraphEvents(
  baseUrl: string,
  onState: (state: GraphControlState) => void,
): () => void {
  return subscribeDevtoolsEvents(baseUrl, (message) => {
    if (message.event !== 'graph.state') return
    onState(parseGraphControlState(message.payload))
  })
}

function parseGraphControlState(value: unknown): GraphControlState {
  if (!isRecord(value) || typeof value.revision !== 'number') {
    throw new Error('The CLI returned an invalid Graph state.')
  }
  if (value.error !== undefined && typeof value.error !== 'string') {
    throw new Error('The CLI returned an invalid Graph error.')
  }
  return {
    revision: value.revision,
    ...(value.snapshot === undefined
      ? {}
      : { snapshot: parseGraphSnapshot(value.snapshot) }),
    ...(value.error === undefined ? {} : { error: value.error }),
  }
}
