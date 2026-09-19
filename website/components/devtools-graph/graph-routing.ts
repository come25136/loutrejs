import {
  createRoutingSession,
  init,
  type ElkGraph,
  type RouteResult,
} from '@mr_mint/elkjs-libavoid'
import type {
  EdgeRoutePoint,
  FlowHandle,
  LoutreFlowEdge,
  LoutreFlowNode,
} from './graph-adapter'

const nodeWidth = 220
const nodeHeight = 86

const wasmReady = init(
  typeof window === 'undefined' ? undefined : '/libavoid.wasm',
)

function nodeSize(node: LoutreFlowNode): {
  readonly width: number
  readonly height: number
} {
  const styleWidth =
    typeof node.style?.width === 'number' ? node.style.width : undefined
  const styleHeight =
    typeof node.style?.height === 'number' ? node.style.height : undefined
  return {
    width: node.measured?.width ?? node.width ?? styleWidth ?? nodeWidth,
    height: node.measured?.height ?? node.height ?? styleHeight ?? nodeHeight,
  }
}

function handleOffset(
  node: LoutreFlowNode | undefined,
  handleId: string | null | undefined,
  side: 'source' | 'target',
): number {
  const handles: readonly FlowHandle[] =
    side === 'source'
      ? (node?.data.sourceHandles ?? [])
      : (node?.data.targetHandles ?? [])
  return handles.find((handle) => handle.id === handleId)?.offset ?? 0.5
}

function absolutePositions(
  nodes: readonly LoutreFlowNode[],
): ReadonlyMap<string, EdgeRoutePoint> {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const positions = new Map<string, EdgeRoutePoint>()
  const getPosition = (node: LoutreFlowNode): EdgeRoutePoint => {
    const cached = positions.get(node.id)
    if (cached) return cached
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    const parentPosition = parent ? getPosition(parent) : { x: 0, y: 0 }
    const position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    }
    positions.set(node.id, position)
    return position
  }
  nodes.forEach(getPosition)
  return positions
}

function routingGraph(
  nodes: readonly LoutreFlowNode[],
  edges: readonly LoutreFlowEdge[],
): {
  readonly graph: ElkGraph
  readonly positions: ReadonlyMap<string, EdgeRoutePoint>
} {
  const positions = absolutePositions(nodes)
  const routableNodes = nodes.filter((node) => node.type !== 'module-group')
  const routableNodeIds = new Set(routableNodes.map((node) => node.id))
  return {
    positions,
    graph: {
      id: 'root',
      children: routableNodes.map((node) => {
        const position = positions.get(node.id) ?? { x: 0, y: 0 }
        const size = nodeSize(node)
        return {
          id: node.id,
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
          ports: [
            ...((node.data.sourceHandles ?? []).length > 0
              ? (node.data.sourceHandles ?? [])
              : [{ id: 'source-0', offset: 0.5 }]
            ).map((handle) => ({
              id: `${node.id}:${handle.id}`,
              x: size.width,
              y: size.height * handle.offset,
              properties: { 'port.side': 'EAST' },
            })),
            ...((node.data.targetHandles ?? []).length > 0
              ? (node.data.targetHandles ?? [])
              : [{ id: 'target-0', offset: 0.5 }]
            ).map((handle) => ({
              id: `${node.id}:${handle.id}`,
              x: 0,
              y: size.height * handle.offset,
              properties: { 'port.side': 'WEST' },
            })),
          ],
        }
      }),
      edges: edges
        .filter(
          (edge) =>
            routableNodeIds.has(edge.source) &&
            routableNodeIds.has(edge.target),
        )
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourcePort: `${edge.source}:${edge.sourceHandle ?? 'source-0'}`,
          targetPort: `${edge.target}:${edge.targetHandle ?? 'target-0'}`,
        })),
    },
  }
}

function polylineMidpoint(points: readonly EdgeRoutePoint[]): EdgeRoutePoint {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]!
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index]!
    return Math.hypot(point.x - previous.x, point.y - previous.y)
  })
  const halfway = lengths.reduce((sum, length) => sum + length, 0) / 2
  let traveled = 0
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!
    if (traveled + length >= halfway) {
      const ratio = length === 0 ? 0 : (halfway - traveled) / length
      const from = points[index]!
      const to = points[index + 1]!
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      }
    }
    traveled += length
  }
  return points.at(-1)!
}

function edgeLabelPosition(
  points: readonly EdgeRoutePoint[],
  label: unknown,
  target: EdgeRoutePoint,
): EdgeRoutePoint {
  const labelLength =
    label === undefined || label === null ? 0 : String(label).length
  const minimumLength = Math.max(80, labelLength * 8 + 32)
  let fallback:
    | { readonly from: EdgeRoutePoint; readonly to: EdgeRoutePoint }
    | undefined
  let fallbackLength = 0

  // Search backwards so the label stays on the straight section immediately
  // before the target node, while skipping a short terminal stub.
  for (let index = points.length - 1; index > 0; index -= 1) {
    const from = points[index - 1]!
    const to = points[index]!
    const length = Math.abs(to.x - from.x)
    if (from.y !== to.y || length === 0) continue
    if (length > fallbackLength) {
      fallback = { from, to }
      fallbackLength = length
    }
    if (length >= minimumLength) {
      return labelNearTarget(from, to, target, labelLength)
    }
  }

  if (fallback) {
    return labelNearTarget(fallback.from, fallback.to, target, labelLength)
  }
  return polylineMidpoint(points)
}

