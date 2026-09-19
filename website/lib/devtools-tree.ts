import type { GraphEdge, GraphNode, GraphSnapshot } from './devtools'

export interface DevtoolsNodeTreeItem {
  readonly node: GraphNode
  readonly children: readonly DevtoolsNodeTreeItem[]
}

function isStructuralEdge(edge: GraphEdge, child: GraphNode): boolean {
  if (edge.kind === 'imports') return child.kind === 'module'
  if (edge.kind === 'owns')
    return child.kind === 'provider' || child.kind === 'execution'
  if (edge.kind === 'handles') return child.kind === 'entrypoint'
  if (edge.kind === 'flows-to')
    return child.kind === 'middleware' || child.kind === 'handler'
  if (edge.kind === 'requires') return child.kind === 'runtime-capability'
  return false
}

function createsCycle(
  parentId: string,
  childId: string,
  parentByChild: ReadonlyMap<string, string>,
): boolean {
  let current: string | undefined = parentId
  const visited = new Set<string>()
  while (current !== undefined && !visited.has(current)) {
    if (current === childId) return true
    visited.add(current)
    current = parentByChild.get(current)
  }
  return false
}

export function buildDevtoolsNodeTree(
  snapshot: GraphSnapshot,
): readonly DevtoolsNodeTreeItem[] {
  const byId = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const parentByChild = new Map<string, string>()

  for (const edge of snapshot.edges) {
    if (edge.from === edge.to || parentByChild.has(edge.to)) continue
    const parent = byId.get(edge.from)
    const child = byId.get(edge.to)
    if (!parent || !child || !isStructuralEdge(edge, child)) continue
    if (createsCycle(parent.id, child.id, parentByChild)) continue
    parentByChild.set(child.id, parent.id)
  }

  const childrenByParent = new Map<string, GraphNode[]>()
  const roots: GraphNode[] = []
  for (const node of snapshot.nodes) {
    const parentId = parentByChild.get(node.id)
    if (!parentId || !byId.has(parentId)) {
      roots.push(node)
      continue
    }
    const children = childrenByParent.get(parentId) ?? []
    children.push(node)
    childrenByParent.set(parentId, children)
  }

  const materialize = (node: GraphNode): DevtoolsNodeTreeItem => ({
    node,
    children: (childrenByParent.get(node.id) ?? []).map(materialize),
  })

  return roots.map(materialize)
}
