'use client'

import { ChevronDown, ChevronRight, CircleDot, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind,
  type GraphSnapshot,
} from '../lib/devtools'
import { diagnosticsByNodeId } from '../lib/devtools-diagnostics'
import {
  buildDevtoolsNodeTree,
  type DevtoolsNodeTreeItem,
} from '../lib/devtools-tree'
import type { Locale } from '../lib/i18n'
import { DevtoolsProviderPlayground } from './devtools-provider-playground'

export const graphNodeKindCopy: Record<GraphNodeKind, string> = {
  module: 'Module',
  provider: 'Provider',
  execution: 'Execution',
  entrypoint: 'Entrypoint',
  middleware: 'Middleware',
  handler: 'Handler',
  'runtime-capability': 'Capability',
}

export const graphNodeKindStyles: Record<
  GraphNodeKind,
  { readonly stroke: string; readonly fill: string }
> = {
  module: { stroke: '#e84f16', fill: '#fff7ed' },
  provider: { stroke: '#15803d', fill: '#f0fdf4' },
  execution: { stroke: '#475569', fill: '#f8fafc' },
  entrypoint: { stroke: '#b45309', fill: '#fffbeb' },
  middleware: { stroke: '#7c6f64', fill: '#fafaf9' },
  handler: { stroke: '#ff6a30', fill: '#fff7ed' },
  'runtime-capability': { stroke: '#94a3b8', fill: '#f8fafc' },
}

export interface DevtoolsGraphInspectorLabels {
  readonly selectNode: string
  readonly source: string
  readonly relationships: string
  readonly attributes: string
  readonly diagnostics: string
}

