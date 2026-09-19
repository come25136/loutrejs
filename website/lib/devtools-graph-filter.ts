import type { GraphNodeKind, GraphSnapshot } from './devtools'

const emptyGraph: GraphSnapshot = {
  schemaVersion: 1,
  nodes: [],
  edges: [],
  diagnostics: [],
}

export function filterDevtoolsGraph(
  snapshot: GraphSnapshot | undefined,
  query: string,
  enabledKinds: ReadonlySet<GraphNodeKind>,
  showOwnership: boolean,
): GraphSnapshot {
  if (!snapshot) return emptyGraph

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const nodes = snapshot.nodes.filter(
    (node) =>
      enabledKinds.has(node.kind) &&
      (normalizedQuery === '' ||
        node.label.toLocaleLowerCase().includes(normalizedQuery) ||
        node.id.toLocaleLowerCase().includes(normalizedQuery)),
  )
  const ids = new Set(nodes.map((node) => node.id))
  const edges = snapshot.edges.filter(
    (edge) =>
      ids.has(edge.from) &&
      ids.has(edge.to) &&
      (showOwnership || edge.kind !== 'owns'),
  )
  return { ...snapshot, nodes, edges }
}