function labelNearTarget(
  from: EdgeRoutePoint,
  to: EdgeRoutePoint,
  target: EdgeRoutePoint,
  labelLength: number,
): EdgeRoutePoint {
  const fromDistance = Math.abs(target.x - from.x)
  const toDistance = Math.abs(target.x - to.x)
  const near = fromDistance <= toDistance ? from : to
  const far = near === from ? to : from
  const halfLabelWidth = Math.max(24, labelLength * 4 + 9)
  const margin = 12
  const direction = far.x < near.x ? -1 : 1
  return {
    x: near.x + direction * (halfLabelWidth + margin),
    y: near.y,
  }
}

export function edgeRoutePoints(route: RouteResult): readonly EdgeRoutePoint[] {
  return [route.sourcePoint, ...route.bendPoints, route.targetPoint]
}

export function applyEdgeRoutes(
  edges: readonly LoutreFlowEdge[],
  routes: ReadonlyMap<string, RouteResult>,
  nodes: readonly LoutreFlowNode[],
): LoutreFlowEdge[] {
  const positions = absolutePositions(nodes)
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return edges.map((edge) => {
    const route = routes.get(edge.id)
    if (!route) return edge
    const source = nodesById.get(edge.source)
    const target = nodesById.get(edge.target)
    const sourcePosition = positions.get(edge.source)
    const targetPosition = positions.get(edge.target)
    const sourceSize = source ? nodeSize(source) : undefined
    const targetSize = target ? nodeSize(target) : undefined
    const sourceOffset = handleOffset(source, edge.sourceHandle, 'source')
    const targetOffset = handleOffset(target, edge.targetHandle, 'target')
    const sourcePoint =
      sourcePosition && sourceSize
        ? {
            x: sourcePosition.x + sourceSize.width,
            y: sourcePosition.y + sourceSize.height * sourceOffset,
          }
        : route.sourcePoint
    const targetPoint =
      targetPosition && targetSize
        ? {
            x: targetPosition.x,
            y: targetPosition.y + targetSize.height * targetOffset,
          }
        : route.targetPoint
    const points = orthogonalizeEndpoints(
      sourcePoint,
      route.sourcePoint,
      route.bendPoints,
      route.targetPoint,
      targetPoint,
    )
    return {
      ...edge,
      data: {
        ...(edge.data ?? { kind: 'unknown' }),
        route: points,
        labelPosition: edgeLabelPosition(points, edge.label, targetPoint),
        followHandles: false,
      },
    }
  })
}

function orthogonalizeEndpoints(
  source: EdgeRoutePoint,
  routedSource: EdgeRoutePoint,
  bends: readonly EdgeRoutePoint[],
  routedTarget: EdgeRoutePoint,
  target: EdgeRoutePoint,
): readonly EdgeRoutePoint[] {
  const routedPoints = [routedSource, ...bends, routedTarget]
  const points: EdgeRoutePoint[] = [source]
  let previous = source
  for (const current of routedPoints) {
    if (previous.x !== current.x && previous.y !== current.y) {
      points.push({ x: current.x, y: previous.y })
    }
    points.push(current)
    previous = current
  }
  if (previous.x !== target.x && previous.y !== target.y) {
    points.push({ x: target.x, y: previous.y })
  }
  points.push(target)
  const normalized = points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1]!.x ||
      point.y !== points[index - 1]!.y,
  )

  // Libavoid may put the final turn directly on a node boundary when the
  // source and target ports have different y coordinates. Pull that turn
  // into the open space so every edge enters/leaves a node horizontally.
  const terminalStub = 28
  const first = normalized[0]
  const firstTurn = normalized[1]
  if (
    first &&
    firstTurn &&
    firstTurn.x === first.x &&
    firstTurn.y !== first.y
  ) {
    normalized.splice(
      1,
      1,
      { x: first.x + terminalStub, y: first.y },
      { x: first.x + terminalStub, y: firstTurn.y },
    )
  }

  const last = normalized.at(-1)
  const lastTurn = normalized.at(-2)
  if (last && lastTurn && lastTurn.x === last.x && lastTurn.y !== last.y) {
    normalized.splice(
      normalized.length - 2,
      1,
      { x: last.x - terminalStub, y: lastTurn.y },
      { x: last.x - terminalStub, y: last.y },
    )
  }

  return normalized
}

export interface GraphEdgeRouter {
  readonly initialRoutes: ReadonlyMap<string, RouteResult>
  readonly route: (
    nodes: readonly LoutreFlowNode[],
  ) => ReadonlyMap<string, RouteResult>
  readonly destroy: () => void
}

export async function createGraphEdgeRouter(
  nodes: readonly LoutreFlowNode[],
  edges: readonly LoutreFlowEdge[],
): Promise<GraphEdgeRouter> {
  await wasmReady
  const initial = routingGraph(nodes, edges)
  const session = await createRoutingSession(initial.graph, {
    routingType: 'orthogonal',
    shapeBufferDistance: 8,
    idealNudgingDistance: 8,
    segmentPenalty: 18,
    crossingPenalty: 2,
    nudgeOrthogonalSegmentsConnectedToShapes: true,
    nudgeOrthogonalTouchingColinearSegments: true,
    performUnifyingNudgingPreprocessingStep: true,
    nudgeSharedPathsWithCommonEndPoint: true,
  })
  const positions = new Map(initial.positions)
  const initialRoutes = session.processTransaction()

  return {
    initialRoutes,
    route(nextNodes) {
      const nextPositions = absolutePositions(nextNodes)
      for (const node of nextNodes) {
        if (node.type === 'module-group') continue
        const previous = positions.get(node.id)
        const next = nextPositions.get(node.id)
        if (
          !next ||
          (previous && previous.x === next.x && previous.y === next.y)
        ) {
          continue
        }
        session.moveNode(node.id, next)
        positions.set(node.id, next)
      }
      return session.processTransaction()
    },
    destroy() {
      session.destroy()
    },
  }
}
