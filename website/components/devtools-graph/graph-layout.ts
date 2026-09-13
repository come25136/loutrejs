import ELK, {
  type ElkExtendedEdge,
  type ElkNode,
} from 'elkjs/lib/elk.bundled.js'
import type {
  EdgeRoutePoint,
  LoutreFlowEdge,
  LoutreFlowNode,
} from './graph-adapter'

const elk = new ELK()
const nodeWidth = 220
const nodeHeight = 86
const layeredLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.spacing.nodeNode': '70',
  'elk.spacing.edgeNode': '36',
  'elk.spacing.edgeEdge': '22',
  'elk.layered.spacing.nodeNodeBetweenLayers': '150',
  'elk.layered.spacing.edgeNodeBetweenLayers': '36',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '24',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.thoroughness': '20',
  'elk.layered.mergeEdges': 'false',
} as const

function edgeRoute(
  edge: ElkExtendedEdge,
  offset: EdgeRoutePoint,
): readonly EdgeRoutePoint[] | undefined {
  const section = edge.sections?.[0]
  if (!section) return undefined
  return [
    section.startPoint,
    ...(section.bendPoints ?? []),
    section.endPoint,
  ].map((point) => ({ x: point.x + offset.x, y: point.y + offset.y }))
}

export async function layoutGraph(
  nodes: readonly LoutreFlowNode[],
  edges: readonly LoutreFlowEdge[],
): Promise<{
  readonly nodes: LoutreFlowNode[]
  readonly edges: LoutreFlowEdge[]
}> {
  const childrenByParent = new Map<string, LoutreFlowNode[]>()
  for (const node of nodes) {
    if (!node.parentId) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }
  const childIds = new Set(
    [...childrenByParent.values()].flat().map((node) => node.id),
  )
  const toElkNode = (node: LoutreFlowNode): ElkNode => {
    const children = childrenByParent.get(node.id)
    return children
      ? {
          id: node.id,
          children: children.map(toElkNode),
          layoutOptions: {
            ...layeredLayoutOptions,
            'elk.padding': '[top=64,left=36,bottom=36,right=36]',
          },
        }
      : { id: node.id, width: nodeWidth, height: nodeHeight }
  }
  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
    ...(edge.label
      ? {
          labels: [
            {
              id: `${edge.id}:label`,
              text: String(edge.label),
              width: Math.max(48, String(edge.label).length * 8 + 18),
              height: 26,
            },
          ],
        }
      : {}),
  }))
  const graph: ElkNode = await elk.layout({
    id: 'root',
    layoutOptions: {
      ...layeredLayoutOptions,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: nodes.filter((node) => !childIds.has(node.id)).map(toElkNode),
    edges: elkEdges,
  })
  const layoutById = new Map<string, ElkNode>()
  const absolutePositionById = new Map<string, EdgeRoutePoint>()
  const collect = (item: ElkNode, parentPosition: EdgeRoutePoint): void => {
    const absolutePosition = {
      x: parentPosition.x + (item.x ?? 0),
      y: parentPosition.y + (item.y ?? 0),
    }
    layoutById.set(item.id, item)
    absolutePositionById.set(item.id, absolutePosition)
    item.children?.forEach((child) => collect(child, absolutePosition))
  }
  graph.children?.forEach((child) => collect(child, { x: 0, y: 0 }))
  const edgeLayoutById = new Map(
    (graph.edges ?? []).map((edge) => [edge.id, edge]),
  )

  return {
    edges: edges.map((edge) => {
      const layout = edgeLayoutById.get(edge.id)
      const offset = layout?.container
        ? (absolutePositionById.get(layout.container) ?? { x: 0, y: 0 })
        : { x: 0, y: 0 }
      const route = layout ? edgeRoute(layout, offset) : undefined
      const label = layout?.labels?.[0]
      if (!route) return edge
      return {
        ...edge,
        data: {
          ...(edge.data ?? { kind: 'unknown' }),
          route,
          ...(label?.x === undefined || label.y === undefined
            ? {}
            : {
                labelPosition: {
                  x: label.x + (label.width ?? 0) / 2 + offset.x,
                  y: label.y + (label.height ?? 0) / 2 + offset.y,
                },
              }),
        },
      }
    }),
    nodes: nodes.map((node) => {
      const layout = layoutById.get(node.id)
      if (!layout) return node
      return {
        ...node,
        position: { x: layout.x ?? 0, y: layout.y ?? 0 },
        ...(node.type === 'module-group'
          ? {
              style: {
                width: layout.width ?? 520,
                height: layout.height ?? 320,
              },
            }
          : { style: { width: nodeWidth, height: nodeHeight } }),
      }
    }),
  }
}
