'use client'

import {
  Activity,
  Braces,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Copy,
  Route,
  Zap,
} from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import { useMemo } from 'react'
import type { DevtoolsTraceSummary } from '../lib/devtools-runtime'
import type { TimelineEntry } from '../lib/devtools-timeline'

hljs.registerLanguage('json', json)

export function JsonCodeBlock({
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

export function HorizontalWaterfall({
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

export function traceHttpStatusCode(
  trace: DevtoolsTraceSummary,
): number | undefined {
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

export function HttpStatusCode({ statusCode }: { statusCode: number }) {
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

export function TraceStatus({
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

export function RuntimeIdLink({
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

export function RuntimeSection({
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

export function Detail({
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

export function shortId(value: string): string {
  return value.length <= 22 ? value : `${value.slice(0, 11)}…${value.slice(-7)}`
}

export function formatDuration(value: number | undefined): string {
  if (value === undefined) return '…'
  if (value < 1) return `${value.toFixed(2)}ms`
  if (value < 1_000) return `${value.toFixed(value < 10 ? 1 : 0)}ms`
  return `${(value / 1_000).toFixed(2)}s`
}

export function formatTraceTime(value: number): string {
  const date = new Date(value)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds(),
  )}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
