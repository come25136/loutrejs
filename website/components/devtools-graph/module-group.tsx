import type { Node, NodeProps } from '@xyflow/react'
import type { SemanticNodeData, FlowNodeType } from './graph-adapter'

export function ModuleGroup({
  data,
}: NodeProps<Node<SemanticNodeData, FlowNodeType>>) {
  return (
    <div className="module-group">
      <span>Module scope</span>
      <strong>{data.graphNode.label}</strong>
    </div>
  )
}
