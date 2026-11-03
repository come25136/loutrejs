import {
  parseGraphSnapshot,
  parseGraphNode,
  parseGraphEdge,
} from '../../lib/devtools'
import { parseRuntimeEvent } from '../../lib/devtools-decoder'
import {
  parseTraceId,
  parseSpanId,
  flowHandleId,
  durationMs,
  flowNodeId,
  parseModuleGroupId,
  graphViewNodeId,
  flowEdgeId,
} from '../../lib/devtools-identity'
import type {
  LoutreFlowNode,
  LoutreFlowEdge,
} from '../../components/devtools-graph/graph-adapter'

export {
  parseGraphSnapshot as graphSnapshot,
  parseGraphNode as graphNode,
  parseGraphEdge as graphEdge,
  parseRuntimeEvent as runtimeEvent,
  parseTraceId as traceId,
  parseSpanId as spanId,
  flowHandleId,
  durationMs,
  flowNodeId,
  parseModuleGroupId,
  graphViewNodeId,
  flowEdgeId,
}
export const moduleId = (id: string) =>
  parseGraphNode({ id, kind: 'module', label: id }).id
export const providerId = (id: string) =>
  parseGraphNode({ id, kind: 'provider', label: id }).id
export const viewId = (id: string) =>
  parseGraphNode({ id, kind: 'execution', label: id }).id

type FlowNodeInput = Omit<LoutreFlowNode, 'id' | 'parentId' | 'data'> & {
  readonly id: string
  readonly parentId?: string
  readonly data: Omit<LoutreFlowNode['data'], 'graphNode'> & {
    readonly graphNode: unknown
  }
}
export function flowNode(value: FlowNodeInput): LoutreFlowNode {
  const { id, parentId, data, ...properties } = value
  return {
    ...properties,
    id: flowNodeId(id),
    ...(parentId === undefined
      ? {}
      : { parentId: parseModuleGroupId(parentId) }),
    data: { ...data, graphNode: parseGraphNode(data.graphNode) },
  }
}
type FlowEdgeInput = Omit<LoutreFlowEdge, 'id' | 'source' | 'target'> & {
  readonly id: string
  readonly source: string
  readonly target: string
}
export function flowEdge(value: FlowEdgeInput): LoutreFlowEdge {
  return {
    ...value,
    id: flowEdgeId(value.id),
    source: graphViewNodeId(value.source),
    target: graphViewNodeId(value.target),
  }
}
export const flowId = (id: string) =>
  flowNode({
    id,
    type: 'provider',
    position: { x: 0, y: 0 },
    data: { graphNode: { id, kind: 'provider', label: id } },
  }).id
export const groupId = (id: string) =>
  flowNode({
    id: 'fixture',
    parentId: id,
    type: 'provider',
    position: { x: 0, y: 0 },
    data: { graphNode: { id: 'fixture', kind: 'provider', label: 'fixture' } },
  }).parentId!
export const edgeId = (id: string) =>
  flowEdge({
    id,
    source: 'from',
    target: 'to',
    type: 'graph-edge',
    data: { kind: 'injects' },
  }).id
