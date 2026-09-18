import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LoutreFlowNode } from './graph-adapter'

export function SemanticNode({ data, selected }: NodeProps<LoutreFlowNode>) {
  const node = data.graphNode
  const source = node.source
  const typeLabel = (() => {
    if (node.kind === 'entrypoint') return 'Route'
    if (node.kind === 'runtime-capability') return 'Runtime'
    if (node.kind === 'execution' && node.extension?.hostNamespace === 'http') {
      return 'Controller'
    }
    return node.kind[0]?.toUpperCase() + node.kind.slice(1)
  })()
  return (
    <div
      className={`semantic-node semantic-node--${node.kind} ${selected ? 'is-selected' : ''}`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="semantic-node__kind">{typeLabel}</span>
      <strong>{node.label}</strong>
      {source && (
        <span className="semantic-node__source">
          {source.file.split('/').at(-1)}:{source.line}
        </span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  )
}
