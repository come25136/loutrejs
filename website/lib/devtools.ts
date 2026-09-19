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

export interface GraphNode {
  readonly id: string
  readonly kind: GraphNodeKind
  readonly label: string
  readonly module?: string
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

export interface GraphEdge {
  readonly from: string
  readonly to: string
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
  return value as unknown as GraphSnapshot
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

function isGraphNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    graphNodeKinds.some((kind) => kind === value.kind) &&
    typeof value.label === 'string'
  )
}

function isGraphEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.kind === 'string'
  )
}

function isGraphDiagnostic(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.path === 'string'
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
