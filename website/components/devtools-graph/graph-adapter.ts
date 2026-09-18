import type { Edge, Node } from '@xyflow/react'
import type {
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  GraphSnapshot,
} from '../../lib/devtools'

export interface SemanticNodeData extends Record<string, unknown> {
  readonly graphNode: GraphNode
}

export interface EdgeRoutePoint {
  readonly x: number
  readonly y: number
}

export interface GraphEdgeData extends Record<string, unknown> {
  readonly kind: string
  readonly route?: readonly EdgeRoutePoint[]
  readonly labelPosition?: EdgeRoutePoint
  readonly followHandles?: boolean
  readonly highlighted?: boolean
}

export type LoutreFlowNode = Node<SemanticNodeData, FlowNodeType>
export type LoutreFlowEdge = Edge<GraphEdgeData, 'graph-edge'>

export type FlowNodeType =
  | 'module-group'
  | 'module'
  | 'provider'
  | 'execution'
  | 'route'
  | 'middleware'
  | 'handler'
  | 'capability'

export function moduleGroupId(moduleId: string): string {
  return `module-group:${encodeURIComponent(moduleId)}`
}

export function flowType(kind: GraphNodeKind): FlowNodeType {
  if (kind === 'entrypoint') return 'route'
  if (kind === 'runtime-capability') return 'capability'
  return kind
}

export function graphEdgeLabel(
  edge: GraphEdge,
  byId: ReadonlyMap<string, GraphNode>,
): string | undefined {
  if (edge.kind === 'flows-to') return undefined
  if (edge.kind !== 'owns') return edge.label ?? edge.kind
  const target = byId.get(edge.to)
  if (!target) return edge.kind
  if (target.kind === 'provider') return 'provider'
  if (target.kind === 'execution') {
    return target.extension?.hostNamespace === 'http'
      ? 'controller'
      : 'execution'
  }
  return edge.kind
}

export function adaptGraph(snapshot: GraphSnapshot): {
  readonly nodes: LoutreFlowNode[]
  readonly edges: LoutreFlowEdge[]
} {
  const visibleIds = new Set(snapshot.nodes.map((node) => node.id))
  const byId = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const modules = snapshot.nodes.filter((node) => node.kind === 'module')
  const moduleIds = new Set(modules.map((node) => node.id))
  const moduleGroups = modules.map<LoutreFlowNode>((module) => ({
    id: moduleGroupId(module.id),
    type: 'module-group',
    position: { x: 0, y: 0 },
    data: { graphNode: module },
    style: { width: 520, height: 320 },
    draggable: true,
    selectable: false,
    deletable: false,
    connectable: false,
    zIndex: -2,
  }))
  const semanticNodes = snapshot.nodes.map<LoutreFlowNode>((node) => {
    const parentModuleId = node.kind === 'module' ? node.id : node.module
    return {
      id: node.id,
      type: flowType(node.kind),
      position: { x: 0, y: 0 },
      data: { graphNode: node },
      draggable: true,
      selectable: true,
      deletable: false,
      connectable: false,
      ...(parentModuleId && moduleIds.has(parentModuleId)
        ? {
            parentId: moduleGroupId(parentModuleId),
            extent: 'parent' as const,
            expandParent: true,
          }
        : {}),
    }
  })
  const nodes = [...moduleGroups, ...semanticNodes]
  const edges = snapshot.edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .map<LoutreFlowEdge>((edge, index) => ({
      id: `${edge.from}:${edge.kind}:${edge.to}:${index}`,
      source: edge.from,
      target: edge.to,
      type: 'graph-edge',
      label: graphEdgeLabel(edge, byId),
      data: { kind: edge.kind },
    }))
  return { nodes, edges }
}
