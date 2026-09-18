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
import { useEffect, useMemo, useRef, useState } from 'react'
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
  readonly focusRequest?: {
    readonly nodeId: string
    readonly nonce: number
    readonly scope?: 'node' | 'neighbors'
  }
  readonly onSelect: (node: GraphNode | undefined) => void
}

export function connectedNodeIds(
  graph: GraphSnapshot,
  nodeId: string,
): ReadonlySet<string> {
  const ids = new Set<string>([nodeId])
  for (const edge of graph.edges) {
    if (edge.from === nodeId) ids.add(edge.to)
    if (edge.to === nodeId) ids.add(edge.from)
  }
  return ids
}

export function GraphCanvas({
  graph,
  selectedId,
  focusRequest,
  onSelect,
}: GraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<LoutreFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<LoutreFlowEdge>([])
  const [instance, setInstance] =
    useState<ReactFlowInstance<LoutreFlowNode, LoutreFlowEdge>>()
  const [layoutError, setLayoutError] = useState<string>()
  const selectedIdRef = useRef(selectedId)
  const focusRequestRef = useRef(focusRequest)
  const handledFocusNonceRef = useRef<number | undefined>(undefined)
  selectedIdRef.current = selectedId
  focusRequestRef.current = focusRequest
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
        const currentSelectedId = selectedIdRef.current
        setNodes(
          layout.nodes.map((node) => ({
            ...node,
            selected: node.id === currentSelectedId,
          })),
        )
        setEdges(
          layout.edges.map((edge) => {
            const highlighted =
              currentSelectedId !== undefined &&
              (edge.source === currentSelectedId ||
                edge.target === currentSelectedId)
            return {
              ...edge,
              data: {
                ...(edge.data ?? { kind: 'unknown' }),
                highlighted,
              },
              markerEnd: highlighted
                ? {
                    type: MarkerType.ArrowClosed,
                    color: 'var(--site-accent-text)',
                  }
                : { type: MarkerType.ArrowClosed },
            }
          }),
        )
        const pendingFocus = focusRequestRef.current
        if (
          !pendingFocus ||
          handledFocusNonceRef.current === pendingFocus.nonce
        ) {
          window.requestAnimationFrame(() =>
            instance?.fitView({ padding: 0.15, duration: 350 }),
          )
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setLayoutError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      active = false
    }
  }, [graph, instance, setEdges, setNodes])

  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const selected = node.id === selectedId
        return node.selected === selected ? node : { ...node, selected }
      }),
    )
    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const highlighted =
          selectedId !== undefined &&
          (edge.source === selectedId || edge.target === selectedId)
        if (edge.data?.highlighted === highlighted) return edge
        return {
          ...edge,
          data: {
            ...(edge.data ?? { kind: 'unknown' }),
            highlighted,
          },
          markerEnd: highlighted
            ? {
                type: MarkerType.ArrowClosed,
                color: 'var(--site-accent-text)',
              }
            : { type: MarkerType.ArrowClosed },
        }
      }),
    )
  }, [selectedId, setEdges, setNodes])

  useEffect(() => {
    if (
      !instance ||
      !focusRequest ||
      handledFocusNonceRef.current === focusRequest.nonce
    )
      return
    const focusIds =
      focusRequest.scope === 'node'
        ? new Set([focusRequest.nodeId])
        : connectedNodeIds(graph, focusRequest.nodeId)
    const requestedNonce = focusRequest.nonce

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (handledFocusNonceRef.current === requestedNonce) return
        const focusNodes = instance
          .getNodes()
          .filter(
            (node) =>
              node.type !== 'module-group' &&
              focusIds.has(node.id) &&
              node.measured?.width !== undefined &&
              node.measured?.height !== undefined,
          )
        if (focusNodes.length === 0) return
        handledFocusNonceRef.current = requestedNonce
        void instance.fitView({
          nodes: focusNodes,
          padding: 0.35,
          duration: 300,
          minZoom: 0.6,
          maxZoom: 1.35,
        })
      })
    })
  }, [focusRequest, graph, instance, nodes])

  const miniMapColor = useMemo(
    () => (node: LoutreFlowNode) => {
      const colors: Record<string, string> = {
        'module-group': '#e84f16',
        module: '#e84f16',
        provider: '#15803d',
        execution: '#64748b',
        route: '#b45309',
        middleware: '#8b7d72',
        handler: '#ff6a30',
        capability: '#94a3b8',
      }
      return colors[node.type ?? ''] ?? '#94a3b8'
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
      panOnScroll
      panOnScrollSpeed={1}
      zoomOnScroll={false}
      zoomOnPinch
      minZoom={0.08}
      maxZoom={2}
    >
      <MiniMap
        nodeColor={miniMapColor}
        maskColor="rgba(107, 114, 128, 0.16)"
        pannable
        zoomable
      />
      <Controls showInteractive={false} />
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.25}
        color="var(--site-line-strong)"
      />
    </ReactFlow>
  )
}
