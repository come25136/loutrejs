'use client'

import {
  AlertTriangle,
  ChevronRight,
  CircleDot,
  Copy,
  Database,
  Network,
  RefreshCw,
  Search,
  Server,
  Unplug,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GraphCanvas } from './devtools-graph/graph-canvas'
import {
  graphNodeKinds,
  parseGraphError,
  parseGraphSnapshot,
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind,
  type GraphSnapshot,
  type GraphView,
} from '../lib/devtools'
import type { Locale } from '../lib/i18n'

const kindCopy: Record<GraphNodeKind, string> = {
  module: 'Module',
  provider: 'Provider',
  execution: 'Execution',
  entrypoint: 'Entrypoint',
  middleware: 'Middleware',
  handler: 'Handler',
  'runtime-capability': 'Capability',
}

const kindStyles: Record<
  GraphNodeKind,
  { readonly stroke: string; readonly fill: string }
> = {
  module: { stroke: '#8b5cf6', fill: '#ede9fe' },
  provider: { stroke: '#16a34a', fill: '#dcfce7' },
  execution: { stroke: '#2563eb', fill: '#dbeafe' },
  entrypoint: { stroke: '#d97706', fill: '#fef3c7' },
  middleware: { stroke: '#9333ea', fill: '#f3e8ff' },
  handler: { stroke: '#ea580c', fill: '#ffedd5' },
  'runtime-capability': { stroke: '#64748b', fill: '#e2e8f0' },
}

const viewKinds: Record<GraphView, ReadonlySet<GraphNodeKind>> = {
  all: new Set(graphNodeKinds),
  modules: new Set(['module', 'provider', 'execution']),
  http: new Set(['module', 'execution', 'entrypoint', 'middleware', 'handler']),
  di: new Set(['module', 'provider', 'execution']),
  executions: new Set(['module', 'execution']),
  runtime: new Set(['module', 'execution', 'runtime-capability']),
}

const views: readonly GraphView[] = [
  'all',
  'modules',
  'http',
  'di',
  'executions',
  'runtime',
]

const copy = {
  en: {
    connect: 'Connect',
    disconnect: 'Disconnect',
    connecting: 'Connecting…',
    serverUrl: 'Loutre Server Endpoint',
    ready: 'Live',
    offline: 'Not connected',
    stale: 'Showing the last valid Graph',
    reload: 'Rebuild Graph',
    explorer: 'Explorer',
    search: 'Search nodes…',
    nodes: 'Nodes',
    ownership: 'Ownership edges',
    inspector: 'Inspector',
    selectNode: 'Select a node to inspect its semantics and relationships.',
    relationships: 'Relationships',
    source: 'Source',
    attributes: 'Attributes',
    diagnostics: 'Diagnostics',
    noGraph: 'Start the local CLI, then connect to explore the Graph.',
    invalidUrl: 'Use a localhost or 127.0.0.1 HTTP URL.',
    connectionError:
      'Could not reach the local CLI. Check that the command is running and that this site origin is allowed.',
  },
  ja: {
    connect: '接続',
    disconnect: '切断',
    connecting: '接続中…',
    serverUrl: 'Loutre Server Endpoint',
    ready: '接続中',
    offline: '未接続',
    stale: '直前の有効なGraphを表示中',
    reload: 'Graphを再build',
    explorer: 'Explorer',
    search: 'Nodeを検索…',
    nodes: 'Nodes',
    ownership: 'Ownership edge',
    inspector: 'Inspector',
    selectNode: 'Nodeを選択するとsemanticsとrelationshipを確認できます。',
    relationships: 'Relationships',
    source: 'Source',
    attributes: 'Attributes',
    diagnostics: 'Diagnostics',
    noGraph: 'ローカルCLIを起動し、接続するとGraphを探索できます。',
    invalidUrl: 'localhostまたは127.0.0.1のHTTP URLを指定してください。',
    connectionError:
      'ローカルCLIへ接続できません。コマンドの起動状態と許可originを確認してください。',
  },
} satisfies Record<Locale, Record<string, string>>

