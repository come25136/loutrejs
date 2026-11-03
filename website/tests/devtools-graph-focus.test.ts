import * as fixture from './helpers/devtools-fixtures.js'
import { describe, expect, it } from 'vitest'
import { connectedNodeIds } from '../components/devtools-graph/graph-canvas'
import type { GraphSnapshot } from '../lib/devtools'

const graph: GraphSnapshot = fixture.graphSnapshot({
  schemaVersion: 1,
  nodes: [
    { id: 'a', kind: 'module', label: 'A' },
    { id: 'b', kind: 'provider', label: 'B' },
    { id: 'c', kind: 'execution', label: 'C' },
    { id: 'd', kind: 'handler', label: 'D' },
  ],
  edges: [
    { from: 'a', to: 'b', kind: 'owns' },
    { from: 'c', to: 'a', kind: 'imports' },
    { from: 'b', to: 'd', kind: 'uses' },
  ],
  diagnostics: [],
})

describe('connectedNodeIds', () => {
  it('includes the selected node and only its direct incoming/outgoing neighbors', () => {
    expect(
      [...connectedNodeIds(graph, fixture.viewId('a'))].toSorted(),
    ).toEqual(['a', 'b', 'c'])
  })

  it('does not walk transitively through neighboring nodes', () => {
    expect(
      connectedNodeIds(graph, fixture.viewId('a')).has(fixture.flowId('d')),
    ).toBe(false)
  })
})
