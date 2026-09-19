import type { Edge, Node } from '@xyflow/react'
import type {
  GraphEdge,
  GraphNode,
  GraphNodeKind,
  GraphSnapshot,
} from '../../lib/devtools'

export interface SemanticNodeData extends Record<string, unknown> {
  readonly graphNode: GraphNode
  readonly sourceHandles?: readonly FlowHandle[]
  readonly targetHandles?: readonly FlowHandle[]
}

export interface FlowHandle {
  readonly id: string
  /** Position along the node's height, expressed as 0..1. */
  readonly offset: number
}

export interface EdgeRoutePoint {
  readonly x: number
  readonly y: number
}

export interface GraphEdgeData extends Record<string, unknown> {
  readonly kind: string
  readonly dashed?: boolean
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

const moduleGroupPadding = {
  top: 64,
  right: 36,
  bottom: 36,
  left: 36,
} as const

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

function handleOffset(index: number, count: number): number {
  return count <= 1 ? 0.5 : (index + 1) / (count + 1)
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
    data: { graphNode: module, sourceHandles: [], targetHandles: [] },
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
      data: { graphNode: node, sourceHandles: [], targetHandles: [] },
      draggable: true,
      selectable: true,
      deletable: false,
      connectable: false,
      ...(parentModuleId && moduleIds.has(parentModuleId)
        ? {
            parentId: moduleGroupId(parentModuleId),
          }
        : {}),
    }
  })
  const baseEdges = snapshot.edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .map<LoutreFlowEdge>((edge, index) => ({
      id: `${edge.from}:${edge.kind}:${edge.to}:${index}`,
      source: edge.from,
      target: edge.to,
      type: 'graph-edge',
      label: graphEdgeLabel(edge, byId),
      data: {
        kind: edge.kind,
        dashed:
          edge.kind === 'imports' &&
          byId.get(edge.from)?.kind === 'module' &&
          byId.get(edge.to)?.kind === 'module',
      },
    }))

  const outgoing = new Map<string, LoutreFlowEdge[]>()
  const incoming = new Map<string, LoutreFlowEdge[]>()
  for (const edge of baseEdges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge])
  }

  const edges = baseEdges.map((edge) => {
    const sourceEdges = outgoing.get(edge.source) ?? []
    const targetEdges = incoming.get(edge.target) ?? []
    const sourceIndex = sourceEdges.findIndex(
      (candidate) => candidate.id === edge.id,
    )
    const targetIndex = targetEdges.findIndex(
      (candidate) => candidate.id === edge.id,
    )
    return {
      ...edge,
      sourceHandle: `source-${sourceIndex}`,
      targetHandle: `target-${targetIndex}`,
    }
  })

  const withHandles = (node: LoutreFlowNode): LoutreFlowNode => {
    const sourceEdges = outgoing.get(node.id) ?? []
    const targetEdges = incoming.get(node.id) ?? []
    return {
      ...node,
      data: {
        ...node.data,
        sourceHandles: sourceEdges.map((_, index) => ({
          id: `source-${index}`,
          offset: handleOffset(index, sourceEdges.length),
        })),
        targetHandles: targetEdges.map((_, index) => ({
          id: `target-${index}`,
          offset: handleOffset(index, targetEdges.length),
        })),
      },
    }
  }

  const nodes = [...moduleGroups, ...semanticNodes].map(withHandles)
  return { nodes, edges }
}

export function resizeModuleGroups(
  nodes: readonly LoutreFlowNode[],
  movedNode: LoutreFlowNode,
): LoutreFlowNode[] {
  if (!movedNode.parentId) return [...nodes]

  const nextNodes = nodes.map((node) =>
    node.id === movedNode.id ? movedNode : node,
  )
  const parent = nextNodes.find((node) => node.id === movedNode.parentId)
  if (!parent || parent.type !== 'module-group') return nextNodes

  const children = nextNodes.filter((node) => node.parentId === parent.id)
  if (children.length === 0) return nextNodes

  const left = Math.min(...children.map((node) => node.position.x))
  const top = Math.min(...children.map((node) => node.position.y))
  const right = Math.max(
    ...children.map((node) => node.position.x + nodeWidth(node)),
  )
  const bottom = Math.max(
    ...children.map((node) => node.position.y + nodeHeight(node)),
  )
  const shiftX = left - moduleGroupPadding.left
  const shiftY = top - moduleGroupPadding.top
  const width = Math.max(
    Math.max(0, -shiftX),
    right - shiftX + moduleGroupPadding.right,
  )
  const height = Math.max(
    Math.max(0, -shiftY),
    bottom - shiftY + moduleGroupPadding.bottom,
  )

  return nextNodes.map((node) => {
    if (node.id === parent.id) {
      return {
        ...node,
        position: {
          x: node.position.x + shiftX,
          y: node.position.y + shiftY,
        },
        style: { ...node.style, width, height },
      }
    }
    if (node.parentId !== parent.id || (shiftX === 0 && shiftY === 0)) {
      return node
    }
    return {
      ...node,
      position: {
        x: node.position.x - shiftX,
        y: node.position.y - shiftY,
      },
    }
  })
}

function nodeWidth(node: LoutreFlowNode): number {
  return node.measured?.width ?? node.width ?? 220
}

function nodeHeight(node: LoutreFlowNode): number {
  return node.measured?.height ?? node.height ?? 86
}
