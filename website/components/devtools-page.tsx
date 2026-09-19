'use client'

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Copy,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GraphCanvas } from './devtools-graph/graph-canvas'
import { DevtoolsProviderPlayground } from './devtools-provider-playground'
import { DevtoolsRuntimePane } from './devtools-runtime-pane'
import { ThemePicker } from './theme-toggle'
import {
  graphNodeKinds,
  fetchGraphState,
  reloadGraph,
  subscribeGraphEvents,
  type GraphControlState,
  type GraphEdge,
  type GraphNode,
  type GraphNodeKind,
  type GraphSnapshot,
} from '../lib/devtools'
import {
  buildDiagnosticAgentPrompt,
  diagnosticSource,
} from '../lib/devtools-diagnostics'
import {
  connectDevtools,
  disconnectDevtools,
  subscribeDevtoolsConnection,
  type DevtoolsConnectionStatus,
} from '../lib/devtools-client'
import {
  buildDevtoolsNodeTree,
  type DevtoolsNodeTreeItem,
} from '../lib/devtools-tree'
import type { Locale } from '../lib/i18n'
import {
  devtoolsRuntimeHref,
  parseDevtoolsRuntimeTarget,
} from '../lib/devtools-runtime-link'

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
  module: { stroke: '#e84f16', fill: '#fff7ed' },
  provider: { stroke: '#15803d', fill: '#f0fdf4' },
  execution: { stroke: '#475569', fill: '#f8fafc' },
  entrypoint: { stroke: '#b45309', fill: '#fffbeb' },
  middleware: { stroke: '#7c6f64', fill: '#fafaf9' },
  handler: { stroke: '#ff6a30', fill: '#fff7ed' },
  'runtime-capability': { stroke: '#94a3b8', fill: '#f8fafc' },
}

const copy = {
  en: {
    connectedStatus: 'Connected',
    connectingStatus: 'Connecting…',
    reconnectingStatus: 'Reconnecting…',
    disconnectedStatus: 'Disconnected',
    home: 'Loutre home page',
    settings: 'Settings',
    serverUrl: 'Server URL',
    serverUrlHint: 'Local Loutre DevTools server endpoint.',
    cancel: 'Cancel',
    apply: 'Apply',
    stale: 'Showing the last valid Graph',
    reload: 'Rebuild Graph',
    explorer: 'Explorer',
    search: 'Search nodes…',
    nodes: 'Nodes',
    filters: 'Filters',
    ownership: 'Ownership edges',
    inspector: 'Inspector',
    selectNode: 'Select a node to inspect its semantics and relationships.',
    relationships: 'Relationships',
    source: 'Source',
    attributes: 'Attributes',
    diagnostics: 'Diagnostics',
    diagnosticDetails: 'Diagnostics',
    noDiagnostics: 'No diagnostics found.',
    agentPrompt: 'Agent prompt',
    agentPromptHint:
      'Copy this prompt to give an agent the current Graph diagnostic context.',
    copyPrompt: 'Copy prompt',
    copied: 'Copied',
    close: 'Close',
    noGraph: 'Start the local CLI, then connect to explore the Graph.',
    invalidUrl: 'Use a 127.0.0.1 HTTP URL.',
    theme: 'Theme',
    systemTheme: 'System',
    lightTheme: 'Light',
    darkTheme: 'Dark',
  },
  ja: {
    connectedStatus: '接続済み',
    connectingStatus: '接続中…',
    reconnectingStatus: '再接続中…',
    disconnectedStatus: '未接続',
    home: 'Loutreトップページ',
    settings: '設定',
    serverUrl: 'Server URL',
    serverUrlHint: 'Loutre DevTools ServerのURLを指定してください',
    cancel: 'キャンセル',
    apply: '適用',
    stale: '直前の有効なGraphを表示中',
    reload: 'Graphを再build',
    explorer: 'Explorer',
    search: 'Nodeを検索…',
    nodes: 'Nodes',
    filters: 'Filters',
    ownership: 'Ownership edge',
    inspector: 'Inspector',
    selectNode: 'Nodeを選択するとsemanticsとrelationshipを確認できます。',
    relationships: 'Relationships',
    source: 'Source',
    attributes: 'Attributes',
    diagnostics: 'Diagnostics',
    diagnosticDetails: 'Diagnostics',
    noDiagnostics: '問題は検出されていません。',
    agentPrompt: 'エージェント向けプロンプト',
    agentPromptHint:
      '現在のGraph診断を含む、エージェントへの修正依頼プロンプトです。',
    copyPrompt: 'プロンプトをコピー',
    copied: 'コピーしました',
    close: '閉じる',
    noGraph: 'ローカルCLIを起動し、接続するとGraphを探索できます。',
    invalidUrl: '127.0.0.1のHTTP URLを指定してください。',
    theme: 'テーマ',
    systemTheme: 'システム',
    lightTheme: 'ライト',
    darkTheme: 'ダーク',
  },
} satisfies Record<Locale, Record<string, string>>

