import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'
import type { GraphNode, GraphSnapshot } from '../../lib/devtools'
import {
  adaptGraph,
  type LoutreFlowEdge,
  type LoutreFlowNode,
} from './graph-adapter'
import { followDraggedNode } from './graph-drag'
import { GraphEdge } from './graph-edge'
import { layoutGraph } from './graph-layout'
import { ModuleGroup } from './module-group'
import { SemanticNode } from './semantic-node'

const nodeTypes = {
  'module-group': ModuleGroup,
  module: SemanticNode,
  provider: SemanticNode,
  execution: SemanticNode,
  route: SemanticNode,
  middleware: SemanticNode,
  handler: SemanticNode,
  capability: SemanticNode,
}
const edgeTypes = { 'graph-edge': GraphEdge }

interface GraphCanvasProps {
  readonly graph: GraphSnapshot
  readonly selectedId?: string
  readonly onSelect: (node: GraphNode | undefined) => void
}

export function GraphCanvas({ graph, selectedId, onSelect }: GraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<LoutreFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<LoutreFlowEdge>([])
  const [instance, setInstance] =
    useState<ReactFlowInstance<LoutreFlowNode, LoutreFlowEdge>>()
  const [layoutError, setLayoutError] = useState<string>()
  const followNode = (nodeId: string): void => {
    setEdges((currentEdges) => followDraggedNode(nodes, currentEdges, nodeId))
  }

  useEffect(() => {
    if (graph.nodes.length === 0) {
      setNodes([])
      setEdges([])
      return
    }
    let active = true
    const adapted = adaptGraph(graph)
    void layoutGraph(adapted.nodes, adapted.edges)
      .then((layout) => {
        if (!active) return
        setLayoutError(undefined)
        setNodes(
          layout.nodes.map((node) => ({
            ...node,
            selected: node.id === selectedId,
          })),
        )
        setEdges(
          layout.edges.map((edge) => ({
            ...edge,
            markerEnd: { type: MarkerType.ArrowClosed },
          })),
        )
        window.requestAnimationFrame(() =>
          instance?.fitView({ padding: 0.15, duration: 350 }),
        )
      })
      .catch((error: unknown) => {
        if (!active) return
        setLayoutError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      active = false
    }
  }, [graph, instance, selectedId, setEdges, setNodes])

  useEffect(() => {
    if (!selectedId || !instance) return
    const node = instance.getNode(selectedId)
    if (node) {
      instance.fitView({
        nodes: [node],
        padding: 1.8,
        maxZoom: 1.25,
        duration: 350,
      })
    }
  }, [instance, selectedId])

  const miniMapColor = useMemo(
    () => (node: LoutreFlowNode) => {
      const colors: Record<string, string> = {
        'module-group': '#392b55',
        module: '#9a72ff',
        provider: '#48c78e',
        execution: '#42a5f5',
        route: '#f4b942',
        middleware: '#b66cff',
        handler: '#ff8b4d',
        capability: '#7d8996',
      }
      return colors[node.type ?? ''] ?? '#7d8996'
    },
    [],
  )

  if (layoutError) {
    return <div className="canvas-message">Layout failed: {layoutError}</div>
  }
  if (graph.nodes.length === 0) {
    return <div className="canvas-message">No nodes match this view.</div>
  }

  return (
    <ReactFlow<LoutreFlowNode, LoutreFlowEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onInit={setInstance}
      onNodeDragStart={(_event, node) => followNode(node.id)}
      onNodeDrag={(_event, node) => followNode(node.id)}
      onNodeClick={(_event, node) => {
        if (node.type !== 'module-group') onSelect(node.data.graphNode)
      }}
      onPaneClick={() => onSelect(undefined)}
      nodesConnectable={false}
      deleteKeyCode={null}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.08}
      maxZoom={2}
    >
      <MiniMap
        nodeColor={miniMapColor}
        maskColor="rgba(9, 12, 17, 0.42)"
        pannable
        zoomable
      />
      <Controls showInteractive={false} />
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.25}
        color="#637083"
      />
    </ReactFlow>
  )
}
