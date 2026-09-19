import { describe, expect, it } from 'vitest'
import type { GraphSnapshot } from '../lib/devtools.js'
import { filterDevtoolsGraph } from '../lib/devtools-graph-filter.js'

const snapshot: GraphSnapshot = {
  schemaVersion: 1,
  nodes: [
    { id: 'module:app', kind: 'module', label: 'AppModule' },
    { id: 'provider:user', kind: 'provider', label: 'UserService' },
    { id: 'handler:list', kind: 'handler', label: 'listUsers' },
  ],
  edges: [
    { from: 'module:app', to: 'provider:user', kind: 'owns' },
    { from: 'provider:user', to: 'handler:list', kind: 'uses' },
  ],
  diagnostics: [],
}

describe('DevTools Graph filter', () => {
  it('種別と検索語に一致するNode、および両端が残るEdgeだけを返す', () => {
    const graph = filterDevtoolsGraph(
      snapshot,
      'service',
      new Set(['provider', 'handler']),
      true,
    )

    expect(graph.nodes.map((node) => node.id)).toEqual(['provider:user'])
    expect(graph.edges).toEqual([])
  })

  it('Ownership表示を無効にしても他のEdgeは保持する', () => {
    const graph = filterDevtoolsGraph(
      snapshot,
      '',
      new Set(['module', 'provider', 'handler']),
      false,
    )

    expect(graph.edges).toEqual([snapshot.edges[1]])
  })

  it('Snapshotがない間は空のGraphを返す', () => {
    expect(filterDevtoolsGraph(undefined, '', new Set(), true)).toEqual({
      schemaVersion: 1,
      nodes: [],
      edges: [],
      diagnostics: [],
    })
  })
})