export type DevtoolsWorkspace = 'graph' | 'trace'

function devtoolsWorkspaceHref(
  locale: Locale,
  workspace: DevtoolsWorkspace,
): string {
  const prefix = locale === 'ja' ? '/ja' : ''
  return `${prefix}/devtools/${workspace}/`
}

export function DevtoolsPage({
  locale,
  initialWorkspace,
}: {
  locale: Locale
  initialWorkspace: DevtoolsWorkspace
}) {
  const text = copy[locale]
  const router = useRouter()
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:25136')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [settingsServerUrl, setSettingsServerUrl] = useState(serverUrl)
  const [settingsError, setSettingsError] = useState<string>()
  const [workspace, setWorkspace] =
    useState<DevtoolsWorkspace>(initialWorkspace)
  const [requestedTraceId, setRequestedTraceId] = useState<string>()
  const [requestedSpanId, setRequestedSpanId] = useState<string>()
  const [snapshot, setSnapshot] = useState<GraphSnapshot>()
  const [selectedId, setSelectedId] = useState<string>()
  const [graphFocusRequest, setGraphFocusRequest] = useState<{
    readonly nodeId: string
    readonly nonce: number
    readonly scope?: 'node' | 'neighbors'
  }>()
  const [enabledKinds, setEnabledKinds] = useState<ReadonlySet<GraphNodeKind>>(
    new Set(graphNodeKinds),
  )
  const [showOwnership, setShowOwnership] = useState(true)
  const [query, setQuery] = useState('')
  const [connectionStatus, setConnectionStatus] =
    useState<DevtoolsConnectionStatus>('disconnected')
  const [serverInitialized, setServerInitialized] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string>()
  const [stale, setStale] = useState(false)
  const connectionGeneration = useRef(0)
  const initialized = useRef(false)
  const connected = connectionStatus === 'connected'
  const graphHref = devtoolsWorkspaceHref(locale, 'graph')
  const traceHref = devtoolsWorkspaceHref(locale, 'trace')

  const applyGraphState = (state: GraphControlState) => {
    if (state.snapshot) setSnapshot(state.snapshot)
    if (state.error) {
      setError(state.error)
      setStale(state.snapshot !== undefined)
      return
    }
    setError(undefined)
    setStale(false)
  }

  useEffect(() => {
    const applyLocation = () => {
      const target = parseDevtoolsRuntimeTarget(window.location.search)
      setRequestedTraceId(target.traceId)
      setRequestedSpanId(target.spanId)
      setWorkspace(
        window.location.pathname.replace(/\/$/, '').endsWith('/devtools/trace')
          ? 'trace'
          : 'graph',
      )
    }

    applyLocation()
    window.addEventListener('popstate', applyLocation)

    if (!initialized.current) {
      initialized.current = true
      const stored = localStorage.getItem('loutre-devtools-url')
      let initialServerUrl = serverUrl
      if (stored) {
        try {
          initialServerUrl = localApiUrl(stored)
        } catch {
          localStorage.removeItem('loutre-devtools-url')
        }
      }
      setServerUrl(initialServerUrl)
      setSettingsServerUrl(initialServerUrl)
      setServerInitialized(true)
    }

    return () => window.removeEventListener('popstate', applyLocation)
  }, [])

  useEffect(() => {
    if (!serverInitialized) return

    let baseUrl: string
    try {
      baseUrl = localApiUrl(serverUrl)
    } catch {
      setError(text.invalidUrl)
      setConnectionStatus('disconnected')
      return
    }

    const generation = connectionGeneration.current + 1
    connectionGeneration.current = generation
    const isCurrent = () => connectionGeneration.current === generation

    const unsubscribeGraph = subscribeGraphEvents(baseUrl, (state) => {
      if (!isCurrent()) return
      try {
        applyGraphState(state)
      } catch (cause) {
        setError(errorMessage(cause))
      }
    })

    const initialConnection = connectDevtools(baseUrl)
    const unsubscribeConnection = subscribeDevtoolsConnection(
      baseUrl,
      (status) => {
        if (!isCurrent()) return
        setConnectionStatus(status)
        if (status !== 'connected') return
        void fetchGraphState(baseUrl)
          .then((state) => {
            if (isCurrent()) applyGraphState(state)
          })
          .catch((cause: unknown) => {
            if (isCurrent()) setError(errorMessage(cause))
          })
      },
    )
    void initialConnection.catch(() => {
      // The transport keeps retrying; connection status communicates the outage.
    })

    return () => {
      connectionGeneration.current += 1
      unsubscribeGraph()
      unsubscribeConnection()
      disconnectDevtools(baseUrl)
    }
  }, [serverInitialized, serverUrl])

  const openSettings = () => {
    setSettingsServerUrl(serverUrl)
    setSettingsError(undefined)
    setSettingsOpen(true)
  }

  const applySettings = () => {
    let nextServerUrl: string
    try {
      nextServerUrl = localApiUrl(settingsServerUrl)
    } catch {
      setSettingsError(text.invalidUrl)
      return
    }

    localStorage.setItem('loutre-devtools-url', nextServerUrl)
    if (nextServerUrl !== serverUrl) setConnectionStatus('connecting')
    setServerUrl(nextServerUrl)
    setSettingsServerUrl(nextServerUrl)
    setSettingsError(undefined)
    setSettingsOpen(false)
  }

  const navigateRuntime = (traceId: string, spanId?: string) => {
    const href = `${traceHref}${devtoolsRuntimeHref(traceId, spanId)}`
    setRequestedTraceId(traceId)
    setRequestedSpanId(spanId)
    setWorkspace('trace')
    if (`${window.location.pathname}${window.location.search}` !== href) {
      router.replace(href)
    }
  }

  const navigateGraph = (graphNodeId: string) => {
    setSelectedId(graphNodeId)
    setGraphFocusRequest((current) => ({
      nodeId: graphNodeId,
      nonce: (current?.nonce ?? 0) + 1,
      scope: 'node',
    }))
    setWorkspace('graph')
    if (`${window.location.pathname}${window.location.search}` !== graphHref) {
      router.replace(graphHref)
    }
  }

  const replaceWorkspace = (workspace: DevtoolsWorkspace, href: string) => {
    setWorkspace(workspace)
    router.replace(href)
  }

  const reload = async () => {
    setReloading(true)
    try {
      const baseUrl = localApiUrl(serverUrl)
      applyGraphState(await reloadGraph(baseUrl))
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setReloading(false)
    }
  }

  const displayedSnapshot = snapshot
  const graph = useMemo(
    () => projectGraph(displayedSnapshot, query, enabledKinds, showOwnership),
    [displayedSnapshot, query, enabledKinds, showOwnership],
  )
  const selected = displayedSnapshot?.nodes.find(
    (node) => node.id === selectedId,
  )
  const diagnostics = displayedSnapshot?.diagnostics ?? []
  const hasDiagnostics = diagnostics.length > 0
  const agentPrompt = displayedSnapshot
    ? buildDiagnosticAgentPrompt(displayedSnapshot, locale)
    : ''
  const connectionLabel =
    connectionStatus === 'connected'
      ? text.connectedStatus
      : connectionStatus === 'connecting'
        ? text.connectingStatus
        : connectionStatus === 'reconnecting'
          ? text.reconnectingStatus
          : text.disconnectedStatus
  const connectionDot =
    connectionStatus === 'connected'
      ? 'bg-emerald-500'
      : connectionStatus === 'disconnected'
        ? 'bg-red-500'
        : 'animate-pulse bg-amber-500'

  return (
    <main className="loutre-devtools h-dvh w-full overflow-auto bg-paper">
      <section className="flex h-full min-w-[900px] flex-col overflow-hidden bg-paper">
        <div className="grid min-h-14 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-surface/95 px-2.5">
          <Link
            className="grid size-9 place-items-center rounded-md transition hover:bg-surface-muted"
            href={locale === 'ja' ? '/ja/' : '/'}
            aria-label={text.home}
          >
            <Image
              className="size-6"
              src="/loutre.svg"
              width={1254}
              height={1254}
              alt=""
              priority
            />
          </Link>
          <div className="flex h-9 items-center rounded-lg border border-line bg-surface-muted/70 p-0.5">
            <Link
              className={`inline-flex h-7 items-center justify-center rounded-md px-3 text-[10px] font-semibold transition ${workspace === 'graph' ? 'bg-action text-action-foreground shadow-sm' : 'text-ink-soft hover:bg-surface hover:text-ink'}`}
              href={graphHref}
              onClick={(event) => {
                event.preventDefault()
                replaceWorkspace('graph', graphHref)
              }}
            >
              Graph
            </Link>
            <Link
              className={`inline-flex h-7 items-center justify-center rounded-md px-3 text-[10px] font-semibold transition ${workspace === 'trace' ? 'bg-action text-action-foreground shadow-sm' : 'text-ink-soft hover:bg-surface hover:text-ink'}`}
              href={traceHref}
              onClick={(event) => {
                event.preventDefault()
                replaceWorkspace('trace', traceHref)
              }}
            >
              Traces
            </Link>
          </div>
          <button
            type="button"
            title={text.settings}
            aria-label={text.settings}
            className="grid size-9 justify-self-end place-items-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
            onClick={openSettings}
          >
            <Settings size={14} />
          </button>
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

        {displayedSnapshot ? (
          workspace === 'trace' ? (
            <DevtoolsRuntimePane
              locale={locale}
              baseUrl={serverUrl}
              connected={connected}
              requestedTraceId={requestedTraceId}
              requestedSpanId={requestedSpanId}
              onNavigateRuntime={navigateRuntime}
              onJumpToGraph={navigateGraph}
            />
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_270px]">
              <aside className="flex min-h-0 flex-col border-r border-line bg-surface">
                <PaneTitle title={text.explorer} label="TREE" />
                <NodeTree
                  graph={graph}
                  selectedId={selectedId}
                  onSelect={(nodeId) => {
                    setSelectedId(nodeId)
                    setGraphFocusRequest((current) => ({
                      nodeId,
                      nonce: (current?.nonce ?? 0) + 1,
                      scope: 'neighbors',
                    }))
                  }}
                />
                <div className="shrink-0 border-t border-line p-3">
                  <h3 className="mb-3 text-[9px] font-bold tracking-[0.14em] text-ink-muted uppercase">
                    {text.filters}
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
                <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
                  <label className="flex h-8 max-w-sm flex-1 items-center rounded-md border border-line bg-surface px-2 focus-within:border-line-strong">
                    <Search size={13} className="mr-2 text-ink-muted" />
                    <input
                      className="w-full bg-transparent text-xs outline-none"
                      placeholder={text.search}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
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
                <div className="min-h-0 flex-1 bg-surface-muted/35">
                  <GraphCanvas
                    graph={graph}
                    selectedId={selectedId}
                    focusRequest={graphFocusRequest}
                    onSelect={(node) => setSelectedId(node?.id)}
                  />
                </div>
              </div>

              <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface">
                <PaneTitle title={text.inspector} label="DETAILS" />
                <Inspector
                  node={selected}
                  snapshot={displayedSnapshot}
                  onSelect={setSelectedId}
                  labels={text}
                  locale={locale}
                  baseUrl={serverUrl}
                  connected={connected}
                  onOpenTrace={(traceId) => navigateRuntime(traceId)}
                />
              </aside>
            </div>
          )
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
            <div>
              <CircleDot size={34} className="mx-auto mb-4 text-ink-muted" />
              <p className="text-sm text-ink-soft">{text.noGraph}</p>
            </div>
          </div>
        )}

        <div className="flex min-h-8 items-center justify-between border-t border-line bg-surface px-3 font-mono text-[9px] text-ink-soft">
          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center gap-1.5 px-1 font-sans text-[10px] font-semibold text-ink-soft"
              title={serverUrl}
            >
              <span className={`size-2 rounded-full ${connectionDot}`} />
              {connectionLabel}
            </div>
            {displayedSnapshot && (
              <>
                <span className="h-3 border-l border-line" aria-hidden="true" />
                <span className="inline-flex items-center">
                  <span>{graph.nodes.length} nodes</span>
                  <span
                    className="mx-2 h-3 border-l border-line"
                    aria-hidden="true"
                  />
                  <span>{graph.edges.length} edges</span>
                </span>
                <span className="h-3 border-l border-line" aria-hidden="true" />
                <button
                  className={`inline-flex items-center gap-1 transition ${
                    hasDiagnostics
                      ? 'text-red-600 hover:text-red-700 dark:text-red-300 dark:hover:text-red-200'
                      : 'cursor-default text-ink-muted'
                  }`}
                  type="button"
                  onClick={() => {
                    if (!hasDiagnostics) return
                    setPromptCopied(false)
                    setDiagnosticsOpen(true)
                  }}
                  disabled={!hasDiagnostics}
                  aria-label={`${diagnostics.length} ${text.diagnostics.toLowerCase()}`}
                  title={
                    hasDiagnostics ? text.diagnosticDetails : text.noDiagnostics
                  }
                >
                  {hasDiagnostics && <AlertTriangle size={11} />}
                  {diagnostics.length} {text.diagnostics.toLowerCase()}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-[1px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false)
          }}
        >
          <section
            className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="devtools-settings-title"
          >
            <div className="mb-6 flex items-center gap-2.5">
              <Settings size={15} className="text-ink-soft" />
              <h2
                id="devtools-settings-title"
                className="text-sm font-semibold text-ink"
              >
                {text.settings}
              </h2>
            </div>

            <div className="grid gap-5">
              <label className="block">
                <span className="text-[11px] font-semibold text-ink">
                  {text.theme}
                </span>
                <div className="mt-2">
                  <ThemePicker
                    systemLabel={text.systemTheme}
                    lightLabel={text.lightTheme}
                    darkLabel={text.darkTheme}
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-ink">
                  {text.serverUrl}
                </span>
                <span className="mt-1 block text-[10px] leading-4 text-ink-soft">
                  {text.serverUrlHint}
                </span>
                <input
                  className="mt-2 h-10 w-full rounded-lg border border-line bg-surface-muted/45 px-3 font-mono text-xs text-ink outline-none transition focus:border-line-strong"
                  value={settingsServerUrl}
                  spellCheck={false}
                  onChange={(event) => {
                    setSettingsServerUrl(event.target.value)
                    setSettingsError(undefined)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void applySettings()
                    if (event.key === 'Escape') setSettingsOpen(false)
                  }}
                />
                {settingsError && (
                  <span className="mt-2 block text-[10px] text-red-600 dark:text-red-300">
                    {settingsError}
                  </span>
                )}
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                className="h-9 rounded-lg border border-line px-3 text-xs font-semibold text-ink-soft transition hover:bg-surface-muted hover:text-ink"
                onClick={() => setSettingsOpen(false)}
              >
                {text.cancel}
              </button>
              <button
                type="button"
                className="h-9 rounded-lg bg-action px-4 text-xs font-semibold text-action-foreground transition hover:bg-action-hover"
                onClick={() => void applySettings()}
              >
                {text.apply}
              </button>
            </div>
          </section>
        </div>
      )}

      {diagnosticsOpen && displayedSnapshot && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-[1px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDiagnosticsOpen(false)
          }}
        >
          <section
            className="w-full max-w-[720px] rounded-xl border border-line bg-surface p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="devtools-diagnostics-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle
                  size={16}
                  className="text-red-600 dark:text-red-300"
                />
                <div>
                  <h2
                    id="devtools-diagnostics-title"
                    className="text-sm font-semibold text-ink"
                  >
                    {diagnostics.length} {text.diagnostics}
                  </h2>
                  <p className="mt-1 text-[10px] text-ink-soft">
                    {text.agentPromptHint}
                  </p>
                </div>
              </div>
              <button
                className="grid size-8 place-items-center rounded-md text-ink-soft transition hover:bg-surface-muted hover:text-ink"
                type="button"
                onClick={() => setDiagnosticsOpen(false)}
                aria-label={text.close}
                title={text.close}
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-5 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
              {diagnostics.map((diagnostic, index) => {
                const source = diagnosticSource(displayedSnapshot, diagnostic)
                return (
                  <article
                    key={`${diagnostic.code}:${diagnostic.path}:${index}`}
                    className="rounded-lg border border-red-400/30 bg-red-500/5 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px]">
                      <strong className="text-red-700 dark:text-red-300">
                        {diagnostic.code}
                      </strong>
                      <span className="text-red-600/80 dark:text-red-300/80">
                        {(diagnostic.severity ?? 'error').toUpperCase()}
                      </span>
                      <span className="text-ink-muted">{diagnostic.path}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink-soft">
                      {diagnostic.message}
                    </p>
                    {source && (
                      <p className="mt-2 font-mono text-[10px] text-ink-muted">
                        {source}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-semibold text-ink">
                  {text.agentPrompt}
                </h3>
                <button
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[10px] font-semibold text-ink-soft transition hover:bg-surface-muted hover:text-ink"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(agentPrompt)
                    setPromptCopied(true)
                  }}
                >
                  <Copy size={11} />
                  {promptCopied ? text.copied : text.copyPrompt}
                </button>
              </div>
              <textarea
                className="h-40 w-full resize-y rounded-lg border border-line bg-surface-muted/45 p-3 font-mono text-[10px] leading-5 text-ink outline-none"
                value={agentPrompt}
                readOnly
                aria-label={text.agentPrompt}
              />
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function NodeTree({
  graph,
  selectedId,
  onSelect,
}: {
  graph: GraphSnapshot
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
        No nodes match this graph.
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
            style={{ background: kindStyles[item.node.kind].stroke }}
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

function PaneTitle({ title, label }: { title: string; label: string }) {
  return (
    <div className="flex h-12 items-center justify-between border-b border-line px-4">
      <strong className="text-xs">{title}</strong>
      <span className="text-[9px] font-bold tracking-[0.12em] text-ink-soft">
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
  locale,
  baseUrl,
  connected,
  onOpenTrace,
}: {
  node?: GraphNode
  snapshot: GraphSnapshot
  onSelect: (id: string) => void
  labels: (typeof copy)[Locale]
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
      enabledKinds.has(node.kind) &&
      (normalizedQuery === '' ||
        node.label.toLocaleLowerCase().includes(normalizedQuery) ||
        node.id.toLocaleLowerCase().includes(normalizedQuery)),
  )
  const ids = new Set(nodes.map((node) => node.id))
  const edges = snapshot.edges.filter((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return false
    if (edge.kind === 'owns' && !showOwnership) return false
    return true
  })
  return { ...snapshot, nodes, edges }
}

function localApiUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
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