export function NodeTree({
  graph,
  emptyMessage,
  selectedId,
  onSelect,
}: {
  graph: GraphSnapshot
  emptyMessage: string
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const tree = useMemo(() => buildDevtoolsNodeTree(graph), [graph])
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(
    new Set(),
  )

  if (tree.length === 0) {
    return (
      <div className="min-h-0 flex-1 px-3 py-4 text-[11px] text-ink-muted">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2" role="tree">
      {tree.map((item, index) => (
        <NodeTreeRow
          key={item.node.id}
          item={item}
          depth={0}
          isLastSibling={index === tree.length - 1}
          ancestorContinues={[]}
          selectedId={selectedId}
          collapsedIds={collapsedIds}
          onSelect={onSelect}
          onToggle={(id) => {
            setCollapsedIds((current) => {
              const next = new Set(current)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }}
        />
      ))}
    </div>
  )
}

function NodeTreeRow({
  item,
  depth,
  isLastSibling,
  ancestorContinues,
  selectedId,
  collapsedIds,
  onSelect,
  onToggle,
}: {
  item: DevtoolsNodeTreeItem
  depth: number
  isLastSibling: boolean
  ancestorContinues: readonly boolean[]
  selectedId?: string
  collapsedIds: ReadonlySet<string>
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}) {
  const hasChildren = item.children.length > 0
  const collapsed = collapsedIds.has(item.node.id)
  const selected = item.node.id === selectedId

  return (
    <div role="treeitem" aria-expanded={hasChildren ? !collapsed : undefined}>
      <div
        className={`group relative flex h-8 min-w-0 items-center rounded-md pr-1 transition ${selected ? 'bg-surface-subtle text-ink' : 'text-ink-soft hover:bg-surface-muted hover:text-ink'}`}
        style={{ paddingLeft: 4 + depth * 20 }}
      >
        {ancestorContinues.map((continues, level) =>
          continues ? (
            <span
              key={`guide:${level}`}
              className="pointer-events-none absolute inset-y-0 w-px bg-line-strong opacity-50"
              style={{ left: 16 + level * 20 }}
            />
          ) : null,
        )}
        {depth > 0 && (
          <>
            <span
              className="pointer-events-none absolute top-0 w-px bg-line-strong opacity-50"
              style={{
                left: 16 + (depth - 1) * 20,
                height: isLastSibling ? 16 : 32,
              }}
            />
            <span
              className="pointer-events-none absolute h-px w-1.5 bg-line-strong opacity-50"
              style={{ left: 16 + (depth - 1) * 20, top: 16 }}
            />
          </>
        )}
        {hasChildren ? (
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded text-ink-muted hover:text-ink"
            onClick={() => onToggle(item.node.id)}
            aria-label={collapsed ? 'Expand node' : 'Collapse node'}
          >
            {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
          </button>
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect(item.node.id)}
          title={item.node.label}
        >
          <span
            className="size-1.5 shrink-0 rounded-sm"
            style={{ background: graphNodeKindStyles[item.node.kind].stroke }}
          />
          <span
            className={`min-w-0 flex-1 truncate text-[11px] ${selected ? 'font-semibold' : ''}`}
          >
            {item.node.label}
          </span>
        </button>
      </div>
      {hasChildren && !collapsed && (
        <div role="group">
          {item.children.map((child, index) => (
            <NodeTreeRow
              key={child.node.id}
              item={child}
              depth={depth + 1}
              isLastSibling={index === item.children.length - 1}
              ancestorContinues={
                depth === 0 ? [] : [...ancestorContinues, !isLastSibling]
              }
              selectedId={selectedId}
              collapsedIds={collapsedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function PaneTitle({ title, label }: { title: string; label: string }) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-line px-4">
      <strong className="text-xs">{title}</strong>
      <span className="text-[9px] font-bold tracking-[0.12em] text-ink-soft">
        {label}
      </span>
    </div>
  )
}

export function Inspector({
  node,
  snapshot,
  onSelect,
  labels,
  locale,
  baseUrl,
  connected,
  onOpenTrace,
}: {
  node?: GraphNode
  snapshot: GraphSnapshot
  onSelect: (id: string) => void
  labels: DevtoolsGraphInspectorLabels
  locale: Locale
  baseUrl: string
  connected: boolean
  onOpenTrace: (traceId: string) => void
}) {
  if (!node) {
    return (
      <div className="grid min-h-56 place-items-center p-7 text-center text-xs leading-5 text-ink-muted">
        <div>
          <CircleDot size={24} className="mx-auto mb-3" />
          {labels.selectNode}
        </div>
      </div>
    )
  }
  const nodeDiagnostics = diagnosticsByNodeId(snapshot).get(node.id) ?? []
  const relations: Array<{
    readonly edge: GraphEdge
    readonly target: GraphNode
    readonly direction: 'in' | 'out'
  }> = []
  for (const edge of snapshot.edges) {
    if (edge.from === node.id) {
      const target = snapshot.nodes.find(
        (candidate) => candidate.id === edge.to,
      )
      if (target) relations.push({ edge, target, direction: 'out' })
    }
    if (edge.to === node.id) {
      const target = snapshot.nodes.find(
        (candidate) => candidate.id === edge.from,
      )
      if (target) relations.push({ edge, target, direction: 'in' })
    }
  }
  const source = node.source
    ? [node.source.file, node.source.line, node.source.column]
        .filter((part) => part !== undefined)
        .join(':')
    : undefined

  return (
    <div className="max-h-[640px] overflow-y-auto p-4">
      <div className="flex items-start gap-3 border-b border-line pb-4">
        <span
          className="mt-1 size-2 rounded-sm"
          style={{ background: graphNodeKindStyles[node.kind].stroke }}
        />
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold">{node.label}</h2>
          <p className="mt-1 text-[10px] text-ink-muted">
            {graphNodeKindCopy[node.kind]}
          </p>
        </div>
      </div>
      {node.kind === 'provider' && (
        <InspectorSection title="Playground">
          <DevtoolsProviderPlayground
            locale={locale}
            baseUrl={baseUrl}
            connected={connected}
            graphNodeId={node.id}
            onOpenTrace={onOpenTrace}
          />
        </InspectorSection>
      )}
      {source && (
        <InspectorSection title={labels.source}>
          <button
            className="inline-flex max-w-full items-center gap-2 break-all text-left font-mono text-[10px] text-copper-dark"
            type="button"
            onClick={() => void navigator.clipboard.writeText(source)}
          >
            <Copy size={11} className="shrink-0" /> {source}
          </button>
        </InspectorSection>
      )}
      <InspectorSection title={labels.relationships}>
        {relations.length === 0 ? (
          <p className="text-[10px] text-ink-muted">(none)</p>
        ) : (
          <div className="grid gap-1">
            {relations.map(({ edge, target, direction }, index) => (
              <button
                key={`${edge.from}:${edge.to}:${index}`}
                className="flex items-start gap-2 rounded-md p-2 text-left transition hover:bg-surface-muted"
                type="button"
                onClick={() => onSelect(target.id)}
              >
                <span className="mt-0.5 flex size-3 shrink-0 items-start">
                  {direction === 'in' && (
                    <ChevronRight
                      size={12}
                      className="shrink-0 rotate-180 text-ink-muted"
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="flex min-w-0 items-start gap-1">
                    <strong className="min-w-0 break-words text-[10px]">
                      {target.label}
                    </strong>
                    {direction === 'out' && (
                      <ChevronRight
                        size={12}
                        className="mt-0.5 shrink-0 text-ink-muted"
                      />
                    )}
                  </span>
                  <small className="text-[9px] text-ink-muted">
                    {edge.kind}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </InspectorSection>
      {node.capabilities && node.capabilities.length > 0 && (
        <InspectorSection title="Capabilities">
          <div className="flex flex-wrap gap-1">
            {node.capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded border border-line bg-surface-muted px-2 py-1 font-mono text-[9px]"
              >
                {capability}
              </span>
            ))}
          </div>
        </InspectorSection>
      )}
      {node.attributes && Object.keys(node.attributes).length > 0 && (
        <InspectorSection title={labels.attributes}>
          <dl className="grid gap-2">
            {Object.entries(node.attributes).map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[76px_1fr] gap-2 text-[10px]"
              >
                <dt className="text-ink-muted">{key}</dt>
                <dd className="m-0 break-all">{displayValue(value)}</dd>
              </div>
            ))}
          </dl>
        </InspectorSection>
      )}
      {nodeDiagnostics.length > 0 && (
        <InspectorSection title={labels.diagnostics}>
          <div className="grid gap-2">
            {nodeDiagnostics.map((diagnostic, index) => (
              <article
                key={`${diagnostic.code}:${index}`}
                className="rounded-md border border-line p-2 text-[10px]"
              >
                <strong className="text-copper-dark">{diagnostic.code}</strong>
                <p className="mt-1 leading-4 text-ink-soft">
                  {diagnostic.message}
                </p>
              </article>
            ))}
          </div>
        </InspectorSection>
      )}
    </div>
  )
}

function InspectorSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-line py-4 last:border-b-0">
      <h3 className="mb-3 text-[9px] font-bold tracking-[0.14em] text-ink-muted uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function displayValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
