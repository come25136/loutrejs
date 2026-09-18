'use client'

import {
  Activity,
  Braces,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Check,
  Copy,
  Clock3,
  GitBranch,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Route,
  SquareArrowOutUpRight,
  Zap,
} from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import { useEffect, useMemo, useState } from 'react'
import {
  clearTraces,
  fetchTrace,
  fetchTraces,
  replayCapsule,
  subscribeRuntimeEvents,
  type DevtoolsTraceSummary,
  type ReplayResult,
  type RuntimeEvent,
} from '../lib/devtools-runtime'
import { buildTimeline, type TimelineEntry } from '../lib/devtools-timeline'
import type { Locale } from '../lib/i18n'
import { devtoolsRuntimeHref } from '../lib/devtools-runtime-link'

hljs.registerLanguage('json', json)

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
  },
  ja: {
    traces: 'Traces',
    pause: '更新を一時停止',
    resume: '更新を再開',
    noTrace: 'Applicationを実行するとExecution traceがここに流れる。',
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
  const [traces, setTraces] = useState<readonly DevtoolsTraceSummary[]>([])
  const [selectedTraceId, setSelectedTraceId] = useState<string>()
  const [events, setEvents] = useState<readonly RuntimeEvent[]>([])
  const [selectedSpanId, setSelectedSpanId] = useState<string>()
  const [runtimeError, setRuntimeError] = useState<string>()
  const [paused, setPaused] = useState(false)
  const [replayInput, setReplayInput] = useState('')
  const [editingArguments, setEditingArguments] = useState(false)
  const [replayResult, setReplayResult] = useState<ReplayResult>()
  const [replayError, setReplayError] = useState<string>()
  const [replaying, setReplaying] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [runtimeRevision, setRuntimeRevision] = useState(0)
  const [toast, setToast] = useState<string>()

  useEffect(() => {
    setTraces([])
    setEvents([])
    setSelectedTraceId(undefined)
    setSelectedSpanId(undefined)
    setRuntimeError(undefined)
  }, [baseUrl])

  useEffect(() => {
    if (!requestedTraceId) return
    setSelectedTraceId(requestedTraceId)
    setSelectedSpanId(requestedSpanId)
  }, [requestedSpanId, requestedTraceId])

  useEffect(() => {
    if (!connected || paused) return
    const unsubscribe = subscribeRuntimeEvents(baseUrl, () => {
      setRuntimeRevision((revision) => revision + 1)
    })
    return unsubscribe
  }, [baseUrl, connected, paused])

  useEffect(() => {
    if (!connected || paused) return
    let active = true
    void fetchTraces(baseUrl)
      .then((nextTraces) => {
        if (!active) return
        setTraces(nextTraces)
        setRuntimeError(undefined)
        setSelectedTraceId((current) =>
          current && nextTraces.some((trace) => trace.traceId === current)
            ? current
            : nextTraces[0]?.traceId,
        )
      })
      .catch((error: unknown) => {
        if (active) setRuntimeError(errorMessage(error))
      })
    return () => {
      active = false
    }
  }, [baseUrl, connected, paused, runtimeRevision])

  useEffect(() => {
    if (!connected || !selectedTraceId || paused) return
    let active = true
    void fetchTrace(baseUrl, selectedTraceId)
      .then((nextEvents) => {
        if (!active) return
        setEvents(nextEvents)
        setSelectedSpanId((current) =>
          current && nextEvents.some((event) => event.spanId === current)
            ? current
            : buildTimeline(nextEvents).entries[0]?.start.spanId,
        )
      })
      .catch((error: unknown) => {
        if (active) setRuntimeError(errorMessage(error))
      })
    return () => {
      active = false
    }
  }, [baseUrl, connected, paused, runtimeRevision, selectedTraceId])

  const selectedTrace = traces.find(
    (trace) => trace.traceId === selectedTraceId,
  )
  const timeline = useMemo(() => buildTimeline(events), [events])
  const selectedTimeline = timeline.entries.find(
    (entry) => entry.start.spanId === selectedSpanId,
  )
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

  const selectSpan = (spanId: string) => {
    setSelectedSpanId(spanId)
    if (selectedTraceId) onNavigateRuntime(selectedTraceId, spanId)
  }

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

  const clearHistory = async () => {
    if (clearingHistory) return
    setClearingHistory(true)
    setRuntimeError(undefined)
    try {
      await clearTraces(baseUrl)
      setTraces([])
      setEvents([])
      setSelectedTraceId(undefined)
      setSelectedSpanId(undefined)
      setReplayResult(undefined)
      setReplayError(undefined)
      setEditingArguments(false)
    } catch (error) {
      setRuntimeError(errorMessage(error))
    } finally {
      setClearingHistory(false)
    }
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
      setReplayError(errorMessage(error))
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
              onClick={() => setPaused((current) => !current)}
            >
              {paused ? <Play size={11} /> : <Pause size={11} />}
            </button>
          </div>
        </div>

        <div className="grid gap-1 p-2">
          {traces.length === 0 ? (
            <p className="px-3 py-8 text-center text-[11px] leading-5 text-ink-muted">
              {text.noTrace}
            </p>
          ) : (
            traces.map((trace) => (
              <button
                key={trace.traceId}
                className={`w-full min-w-0 overflow-hidden rounded-lg border border-l-2 px-3 py-2.5 text-left transition ${trace.traceId === selectedTraceId ? 'border-line-strong border-l-copper bg-surface-subtle shadow-sm' : 'border-transparent hover:border-line hover:bg-surface-muted'}`}
                type="button"
                onClick={() => {
                  setSelectedTraceId(trace.traceId)
                  setSelectedSpanId(undefined)
                  onNavigateRuntime(trace.traceId)
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

function JsonCodeBlock({
  value,
  fallback,
  maxHeight = 'max-h-72',
  borderless = false,
  onCopy,
}: {
  value?: unknown
  fallback?: string
  maxHeight?: string
  borderless?: boolean
  onCopy?: (value: string) => void | Promise<void>
}) {
  const source =
    value === undefined
      ? (fallback ?? '(undefined)')
      : JSON.stringify(value, null, 2)
  const highlighted = useMemo(() => {
    try {
      return hljs.highlight(source, { language: 'json', ignoreIllegals: true })
        .value
    } catch {
      return escapeHtml(source)
    }
  }, [source])
  return (
    <div className="group/copy relative">
      <pre
        className={`${maxHeight} overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-ink ${borderless ? '' : 'rounded-lg border border-line bg-surface-subtle/70 p-3'} ${onCopy ? 'pr-8' : ''} [&_.hljs-attr]:text-sky-700 [&_.hljs-keyword]:text-violet-700 [&_.hljs-literal]:font-semibold [&_.hljs-literal]:text-violet-700 [&_.hljs-number]:text-amber-700 [&_.hljs-punctuation]:text-ink-soft [&_.hljs-string]:text-emerald-700 dark:[&_.hljs-attr]:text-sky-300 dark:[&_.hljs-keyword]:text-violet-300 dark:[&_.hljs-literal]:text-violet-300 dark:[&_.hljs-number]:text-amber-300 dark:[&_.hljs-string]:text-emerald-300`}
      >
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      {onCopy && (
        <button
          type="button"
          title="Copy value"
          aria-label="Copy value"
          className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md border border-line bg-surface text-ink-soft opacity-0 shadow-sm transition hover:text-ink group-hover/copy:opacity-100 focus-visible:opacity-100"
          onClick={() => void onCopy(source)}
        >
          <Copy size={11} />
        </button>
      )}
    </div>
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const timelineTicks = [0, 0.25, 0.5, 0.75, 1] as const

function HorizontalWaterfall({
  entries,
  durationMs,
  selectedSpanId,
  onSelect,
}: {
  entries: readonly TimelineEntry[]
  durationMs: number
  selectedSpanId?: string
  onSelect: (spanId: string) => void
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="grid grid-cols-[minmax(180px,230px)_minmax(260px,1fr)] border-b border-line bg-surface-subtle/70">
        <div className="flex h-9 items-center px-3 text-[9px] font-bold tracking-[0.1em] text-ink-soft uppercase">
          Span
        </div>
        <div className="relative h-9 border-l border-line">
          {timelineTicks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-y-0"
              style={{ left: `${tick * 100}%` }}
            >
              <span
                className={`absolute top-2 font-mono text-[9px] text-ink-soft ${tick === 0 ? 'left-1' : tick === 1 ? 'right-1' : '-translate-x-1/2'}`}
              >
                {formatAxisTime(durationMs * tick)}
              </span>
            </div>
          ))}
        </div>
      </div>
      {entries.map((entry) => {
        const start = entry.start
        const kind = timelineKind(entry)
        const tone = timelineTone(entry)
        const left = percent(entry.offsetMs, durationMs)
        const rawWidth = percent(entry.durationMs ?? 0, durationMs)
        const width = Math.max(0.7, Math.min(100 - left, rawWidth))
        const selected = start.spanId === selectedSpanId
        return (
          <div
            key={`${start.spanId}:${start.seq}`}
            className="grid min-h-12 grid-cols-[minmax(180px,230px)_minmax(260px,1fr)] border-b border-line/70 last:border-b-0"
          >
            <button
              type="button"
              className={`min-w-0 px-3 py-2 text-left transition hover:bg-surface-muted/60 ${selected ? 'bg-surface-subtle' : ''}`}
              onClick={() => onSelect(start.spanId)}
            >
              <div
                className="flex min-w-0 items-center gap-2"
                style={{ paddingLeft: Math.min(entry.depth, 6) * 12 }}
              >
                <TimelineIcon entry={entry} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[11px] leading-4">
                    {start.name}
                  </strong>
                  <span className="mt-0.5 block truncate font-mono text-[9px] text-ink-soft">
                    {kind} · {formatDuration(entry.durationMs)}
                  </span>
                </span>
              </div>
            </button>
            <div className="relative min-h-12 border-l border-line bg-surface-muted/25">
              {timelineTicks.map((tick) => (
                <span
                  key={tick}
                  className="absolute inset-y-0 border-l border-line/55"
                  style={{ left: `${tick * 100}%` }}
                />
              ))}
              <button
                type="button"
                title={`${start.name} · ${formatDuration(entry.durationMs)}`}
                aria-label={`${start.name}, ${formatDuration(entry.durationMs)}`}
                className={`absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded border transition hover:brightness-95 ${tone} ${selected ? 'z-10 ring-2 ring-copper/35' : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => onSelect(start.spanId)}
              >
                {width >= 13 && (
                  <span className="block truncate px-1.5 text-left font-mono text-[9px] font-semibold">
                    {start.name}
                  </span>
                )}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TimelineIcon({
  entry,
  compact = false,
}: {
  entry: TimelineEntry
  compact?: boolean
}) {
  const isRoot = entry.start.type === 'execution.started'
  const kind = timelineKind(entry)
  const size = compact ? 9 : 10
  return (
    <span
      className={`grid shrink-0 place-items-center rounded ${compact ? 'size-4' : 'size-5'} ${isRoot ? 'bg-copper/10 text-copper-dark' : kind === 'provider.method' ? 'bg-moss/10 text-moss' : 'bg-surface-subtle text-ink-soft'}`}
    >
      {isRoot ? (
        <Route size={size} />
      ) : kind === 'provider.method' ? (
        <Zap size={size} />
      ) : (
        <Activity size={size} />
      )}
    </span>
  )
}

function timelineKind(entry: TimelineEntry): string {
  return entry.start.type === 'span.started'
    ? entry.start.kind
    : entry.start.executionKind
}

function timelineTone(entry: TimelineEntry): string {
  const kind = timelineKind(entry)
  if (entry.end?.status === 'error')
    return 'border-red-400/45 bg-red-500/12 text-red-700 dark:text-red-300'
  if (entry.end?.status === 'cancelled')
    return 'border-amber-400/45 bg-amber-500/12 text-amber-700 dark:text-amber-300'
  if (entry.start.type === 'execution.started')
    return 'border-copper/40 bg-copper/10 text-ink'
  if (kind === 'provider.method') return 'border-moss/35 bg-moss/8 text-ink'
  return 'border-line-strong bg-surface-muted text-ink'
}

function percent(value: number, durationMs: number): number {
  return Math.max(0, Math.min(100, (value / Math.max(durationMs, 0.01)) * 100))
}

function formatAxisTime(value: number): string {
  if (value < 1) return `${value.toFixed(1)}ms`
  if (value < 1_000) return `${Math.round(value)}ms`
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`
}

function traceHttpStatusCode(trace: DevtoolsTraceSummary): number | undefined {
  const value = trace.attributes?.['http.status_code']
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined
}

function httpStatusTone(
  statusCode: number,
): 'ok' | 'redirect' | 'client' | 'server' {
  if (statusCode >= 500) return 'server'
  if (statusCode >= 400) return 'client'
  if (statusCode >= 300) return 'redirect'
  return 'ok'
}

function HttpStatusCode({ statusCode }: { statusCode: number }) {
  const tone = httpStatusTone(statusCode)
  const className =
    tone === 'server'
      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
      : tone === 'client'
        ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
        : tone === 'ok'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
  return (
    <span className={`shrink-0 rounded px-1 py-px font-semibold ${className}`}>
      {statusCode}
    </span>
  )
}

function TraceStatus({
  status,
  httpStatusCode,
}: {
  status: DevtoolsTraceSummary['status']
  httpStatusCode?: number
}) {
  const httpTone =
    httpStatusCode === undefined ? undefined : httpStatusTone(httpStatusCode)
  if (httpTone === 'server')
    return <CircleAlert size={11} className="mt-0.5 shrink-0 text-red-500" />
  if (httpTone === 'client')
    return <CircleAlert size={11} className="mt-0.5 shrink-0 text-amber-500" />
  if (status === 'ok')
    return (
      <CircleCheck size={11} className="mt-0.5 shrink-0 text-emerald-500" />
    )
  if (status === 'error')
    return <CircleAlert size={11} className="mt-0.5 shrink-0 text-red-500" />
  if (status === 'cancelled')
    return <CircleAlert size={11} className="mt-0.5 shrink-0 text-amber-500" />
  return (
    <CircleDot
      size={11}
      className="mt-0.5 shrink-0 animate-pulse text-copper"
    />
  )
}

function RuntimeIdLink({
  href,
  onCopy,
  title,
  children,
}: {
  href: string
  onCopy: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      title={`${title} · click to copy link`}
      className="group/id inline-flex items-center gap-1 text-ink-soft underline decoration-line-strong underline-offset-2 transition hover:text-copper-dark"
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return
        }
        event.preventDefault()
        onCopy()
      }}
    >
      <span>{children}</span>
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-ink-soft opacity-0 transition group-hover/id:opacity-100">
        <Copy size={10} />
      </span>
    </a>
  )
}

function RuntimeSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-line py-4 first:pt-0 last:border-b-0">
      <h3 className="mb-3 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-ink-soft uppercase">
        <Braces size={9} /> {title}
      </h3>
      {children}
    </section>
  )
}

function Detail({
  label,
  value,
  copyValue,
  onCopy,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  copyValue?: string
  onCopy?: (value: string) => void | Promise<void>
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2">
      <dt className="font-medium text-ink-soft">{label}</dt>
      <dd
        className={`group/copy m-0 flex min-w-0 items-start gap-1 break-all text-ink ${mono ? 'font-mono' : ''}`}
      >
        <span className="min-w-0">{value}</span>
        {copyValue !== undefined && onCopy && (
          <button
            type="button"
            title="Copy value"
            aria-label={`Copy ${label}`}
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-ink-soft opacity-0 transition hover:bg-surface-muted hover:text-ink group-hover/copy:opacity-100 focus-visible:opacity-100"
            onClick={() => void onCopy(copyValue)}
          >
            <Copy size={10} />
          </button>
        )}
      </dd>
    </div>
  )
}

function shortId(value: string): string {
  return value.length <= 22 ? value : `${value.slice(0, 11)}…${value.slice(-7)}`
}

function formatDuration(value: number | undefined): string {
  if (value === undefined) return '…'
  if (value < 1) return `${value.toFixed(2)}ms`
  if (value < 1_000) return `${value.toFixed(value < 10 ? 1 : 0)}ms`
  return `${(value / 1_000).toFixed(2)}s`
}

function formatTraceTime(value: number): string {
  const date = new Date(value)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds(),
  )}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
