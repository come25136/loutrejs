import type { LoutreFlowEdge, LoutreFlowNode } from './graph-adapter'

export function followDraggedNode(
  nodes: readonly LoutreFlowNode[],
  edges: readonly LoutreFlowEdge[],
  draggedNodeId: string,
): LoutreFlowEdge[] {
  const affectedNodeIds = new Set([
    draggedNodeId,
    ...nodes
      .filter((node) => node.parentId === draggedNodeId)
      .map((node) => node.id),
  ])
  return edges.map((edge) => {
    if (
      !affectedNodeIds.has(edge.source) &&
      !affectedNodeIds.has(edge.target)
    ) {
      return edge
    }
    if (edge.data?.followHandles) return edge
    return {
      ...edge,
      data: {
        ...(edge.data ?? { kind: 'unknown' }),
        followHandles: true,
      },
    }
  })
}
