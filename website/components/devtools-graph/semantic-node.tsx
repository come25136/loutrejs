import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle } from 'lucide-react'
import type { LoutreFlowNode } from './graph-adapter'

export function SemanticNode({ data, selected }: NodeProps<LoutreFlowNode>) {
  const node = data.graphNode
  const diagnostics = data.diagnostics ?? []
  const diagnosticSummary = diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join('\n')
  const sourceHandles =
    (data.sourceHandles ?? []).length > 0
      ? (data.sourceHandles ?? [])
      : [{ id: 'source-0', offset: 0.5 }]
  const targetHandles =
    (data.targetHandles ?? []).length > 0
      ? (data.targetHandles ?? [])
      : [{ id: 'target-0', offset: 0.5 }]
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
      className={`semantic-node semantic-node--${node.kind} ${selected ? 'is-selected' : ''} ${diagnostics.length > 0 ? 'has-diagnostic' : ''}`}
    >
      {targetHandles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="target"
          position={Position.Left}
          style={{ top: `${handle.offset * 100}%` }}
          isConnectable={false}
        />
      ))}
      <span className="semantic-node__kind">{typeLabel}</span>
      <strong>{node.label}</strong>
      {diagnostics.length > 0 && (
        <span
          className="semantic-node__diagnostic"
          title={diagnosticSummary}
          aria-label={`${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}`}
        >
          <AlertTriangle size={10} />
          {diagnostics.length}
        </span>
      )}
      {source && (
        <span className="semantic-node__source">
          {source.file.split('/').at(-1)}:{source.line}
        </span>
      )}
      {sourceHandles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={Position.Right}
          style={{ top: `${handle.offset * 100}%` }}
          isConnectable={false}
        />
      ))}
    </div>
  )
}
