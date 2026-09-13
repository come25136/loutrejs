import type { NodeProps } from '@xyflow/react'
import type { LoutreFlowNode } from './graph-adapter'

export function ModuleGroup({ data }: NodeProps<LoutreFlowNode>) {
  return (
    <div className="module-group">
      <span>Module scope</span>
      <strong>{data.graphNode.label}</strong>
    </div>
  )
}
