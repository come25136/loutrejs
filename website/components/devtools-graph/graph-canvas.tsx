import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  type ReactFlowInstance,
  type NodeChange,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GraphNode, GraphSnapshot } from '../../lib/devtools'
import {
  adaptGraph,
  resizeModuleGroups,
  type LoutreFlowEdge,
  type LoutreFlowNode,
} from './graph-adapter'
import { GraphEdge } from './graph-edge'
import { layoutGraph } from './graph-layout'
import {
  applyEdgeRoutes,
  createGraphEdgeRouter,
  type GraphEdgeRouter,
} from './graph-routing'
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
  readonly emptyMessage: string
  readonly selectedId?: string
  readonly focusRequest?: {
    readonly nodeId: string
    readonly nonce: number
    readonly scope?: 'node' | 'neighbors'
  }
  readonly onSelect: (node: GraphNode | undefined) => void
}

function decorateEdges(
  edges: readonly LoutreFlowEdge[],
  selectedId: string | undefined,
): LoutreFlowEdge[] {
  return edges.map((edge) => {
    const highlighted =
      selectedId !== undefined &&
      (edge.source === selectedId || edge.target === selectedId)
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
  })
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
  emptyMessage,
  selectedId,
  focusRequest,
  onSelect,
}: GraphCanvasProps) {
  const [nodes, setNodes] = useNodesState<LoutreFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<LoutreFlowEdge>([])
  const [instance, setInstance] =
    useState<ReactFlowInstance<LoutreFlowNode, LoutreFlowEdge>>()
  const [layoutError, setLayoutError] = useState<string>()
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const dragLayoutFrameRef = useRef<number | undefined>(undefined)
  const dragLayoutPendingRef = useRef<
    | {
        readonly nodes: readonly LoutreFlowNode[]
        readonly edges: readonly LoutreFlowEdge[]
        readonly generation: number
      }
    | undefined
  >(undefined)
  const dragLayoutRunningRef = useRef(false)
  const dragLayoutGenerationRef = useRef(0)
  const edgeRouterRef = useRef<GraphEdgeRouter | undefined>(undefined)
  const instanceRef = useRef(instance)
  const selectedIdRef = useRef(selectedId)
  const focusRequestRef = useRef(focusRequest)
  const handledFocusNonceRef = useRef<number | undefined>(undefined)
  selectedIdRef.current = selectedId
  focusRequestRef.current = focusRequest
  nodesRef.current = nodes
  edgesRef.current = edges
  instanceRef.current = instance

  const requestDragLayoutFrame = (): void => {
    if (
      dragLayoutFrameRef.current !== undefined ||
      dragLayoutRunningRef.current
    ) {
      return
    }
    dragLayoutFrameRef.current = window.requestAnimationFrame(() => {
      dragLayoutFrameRef.current = undefined
      const pending = dragLayoutPendingRef.current
      dragLayoutPendingRef.current = undefined
      if (!pending) return
      dragLayoutRunningRef.current = true
      void Promise.resolve(edgeRouterRef.current?.route(pending.nodes))
        .then((routes) => {
          if (pending.generation !== dragLayoutGenerationRef.current) return
          setLayoutError(undefined)
          const currentSelectedId = selectedIdRef.current
          const laidOutNodes = pending.nodes.map((node) => ({
            ...node,
            selected: node.id === currentSelectedId,
          }))
          const laidOutEdges = decorateEdges(
            routes
              ? applyEdgeRoutes(pending.edges, routes, pending.nodes)
              : pending.edges,
            currentSelectedId,
          )
          nodesRef.current = laidOutNodes
          edgesRef.current = laidOutEdges
          setNodes(laidOutNodes)
          setEdges(laidOutEdges)
        })
        .catch((error: unknown) => {
          if (pending.generation !== dragLayoutGenerationRef.current) return
          setLayoutError(error instanceof Error ? error.message : String(error))
        })
        .finally(() => {
          dragLayoutRunningRef.current = false
          if (dragLayoutPendingRef.current) requestDragLayoutFrame()
        })
    })
  }

  const scheduleDragLayout = (nextNodes: readonly LoutreFlowNode[]): void => {
    dragLayoutPendingRef.current = {
      nodes: [...nextNodes],
      edges: edgesRef.current,
      generation: dragLayoutGenerationRef.current,
    }
    requestDragLayoutFrame()
  }

  const onNodesChange = useCallback(
    (changes: NodeChange<LoutreFlowNode>[]) => {
      setNodes((currentNodes) => {
        let nextNodes = applyNodeChanges(changes, currentNodes)
        for (const change of changes) {
          if (change.type !== 'position') continue
          const movedNode = nextNodes.find((node) => node.id === change.id)
          if (movedNode) nextNodes = resizeModuleGroups(nextNodes, movedNode)
        }
        return nextNodes
      })
    },
    [setNodes],
  )

  useEffect(() => {
    dragLayoutGenerationRef.current += 1
    dragLayoutPendingRef.current = undefined
    edgeRouterRef.current?.destroy()
    edgeRouterRef.current = undefined
    if (graph.nodes.length === 0) {
      nodesRef.current = []
      edgesRef.current = []
      setNodes([])
      setEdges([])
      return
    }
    let active = true
    const adapted = adaptGraph(graph)
    void layoutGraph(adapted.nodes, adapted.edges)
      .then(async (layout) => {
        const edgeRouter = await createGraphEdgeRouter(
          layout.nodes,
          layout.edges,
        )
        if (!active) {
          edgeRouter.destroy()
          return
        }
        edgeRouterRef.current = edgeRouter
        setLayoutError(undefined)
        const currentSelectedId = selectedIdRef.current
        const routedEdges = applyEdgeRoutes(
          layout.edges,
          edgeRouter.initialRoutes,
          layout.nodes,
        )
        const laidOutNodes = layout.nodes.map((node) => ({
          ...node,
          selected: node.id === currentSelectedId,
        }))
        const laidOutEdges = decorateEdges(routedEdges, currentSelectedId)
        nodesRef.current = laidOutNodes
        edgesRef.current = laidOutEdges
        setNodes(laidOutNodes)
        setEdges(laidOutEdges)
        const pendingFocus = focusRequestRef.current
        if (
          !pendingFocus ||
          handledFocusNonceRef.current === pendingFocus.nonce
        ) {
          window.requestAnimationFrame(() =>
            instanceRef.current?.fitView({ padding: 0.15, duration: 350 }),
          )
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setLayoutError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      active = false
      edgeRouterRef.current?.destroy()
      edgeRouterRef.current = undefined
    }
  }, [graph, setEdges, setNodes])

  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const selected = node.id === selectedId
        return node.selected === selected ? node : { ...node, selected }
      }),
    )
    const nextEdges = decorateEdges(edgesRef.current, selectedId)
    edgesRef.current = nextEdges
    setEdges(nextEdges)
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
      if ((node.data.diagnostics?.length ?? 0) > 0) return '#dc2626'
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
    return <div className="canvas-message">{emptyMessage}</div>
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
      onNodeDrag={(_event, node) => {
        const nextNodes = resizeModuleGroups(
          nodesRef.current.map((currentNode) =>
            currentNode.id === node.id ? node : currentNode,
          ),
          node,
        )
        nodesRef.current = nextNodes
        scheduleDragLayout(nextNodes)
      }}
      onNodeDragStop={(_event, node) => {
        const nextNodes = resizeModuleGroups(
          nodesRef.current.map((currentNode) =>
            currentNode.id === node.id ? node : currentNode,
          ),
          node,
        )
        nodesRef.current = nextNodes
        scheduleDragLayout(nextNodes)
      }}
      onNodeClick={(_event, node) => {
        if (node.type !== 'module-group') onSelect(node.data.graphNode)
      }}
      onEdgeClick={(_event, edge) => {
        const target = graph.nodes.find((node) => node.id === edge.target)
        if (target) onSelect(target)
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
