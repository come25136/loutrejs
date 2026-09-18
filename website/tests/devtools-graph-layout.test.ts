import { describe, expect, it } from 'vitest'
import type { GraphSnapshot } from '../lib/devtools.js'
import {
  adaptGraph,
  graphEdgeLabel,
  moduleGroupId,
  type LoutreFlowEdge,
  type LoutreFlowNode,
} from '../components/devtools-graph/graph-adapter.js'
import { followDraggedNode } from '../components/devtools-graph/graph-drag.js'
import {
  polylineMidpoint,
  roundedOrthogonalPath,
} from '../components/devtools-graph/graph-edge.js'
import { layoutGraph } from '../components/devtools-graph/graph-layout.js'

function node(id: string): LoutreFlowNode {
  return {
    id,
    type: 'provider',
    position: { x: 0, y: 0 },
    data: { graphNode: { id, kind: 'provider', label: id } },
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  label: string,
): LoutreFlowEdge {
  return {
    id,
    source,
    target,
    type: 'graph-edge',
    label,
    data: { kind: label },
  }
}

describe('ブラウザ版Devtools Graph', () => {
  it('Moduleをsemantic nodeと視覚groupの両方へ投影する', () => {
    const graph: GraphSnapshot = {
      schemaVersion: 1,
      nodes: [
        { id: 'module', kind: 'module', label: 'AppModule' },
        {
          id: 'inside',
          kind: 'provider',
          label: 'Inside',
          module: 'module',
        },
      ],
      edges: [{ from: 'module', to: 'inside', kind: 'owns' }],
      diagnostics: [],
    }

    const result = adaptGraph(graph)
    const groupId = moduleGroupId('module')
    expect(result.nodes.find((item) => item.id === groupId)).toMatchObject({
      type: 'module-group',
      selectable: false,
    })
    expect(result.nodes.find((item) => item.id === 'module')).toMatchObject({
      type: 'module',
      parentId: groupId,
      selectable: true,
    })
    expect(result.nodes.find((item) => item.id === 'inside')?.parentId).toBe(
      groupId,
    )
    expect(result.edges[0]).toMatchObject({
      source: 'module',
      target: 'inside',
      label: 'provider',
    })
  })

  it('Executionのownership labelへHost namespaceを反映する', () => {
    const nodes = new Map([
      [
        'controller',
        {
          id: 'controller',
          kind: 'execution' as const,
          label: 'Controller',
          extension: { name: 'loutre:http', hostNamespace: 'http' },
        },
      ],
      [
        'worker',
        {
          id: 'worker',
          kind: 'execution' as const,
          label: 'Worker',
        },
      ],
    ])

    expect(
      graphEdgeLabel({ from: 'module', to: 'controller', kind: 'owns' }, nodes),
    ).toBe('controller')
    expect(
      graphEdgeLabel({ from: 'module', to: 'worker', kind: 'owns' }, nodes),
    ).toBe('execution')
  })

  it('ELKの直交配線経路とlabel位置をReact Flow edgeへ保持する', async () => {
    const result = await layoutGraph(
      [node('source'), node('first'), node('second'), node('target')],
      [
        edge('source-first', 'source', 'first', 'injects'),
        edge('source-second', 'source', 'second', 'requires'),
        edge('first-target', 'first', 'target', 'create'),
        edge('second-target', 'second', 'target', 'get'),
      ],
    )

    expect(
      result.edges.every((item) => (item.data?.route?.length ?? 0) >= 2),
    ).toBe(true)
    expect(
      result.edges.every((item) => item.data?.labelPosition !== undefined),
    ).toBe(true)
    expect(
      result.nodes.find((item) => item.id === 'first')?.position.x,
    ).toBeGreaterThanOrEqual(370)
  })

  it('Module境界内のnodeへedge端点を正確に接続する', async () => {
    const group: LoutreFlowNode = {
      id: 'module-group',
      type: 'module-group',
      position: { x: 0, y: 0 },
      data: {
        graphNode: { id: 'module', kind: 'module', label: 'Module' },
      },
    }
    const moduleNode: LoutreFlowNode = {
      ...node('module'),
      type: 'module',
      parentId: group.id,
      data: {
        graphNode: { id: 'module', kind: 'module', label: 'Module' },
      },
    }
    const provider: LoutreFlowNode = {
      ...node('provider'),
      parentId: group.id,
    }
    const result = await layoutGraph(
      [group, moduleNode, provider],
      [edge('module-provider', 'module', 'provider', 'provider')],
    )
    const laidOutModule = result.nodes.find((item) => item.id === 'module')!
    const laidOutProvider = result.nodes.find((item) => item.id === 'provider')!
    const laidOutGroup = result.nodes.find(
      (item) => item.id === 'module-group',
    )!
    const route = result.edges[0]?.data?.route

    expect(
      laidOutProvider.position.x - laidOutModule.position.x - 220,
    ).toBeGreaterThanOrEqual(140)
    expect(route?.[0]).toEqual({
      x: laidOutGroup.position.x + laidOutModule.position.x + 220,
      y: laidOutGroup.position.y + laidOutModule.position.y + 43,
    })
    expect(route?.at(-1)).toEqual({
      x: laidOutGroup.position.x + laidOutProvider.position.x,
      y: laidOutGroup.position.y + laidOutProvider.position.y + 43,
    })
  })

  it('dragしたnodeへ接続するedgeを現在のHandleへ追従させる', () => {
    const nodes = [node('source'), node('target')]
    const edges = [edge('edge', 'source', 'target', 'injects')]

    expect(followDraggedNode(nodes, edges, 'source')[0]?.data).toMatchObject({
      followHandles: true,
    })
  })

  it('直交経路を丸めて経路長の中央へlabelを配置する', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
    ]

    expect(roundedOrthogonalPath(points)).toBe(
      'M 0 0 L 30 0 Q 40 0 40 10 L 40 60',
    )
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 70 },
      ]),
    ).toEqual({ x: 30, y: 20 })
  })
})