export function DevtoolsPage({ locale }: { locale: Locale }) {
  const text = copy[locale]
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:4545')
  const [snapshot, setSnapshot] = useState<GraphSnapshot>()
  const [selectedId, setSelectedId] = useState<string>()
  const [view, setView] = useState<GraphView>('all')
  const [enabledKinds, setEnabledKinds] = useState<ReadonlySet<GraphNodeKind>>(
    new Set(graphNodeKinds),
  )
  const [showOwnership, setShowOwnership] = useState(false)
  const [query, setQuery] = useState('')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string>()
  const [stale, setStale] = useState(false)
  const eventSource = useRef<EventSource | undefined>(undefined)

  useEffect(() => () => eventSource.current?.close(), [])

  const disconnect = () => {
    eventSource.current?.close()
    eventSource.current = undefined
    setConnected(false)
    setConnecting(false)
  }

  const connect = async () => {
    let baseUrl: string
    try {
      baseUrl = localApiUrl(serverUrl)
    } catch {
      setError(text.invalidUrl)
      return
    }
    disconnect()
    setConnecting(true)
    setError(undefined)
    setStale(false)
    try {
      const response = await fetch(`${baseUrl}/api/graph`, {
        cache: 'no-store',
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        const graphError = parseGraphError(payload)
        if (graphError.snapshot) setSnapshot(graphError.snapshot)
        setStale(graphError.snapshot !== undefined)
        if (response.status !== 503) throw new Error(graphError.error)
        setError(graphError.error)
      } else {
        setSnapshot(parseGraphSnapshot(payload))
      }
      setConnected(true)
      setConnecting(false)

      const source = new EventSource(`${baseUrl}/api/events`)
      source.addEventListener('graph', (event) => {
        try {
          setSnapshot(parseGraphSnapshot(JSON.parse(event.data)))
          setConnected(true)
          setError(undefined)
          setStale(false)
        } catch (cause) {
          setError(errorMessage(cause))
        }
      })
      source.addEventListener('graph-error', (event) => {
        try {
          const graphError = parseGraphError(JSON.parse(event.data))
          if (graphError.snapshot) setSnapshot(graphError.snapshot)
          setError(graphError.error)
          setStale(graphError.snapshot !== undefined)
        } catch (cause) {
          setError(errorMessage(cause))
        }
      })
      source.addEventListener('error', () => {
        setConnected(false)
        setError((current) => current ?? text.connectionError)
      })
      eventSource.current = source
      localStorage.setItem('loutre-devtools-url', baseUrl)
      setServerUrl(baseUrl)
    } catch (cause) {
      setConnecting(false)
      setConnected(false)
      setError(
        cause instanceof TypeError ? text.connectionError : errorMessage(cause),
      )
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('loutre-devtools-url')
    if (stored) setServerUrl(stored)
  }, [])

  const reload = async () => {
    setReloading(true)
    try {
      const baseUrl = localApiUrl(serverUrl)
      const response = await fetch(`${baseUrl}/api/reload`, { method: 'POST' })
      const payload: unknown = await response.json()
      if (!response.ok) {
        const graphError = parseGraphError(payload)
        if (graphError.snapshot) setSnapshot(graphError.snapshot)
        setStale(graphError.snapshot !== undefined)
        throw new Error(graphError.error)
      }
      setSnapshot(parseGraphSnapshot(payload))
      setError(undefined)
      setStale(false)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setReloading(false)
    }
  }

  const graph = useMemo(
    () => projectGraph(snapshot, view, query, enabledKinds, showOwnership),
    [snapshot, view, query, enabledKinds, showOwnership],
  )
  const selected = snapshot?.nodes.find((node) => node.id === selectedId)

  return (
    <main className="loutre-devtools h-dvh w-full overflow-auto bg-surface-muted">
      <section className="flex h-full min-w-[900px] flex-col overflow-hidden bg-surface">
        <div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-line p-2.5">
          <label className="flex min-w-[260px] flex-1 items-center gap-3">
            <span className="hidden shrink-0 pl-1 text-[9px] font-bold tracking-[0.12em] text-ink-muted sm:inline">
              {text.serverUrl}
            </span>
            <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-line bg-surface-muted px-3 focus-within:border-interaction">
              <Server size={14} className="mr-2 text-ink-muted" />
              <input
                className="w-full bg-transparent font-mono text-xs text-ink outline-none"
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                disabled={connected || connecting}
              />
            </div>
          </label>
          {connected ? (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold transition hover:bg-surface-muted"
              type="button"
              onClick={disconnect}
            >
              <Unplug size={14} /> {text.disconnect}
            </button>
          ) : (
            <button
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-action px-4 text-xs font-semibold text-action-foreground transition hover:bg-action-hover disabled:opacity-55"
              type="button"
              onClick={() => void connect()}
              disabled={connecting}
            >
              <Network size={14} />
              {connecting ? text.connecting : text.connect}
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 border-b border-red-400/25 bg-red-500/8 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="break-words">{error}</p>
              {stale && <p className="mt-1 font-semibold">{text.stale}</p>}
            </div>
          </div>
        )}

        {snapshot ? (
          <div className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)_270px]">
            <aside className="overflow-y-auto border-r border-line bg-surface-muted/40">
              <PaneTitle title={text.explorer} label="VIEW" />
              <div className="grid gap-1 p-3">
                {views.map((candidate) => (
                  <button
                    key={candidate}
                    className={`rounded-md px-3 py-2 text-left text-xs capitalize transition ${view === candidate ? 'bg-copper/10 font-semibold text-copper-dark' : 'text-ink-soft hover:bg-surface-subtle hover:text-ink'}`}
                    type="button"
                    onClick={() => setView(candidate)}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
              <div className="border-t border-line p-3">
                <h3 className="mb-3 text-[9px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                  {text.nodes}
                </h3>
                <div className="grid gap-2">
                  {graphNodeKinds.map((kind) => (
                    <label
                      key={kind}
                      className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-soft"
                    >
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={enabledKinds.has(kind)}
                        onChange={() => {
                          const next = new Set(enabledKinds)
                          if (next.has(kind)) next.delete(kind)
                          else next.add(kind)
                          setEnabledKinds(next)
                        }}
                      />
                      <span
                        className={`size-2 rounded-sm transition ${enabledKinds.has(kind) ? 'opacity-100' : 'opacity-20'}`}
                        style={{ background: kindStyles[kind].stroke }}
                      />
                      {kindCopy[kind]}
                    </label>
                  ))}
                </div>
                <label className="mt-4 flex cursor-pointer items-center gap-2 border-t border-line pt-3 text-[11px] text-ink-soft">
                  <input
                    className="accent-copper"
                    type="checkbox"
                    checked={showOwnership}
                    onChange={() => setShowOwnership((current) => !current)}
                  />
                  {text.ownership}
                </label>
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-col">
              <div className="flex h-12 items-center gap-3 border-b border-line bg-surface/90 px-4">
                <label className="flex h-8 max-w-sm flex-1 items-center rounded-md border border-line bg-surface-muted px-2 focus-within:border-interaction">
                  <Search size={13} className="mr-2 text-ink-muted" />
                  <input
                    className="w-full bg-transparent text-xs outline-none"
                    placeholder={text.search}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <span className="font-mono text-[10px] text-ink-muted">
                  {graph.nodes.length} nodes · {graph.edges.length} edges
                </span>
                <button
                  className="grid size-8 place-items-center rounded-md border border-line transition hover:bg-surface-muted disabled:opacity-50"
                  type="button"
                  onClick={() => void reload()}
                  disabled={reloading}
                  aria-label={text.reload}
                  title={text.reload}
                >
                  <RefreshCw
                    size={13}
                    className={reloading ? 'animate-spin' : ''}
                  />
                </button>
              </div>
              <div className="min-h-0 flex-1 bg-surface-muted/25">
                <GraphCanvas
                  graph={graph}
                  selectedId={selectedId}
                  onSelect={(node) => setSelectedId(node?.id)}
                />
              </div>
            </div>

            <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface">
              <PaneTitle title={text.inspector} label="DETAILS" />
              <Inspector
                node={selected}
                snapshot={snapshot}
                onSelect={setSelectedId}
                labels={text}
              />
            </aside>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
            <div>
              <CircleDot size={34} className="mx-auto mb-4 text-ink-muted" />
              <p className="text-sm text-ink-soft">{text.noGraph}</p>
            </div>
          </div>
        )}

        {snapshot && (
          <div className="flex min-h-8 items-center gap-3 border-t border-line bg-surface-muted px-4 font-mono text-[9px] text-ink-muted">
            <Database size={11} /> schema v{snapshot.schemaVersion}
            <span className="ml-auto">
              {snapshot.diagnostics.length} {text.diagnostics.toLowerCase()}
            </span>
          </div>
        )}
      </section>
    </main>
  )
}

function PaneTitle({ title, label }: { title: string; label: string }) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-line px-4">
      <strong className="text-xs">{title}</strong>
      <span className="text-[8px] font-bold tracking-[0.14em] text-ink-muted">
        {label}
      </span>
    </div>
  )
}

