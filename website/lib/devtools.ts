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

export interface GraphSnapshotSummary {
  readonly id: string
  readonly createdAt: string
  readonly sourceRevision: number
  readonly name?: string
}

export interface StoredGraphSnapshot extends GraphSnapshotSummary {
  readonly snapshot: GraphSnapshot
}

export interface GraphSnapshotsState {
  readonly snapshots: readonly GraphSnapshotSummary[]
  readonly activeBaseSnapshotId?: string
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

export async function fetchGraphSnapshots(
  baseUrl: string,
): Promise<GraphSnapshotsState> {
  return parseGraphSnapshotsState(
    await devtoolsRequest(baseUrl, 'graph.snapshots.list'),
  )
}

export async function fetchGraphSnapshot(
  baseUrl: string,
  snapshotId: string,
): Promise<StoredGraphSnapshot> {
  return parseStoredGraphSnapshot(
    await devtoolsRequest(baseUrl, 'graph.snapshot.get', { snapshotId }),
  )
}

export async function createGraphSnapshot(
  baseUrl: string,
  options: { readonly name?: string; readonly setAsBase?: boolean } = {},
): Promise<StoredGraphSnapshot> {
  return parseStoredGraphSnapshot(
    await devtoolsRequest(baseUrl, 'graph.snapshot.create', options),
  )
}

export async function setGraphBase(
  baseUrl: string,
  snapshotId?: string,
): Promise<GraphSnapshotsState> {
  return parseGraphSnapshotsState(
    await devtoolsRequest(baseUrl, 'graph.base.set', {
      snapshotId: snapshotId ?? null,
    }),
  )
}

function parseGraphSnapshotsState(value: unknown): GraphSnapshotsState {
  if (
    !isRecord(value) ||
    !Array.isArray(value.snapshots) ||
    !value.snapshots.every(isGraphSnapshotSummary)
  ) {
    throw new Error('The CLI returned invalid Graph Snapshot state.')
  }
  if (
    value.activeBaseSnapshotId !== undefined &&
    typeof value.activeBaseSnapshotId !== 'string'
  ) {
    throw new Error('The CLI returned an invalid Graph base.')
  }
  return {
    snapshots: value.snapshots as unknown as readonly GraphSnapshotSummary[],
    ...(value.activeBaseSnapshotId === undefined
      ? {}
      : { activeBaseSnapshotId: value.activeBaseSnapshotId }),
  }
}

function parseStoredGraphSnapshot(value: unknown): StoredGraphSnapshot {
  if (!isGraphSnapshotSummary(value) || !isRecord(value)) {
    throw new Error('The CLI returned an invalid stored Graph Snapshot.')
  }
  return {
    id: value.id as string,
    createdAt: value.createdAt as string,
    sourceRevision: value.sourceRevision as number,
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    snapshot: parseGraphSnapshot(value.snapshot),
  }
}

function isGraphSnapshotSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.sourceRevision === 'number' &&
    (value.name === undefined || typeof value.name === 'string')
  )
}
