'use client'

import {
  Activity,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Check,
  Clock3,
  GitBranch,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { replayCapsule, type ReplayResult } from '../lib/devtools-runtime'
import { devtoolsErrorMessage } from '../lib/devtools-error'
import type { Locale } from '../lib/i18n'
import { devtoolsRuntimeHref } from '../lib/devtools-runtime-link'
import {
  Detail,
  formatDuration,
  formatTraceTime,
  HorizontalWaterfall,
  HttpStatusCode,
  JsonCodeBlock,
  RuntimeIdLink,
  RuntimeSection,
  shortId,
  traceHttpStatusCode,
  TraceStatus,
} from './devtools-runtime-presentation'
import { useDevtoolsRuntimeSession } from './use-devtools-runtime-session'

const copy = {
  en: {
    traces: 'Traces',
    pause: 'Pause updates',
    resume: 'Resume updates',
    noTrace: 'Run your application to capture an execution trace.',
    timeline: 'Timeline',
    waterfall: 'Waterfall',
    details: 'Execution details',
    arguments: 'Arguments',
    returnValue: 'Return',
    edit: 'Edit',
    preview: 'Preview',
    editRun: 'Edit & Run',
    replaying: 'Replaying…',
    result: 'Replay result',
    graph: 'Show in Graph',
    source: 'Replay source',
    clearHistory: 'Clear',
    linkCopied: 'Link copied',
    valueCopied: 'Value copied',
    runtimeNotConnected:
      'No Application runtime is connected. Ensure the Application started by loutre dev imports DevtoolsModule().',
  },
  ja: {
    traces: 'Traces',
    pause: '更新を一時停止',
    resume: '更新を再開',
    noTrace: 'Applicationを実行するとExecution traceがここに流れます。',
    timeline: 'Timeline',
    waterfall: 'Waterfall',
    details: 'Execution details',
    arguments: 'Arguments',
    returnValue: 'Return',
    edit: 'Edit',
    preview: 'Preview',
    editRun: 'Edit & Run',
    replaying: 'Replay中…',
    result: 'Replay result',
    graph: 'Graphで表示',
    source: 'Replay source',
    clearHistory: '消去',
    linkCopied: 'リンクをコピーしました',
    valueCopied: '値をコピーしました',
    runtimeNotConnected:
      'アプリケーションランタイムが接続されていません。loutre devで起動するアプリケーションでDevtoolsModule()をimportしてください。',
  },
} as const

interface RuntimePaneProps {
  readonly locale: Locale
  readonly baseUrl: string
  readonly connected: boolean
  readonly requestedTraceId?: string
  readonly requestedSpanId?: string
  readonly onNavigateRuntime: (traceId: string, spanId?: string) => void
  readonly onJumpToGraph: (graphNodeId: string) => void
}

export function DevtoolsRuntimePane({
  locale,
  baseUrl,
  connected,
  requestedTraceId,
  requestedSpanId,
  onNavigateRuntime,
  onJumpToGraph,
}: RuntimePaneProps) {
  const text = copy[locale]
  const [replayInput, setReplayInput] = useState('')
  const [editingArguments, setEditingArguments] = useState(false)
  const [replayResult, setReplayResult] = useState<ReplayResult>()
  const [replayError, setReplayError] = useState<string>()
  const [replaying, setReplaying] = useState(false)
  const [toast, setToast] = useState<string>()
  const {
    traces,
    selectedTrace,
    timeline,
    selectedSpanId,
    selectedTimeline,
    hasConnectedRuntime,
    runtimeError,
    paused,
    clearingHistory,
    selectTrace,
    selectSpan,
    togglePaused,
    clearHistory,
  } = useDevtoolsRuntimeSession({
    baseUrl,
    connected,
    requestedTraceId,
    requestedSpanId,
    onNavigateRuntime,
  })
  const selectedEvent = selectedTimeline?.start
  const selectedCapsule =
    selectedEvent && 'capsuleId' in selectedEvent
      ? selectedEvent.capsuleId
      : undefined
  const selectedInput =
    selectedEvent && 'input' in selectedEvent ? selectedEvent.input : undefined
  const selectedReturn = selectedTimeline?.end?.result

  useEffect(() => {
    setReplayResult(undefined)
    setReplayError(undefined)
    setEditingArguments(false)
    setReplayInput(
      selectedInput?.value === undefined
        ? ''
        : JSON.stringify(selectedInput.value, null, 2),
    )
  }, [selectedEvent?.spanId, selectedInput?.preview])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => {
      setToast((current) => (current === message ? undefined : current))
    }, 1800)
  }

  const copyText = async (
    value: string,
    message: string = text.valueCopied,
  ) => {
    await navigator.clipboard.writeText(value)
    showToast(message)
  }

  const copyPermalink = async (href: string) => {
    await copyText(
      new URL(href, window.location.href).toString(),
      text.linkCopied,
    )
  }

  const runReplay = async () => {
    if (!selectedCapsule) return
    let input: unknown
    try {
      input = replayInput.trim() === '' ? undefined : JSON.parse(replayInput)
    } catch {
      setReplayError('Arguments must be valid JSON.')
      return
    }
    setReplaying(true)
    setReplayError(undefined)
    setReplayResult(undefined)
    try {
      const result = await replayCapsule(baseUrl, selectedCapsule, input)
      setReplayResult(result)
      if (result.status === 'error') {
        setReplayError(result.error?.message ?? 'Replay failed.')
      }
    } catch (error) {
      setReplayError(devtoolsErrorMessage(error))
    } finally {
      setReplaying(false)
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(460px,1fr)_360px]">
      <aside className="min-h-0 overflow-y-auto border-r border-line bg-surface">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <strong className="flex items-center gap-2 text-xs">
            <Activity size={13} /> {text.traces}
          </strong>
          <div className="flex items-center gap-1.5">
            <button
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[9px] font-semibold text-ink-soft transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              title={text.clearHistory}
              disabled={traces.length === 0 || clearingHistory}
              onClick={() => void clearHistory()}
            >
              {clearingHistory ? (
                <RefreshCw size={10} className="animate-spin" />
              ) : (
                <Trash2 size={10} />
              )}
              {text.clearHistory}
            </button>
            <button
              className="grid size-7 place-items-center rounded-md border border-line bg-surface text-ink-muted transition hover:text-ink"
              type="button"
              title={paused ? text.resume : text.pause}
              onClick={togglePaused}
            >
              {paused ? <Play size={11} /> : <Pause size={11} />}
            </button>
          </div>
        </div>

        <div className="grid gap-1 p-2">
          {traces.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] leading-5 text-ink-muted">
              <p>{text.noTrace}</p>
              {!hasConnectedRuntime && (
                <p className="mt-3 rounded-md border border-amber-400/35 bg-amber-500/8 px-3 py-2 text-left text-amber-800 dark:text-amber-200">
                  {text.runtimeNotConnected}
                </p>
              )}
            </div>
          ) : (
            traces.map((trace) => (
              <button
                key={trace.traceId}
                className={`w-full min-w-0 overflow-hidden rounded-lg border border-l-2 px-3 py-2.5 text-left transition ${trace.traceId === selectedTrace?.traceId ? 'border-line-strong border-l-copper bg-surface-subtle shadow-sm' : 'border-transparent hover:border-line hover:bg-surface-muted'}`}
                type="button"
                onClick={() => {
                  selectTrace(trace.traceId)
                }}
              >
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                  <TraceStatus
                    status={trace.status}
                    httpStatusCode={traceHttpStatusCode(trace)}
                  />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-xs leading-5">
                      {trace.name}
                    </strong>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[9px]">
                      {traceHttpStatusCode(trace) !== undefined && (
                        <HttpStatusCode
                          statusCode={traceHttpStatusCode(trace)!}
                        />
                      )}
                      <span className="truncate text-ink-soft">
                        {trace.executionKind}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-right font-mono text-[9px] text-ink-soft">
                    <span className="block">
                      {formatDuration(trace.durationMs)}
                    </span>
                    <time
                      className="mt-0.5 block text-[9px] text-ink-soft"
                      dateTime={new Date(trace.startedAt).toISOString()}
                      title={new Date(trace.startedAt).toLocaleString()}
                    >
                      {formatTraceTime(trace.startedAt)}
                    </time>
                  </span>
                </div>
                {trace.replayedFromTraceId && (
                  <div className="mt-2 flex items-center gap-1 text-[9px] font-semibold text-copper-dark">
                    <RotateCcw size={8} /> replay
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col bg-paper">
        <div className="flex h-12 items-center gap-3 border-b border-line bg-surface px-4">
          <GitBranch size={13} className="text-ink-muted" />
          <div className="min-w-0">
            <strong className="block truncate text-sm">
              {selectedTrace?.name ?? text.timeline}
            </strong>
            {selectedTrace && (
              <span className="block truncate font-mono text-[9px] text-ink-soft">
                <RuntimeIdLink
                  href={devtoolsRuntimeHref(selectedTrace.traceId)}
                  onCopy={() =>
                    void copyPermalink(
                      devtoolsRuntimeHref(selectedTrace.traceId),
                    )
                  }
                  title={selectedTrace.traceId}
                >
                  {shortId(selectedTrace.traceId)}
                </RuntimeIdLink>{' '}
                · {selectedTrace.executionKind}
              </span>
            )}
          </div>
          {runtimeError && (
            <span className="ml-auto truncate text-[9px] text-red-600">
              {runtimeError}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {timeline.entries.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-xs text-ink-muted">
              <div>
                <Clock3 size={28} className="mx-auto mb-3" />
                {text.noTrace}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl">
              <div className="mb-3">
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.1em] text-ink-soft uppercase">
                  <Clock3 size={11} /> {text.waterfall}
                </div>
                <div className="mt-1 font-mono text-[10px] text-ink-soft">
                  0 → {formatDuration(timeline.durationMs)}
                </div>
              </div>

              <HorizontalWaterfall
                entries={timeline.entries}
                durationMs={timeline.durationMs}
                selectedSpanId={selectedSpanId}
                onSelect={selectSpan}
              />
            </div>
          )}
        </div>
      </section>

      <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface">
        <div className="flex h-12 items-center justify-between border-b border-line px-4">
          <strong className="text-xs">{text.details}</strong>
          {selectedEvent?.graphNodeId && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-copper-dark hover:underline"
              onClick={() => onJumpToGraph(selectedEvent.graphNodeId!)}
            >
              {text.graph} <SquareArrowOutUpRight size={9} />
            </button>
          )}
        </div>

        {!selectedEvent ? (
          <div className="grid min-h-56 place-items-center p-7 text-center text-xs leading-5 text-ink-muted">
            <CircleDot size={24} className="mb-3" />
          </div>
        ) : (
          <div className="p-4">
            <RuntimeSection title="Span">
              <dl className="grid gap-2.5 text-[11px] leading-5">
                <Detail
                  label="name"
                  value={selectedEvent.name}
                  copyValue={selectedEvent.name}
                  onCopy={copyText}
                />
                <Detail
                  label="span id"
                  value={
                    <RuntimeIdLink
                      href={devtoolsRuntimeHref(
                        selectedEvent.traceId,
                        selectedEvent.spanId,
                      )}
                      onCopy={() =>
                        void copyPermalink(
                          devtoolsRuntimeHref(
                            selectedEvent.traceId,
                            selectedEvent.spanId,
                          ),
                        )
                      }
                      title={selectedEvent.spanId}
                    >
                      {shortId(selectedEvent.spanId)}
                    </RuntimeIdLink>
                  }
                  mono
                />
                <Detail
                  label="node"
                  value={selectedEvent.graphNodeId ?? '—'}
                  copyValue={selectedEvent.graphNodeId}
                  onCopy={copyText}
                  mono
                />
                {selectedTimeline?.end && (
                  <Detail
                    label="duration"
                    value={formatDuration(selectedTimeline.end.durationMs)}
                    copyValue={formatDuration(selectedTimeline.end.durationMs)}
                    onCopy={copyText}
                    mono
                  />
                )}
              </dl>
            </RuntimeSection>

            {selectedTrace?.replayedFromTraceId &&
              selectedEvent.type === 'execution.started' && (
                <RuntimeSection title={text.source}>
                  <div className="rounded-md border border-copper/20 bg-copper/5 p-2.5 font-mono text-[10px] text-copper-dark">
                    {shortId(selectedTrace.replayedFromTraceId)}
                  </div>
                </RuntimeSection>
              )}

            {selectedInput && (
              <RuntimeSection title={text.arguments}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  {selectedInput.redacted ? (
                    <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                      <CircleAlert size={10} /> redacted
                    </p>
                  ) : (
                    <span />
                  )}
                  {selectedInput.value !== undefined && selectedCapsule && (
                    <button
                      type="button"
                      className="rounded-md border border-line bg-surface px-2 py-1 text-[10px] font-semibold text-ink-soft transition hover:border-line-strong hover:text-ink"
                      onClick={() => setEditingArguments((value) => !value)}
                    >
                      {editingArguments ? text.preview : text.edit}
                    </button>
                  )}
                </div>
                {selectedInput.value !== undefined && editingArguments ? (
                  <textarea
                    className="min-h-36 w-full resize-y rounded-lg border border-line bg-surface-muted p-3 font-mono text-[11px] leading-5 text-ink outline-none focus:border-interaction"
                    value={replayInput}
                    spellCheck={false}
                    onChange={(event) => setReplayInput(event.target.value)}
                  />
                ) : (
                  <JsonCodeBlock
                    value={selectedInput.value}
                    fallback={selectedInput.preview}
                    onCopy={copyText}
                  />
                )}
              </RuntimeSection>
            )}

            {selectedReturn && (
              <RuntimeSection title={text.returnValue}>
                {selectedReturn.redacted && (
                  <p className="mb-2 flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                    <CircleAlert size={11} /> redacted
                  </p>
                )}
                <JsonCodeBlock
                  value={selectedReturn.value}
                  fallback={selectedReturn.preview}
                  maxHeight="max-h-56"
                  onCopy={copyText}
                />
              </RuntimeSection>
            )}

            {selectedCapsule && selectedInput?.value !== undefined && (
              <RuntimeSection title="Replay">
                <button
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-action px-3 text-xs font-semibold text-action-foreground transition hover:bg-action-hover disabled:opacity-50"
                  type="button"
                  disabled={replaying}
                  onClick={() => void runReplay()}
                >
                  {replaying ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  {replaying ? text.replaying : text.editRun}
                </button>
                {replayError && (
                  <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/8 p-3 text-[10px] text-red-700 dark:text-red-300">
                    {replayError}
                  </div>
                )}
                {replayResult?.status === 'ok' && (
                  <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/8 p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      <CircleCheck size={10} /> {text.result}
                    </div>
                    <JsonCodeBlock
                      value={replayResult.result?.value}
                      fallback={replayResult.result?.preview ?? '(void)'}
                      maxHeight="max-h-48"
                      borderless
                      onCopy={copyText}
                    />
                  </div>
                )}
              </RuntimeSection>
            )}

            {'attributes' in selectedEvent && selectedEvent.attributes && (
              <RuntimeSection title="Attributes">
                <JsonCodeBlock
                  value={selectedEvent.attributes}
                  onCopy={copyText}
                />
              </RuntimeSection>
            )}
          </div>
        )}
      </aside>
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-[11px] font-semibold text-ink shadow-lg"
        >
          <Check size={12} className="text-emerald-600" />
          {toast}
        </div>
      )}
    </div>
  )
}
