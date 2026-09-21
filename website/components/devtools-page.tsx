'use client'

import {
  AlertTriangle,
  CircleDot,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GraphCanvas } from './devtools-graph/graph-canvas'
import {
  DevtoolsDiagnosticsDialog,
  DevtoolsSettingsDialog,
} from './devtools-dialogs'
import {
  graphNodeKindCopy,
  graphNodeKindStyles,
  Inspector,
  NodeTree,
  PaneTitle,
} from './devtools-graph-sidebars'
import { DevtoolsRuntimePane } from './devtools-runtime-pane'
import { graphNodeKinds, type GraphNodeKind } from '../lib/devtools'
import { buildDiagnosticAgentPrompt } from '../lib/devtools-diagnostics'
import { normalizeDevtoolsBaseUrl } from '../lib/devtools-client'
import type { Locale } from '../lib/i18n'
import {
  devtoolsRuntimeHref,
  parseDevtoolsRuntimeTarget,
} from '../lib/devtools-runtime-link'
import { filterDevtoolsGraph } from '../lib/devtools-graph-filter'
import { useDevtoolsGraphSession } from './use-devtools-graph-session'

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
    emptyGraph: 'No nodes match this graph.',
    emptyView: 'No nodes match this view.',
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
    reload: 'Graphを再生成',
    explorer: 'Explorer',
    search: 'Nodeを検索…',
    nodes: 'Nodes',
    filters: 'Filters',
    ownership: 'Ownership edges',
    emptyGraph: 'このGraphに一致するNodeはありません。',
    emptyView: 'このViewに一致するNodeはありません。',
    inspector: 'Inspector',
    selectNode: 'Nodeを選択すると、SemanticsとRelationshipsを確認できます。',
    relationships: 'Relationships',
    source: 'Source',
    attributes: 'Attributes',
    diagnostics: 'Diagnostics',
    diagnosticDetails: 'Diagnostics',
    noDiagnostics: '問題は検出されていません。',
    agentPrompt: 'Agent向けプロンプト',
    agentPromptHint:
      '現在のGraph診断を含む、Agent向けの修正プロンプトです。',
    copyPrompt: 'プロンプトをコピー',
    copied: 'コピーしました',
    close: '閉じる',
    noGraph: 'ローカルCLIを起動して接続すると、Graphを探索できます。',
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
  const [serverInitialized, setServerInitialized] = useState(false)
  const initialized = useRef(false)
  const graphHref = devtoolsWorkspaceHref(locale, 'graph')
  const traceHref = devtoolsWorkspaceHref(locale, 'trace')
  const {
    snapshot,
    connectionStatus,
    connected,
    reloading,
    error,
    stale,
    reload,
  } = useDevtoolsGraphSession(serverInitialized ? serverUrl : undefined)

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
          initialServerUrl = normalizeDevtoolsBaseUrl(stored)
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

  const openSettings = () => {
    setSettingsServerUrl(serverUrl)
    setSettingsError(undefined)
    setSettingsOpen(true)
  }

  const applySettings = () => {
    let nextServerUrl: string
    try {
      nextServerUrl = normalizeDevtoolsBaseUrl(settingsServerUrl)
    } catch {
      setSettingsError(text.invalidUrl)
      return
    }

    localStorage.setItem('loutre-devtools-url', nextServerUrl)
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

  const replaceWorkspace = (nextWorkspace: DevtoolsWorkspace, href: string) => {
    if (nextWorkspace === 'trace') {
      setRequestedTraceId(undefined)
      setRequestedSpanId(undefined)
    }
    setWorkspace(nextWorkspace)
    window.history.replaceState(window.history.state, '', href)
  }

  const displayedSnapshot = snapshot
  const graph = useMemo(
    () =>
      filterDevtoolsGraph(
        displayedSnapshot,
        query,
        enabledKinds,
        showOwnership,
      ),
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
                  emptyMessage={text.emptyGraph}
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
                          style={{
                            background: graphNodeKindStyles[kind].stroke,
                          }}
                        />
                        {graphNodeKindCopy[kind]}
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
                    emptyMessage={text.emptyView}
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
        <DevtoolsSettingsDialog
          labels={text}
          serverUrl={settingsServerUrl}
          error={settingsError}
          onServerUrlChange={(value) => {
            setSettingsServerUrl(value)
            setSettingsError(undefined)
          }}
          onClose={() => setSettingsOpen(false)}
          onApply={applySettings}
        />
      )}

      {diagnosticsOpen && displayedSnapshot && (
        <DevtoolsDiagnosticsDialog
          labels={text}
          snapshot={displayedSnapshot}
          agentPrompt={agentPrompt}
          copied={promptCopied}
          onCopied={() => setPromptCopied(true)}
          onClose={() => setDiagnosticsOpen(false)}
        />
      )}
    </main>
  )
}