function Inspector({
  node,
  snapshot,
  onSelect,
  labels,
}: {
  node?: GraphNode
  snapshot: GraphSnapshot
  onSelect: (id: string) => void
  labels: (typeof copy)[Locale]
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
          style={{ background: kindStyles[node.kind].stroke }}
        />
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold">{node.label}</h2>
          <p className="mt-1 text-[10px] text-ink-muted">
            {kindCopy[node.kind]}
          </p>
        </div>
      </div>
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
                className="grid grid-cols-[14px_1fr] gap-2 rounded-md p-2 text-left transition hover:bg-surface-muted"
                type="button"
                onClick={() => onSelect(target.id)}
              >
                <ChevronRight
                  size={12}
                  className={`mt-0.5 text-ink-muted ${direction === 'in' ? 'rotate-180' : ''}`}
                />
                <span className="min-w-0">
                  <strong className="block break-words text-[10px]">
                    {target.label}
                  </strong>
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
      {snapshot.diagnostics.length > 0 && (
        <InspectorSection title={labels.diagnostics}>
          <div className="grid gap-2">
            {snapshot.diagnostics.map((diagnostic, index) => (
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

function projectGraph(
  snapshot: GraphSnapshot | undefined,
  view: GraphView,
  query: string,
  enabledKinds: ReadonlySet<GraphNodeKind>,
  showOwnership: boolean,
): GraphSnapshot {
  if (!snapshot) {
    return { schemaVersion: 1, nodes: [], edges: [], diagnostics: [] }
  }
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const nodes = snapshot.nodes.filter(
    (node) =>
      viewKinds[view].has(node.kind) &&
      enabledKinds.has(node.kind) &&
      (normalizedQuery === '' ||
        node.label.toLocaleLowerCase().includes(normalizedQuery) ||
        node.id.toLocaleLowerCase().includes(normalizedQuery)),
  )
  const ids = new Set(nodes.map((node) => node.id))
  const edges = snapshot.edges.filter((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return false
    if (edge.kind === 'owns' && !showOwnership) return false
    if (view === 'di') return edge.kind === 'owns' || edge.kind === 'injects'
    if (view === 'runtime')
      return edge.kind === 'owns' || edge.kind === 'requires'
    return true
  })
  return { ...snapshot, nodes, edges }
}

function localApiUrl(value: string): string {
  const url = new URL(value)
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  ) {
    throw new Error('Invalid local API URL.')
  }
  return url.origin
}

function displayValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
