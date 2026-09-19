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

const moduleGroupMinWidth = 520
const moduleGroupMinHeight = 320
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
    moduleGroupMinWidth + Math.max(0, -shiftX),
    right - shiftX + moduleGroupPadding.right,
  )
  const height = Math.max(
    moduleGroupMinHeight + Math.max(0, -shiftY),
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
