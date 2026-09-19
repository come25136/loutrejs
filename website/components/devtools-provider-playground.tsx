'use client'

import { Braces, CircleAlert, Play, SquareArrowOutUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchProviderPlayground,
  invokeProviderMethod,
  type ProviderMethodInvocationResult,
  type ProviderPlaygroundDescriptor,
} from '../lib/devtools-runtime'
import { devtoolsErrorMessage } from '../lib/devtools-error'
import type { Locale } from '../lib/i18n'

const copy = {
  en: {
    methods: 'Methods',
    arguments: 'Arguments',
    run: 'Run',
    running: 'Running…',
    result: 'Result',
    openTrace: 'Open Trace',
    noMethods: 'No callable methods were found on this provider.',
    unavailable: 'Connect the application runtime to use Playground.',
    argsHint: 'JSON array, e.g. [123, { "name": "Loutre" }]',
    invalidArgs: 'Arguments must be a JSON array.',
  },
  ja: {
    methods: 'Methods',
    arguments: 'Arguments',
    run: '実行',
    running: '実行中…',
    result: 'Result',
    openTrace: 'Traceを開く',
    noMethods: 'このProviderに呼び出せるmethodはありません。',
    unavailable: 'Playgroundを使うにはApplication runtimeへ接続してください。',
    argsHint: 'JSON配列。例: [123, { "name": "Loutre" }]',
    invalidArgs: 'ArgumentsはJSON配列で指定してください。',
  },
} as const

interface ProviderPlaygroundProps {
  readonly locale: Locale
  readonly baseUrl: string
  readonly connected: boolean
  readonly graphNodeId: string
  readonly onOpenTrace: (traceId: string) => void
}

export function DevtoolsProviderPlayground({
  locale,
  baseUrl,
  connected,
  graphNodeId,
  onOpenTrace,
}: ProviderPlaygroundProps) {
  const text = copy[locale]
  const [descriptor, setDescriptor] = useState<ProviderPlaygroundDescriptor>()
  const [selectedMethod, setSelectedMethod] = useState<string>()
  const [argsText, setArgsText] = useState('[]')
  const [result, setResult] = useState<ProviderMethodInvocationResult>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    setDescriptor(undefined)
    setSelectedMethod(undefined)
    setArgsText('[]')
    setResult(undefined)
    setError(undefined)
    if (!connected) return
    let active = true
    setLoading(true)
    void fetchProviderPlayground(baseUrl, graphNodeId)
      .then((next) => {
        if (!active) return
        setDescriptor(next)
        setSelectedMethod(next.methods[0]?.name)
      })
      .catch((cause: unknown) => {
        if (active) setError(devtoolsErrorMessage(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [baseUrl, connected, graphNodeId])

  const run = async () => {
    if (!selectedMethod || running) return
    let args: unknown
    try {
      args = JSON.parse(argsText)
    } catch {
      setError(text.invalidArgs)
      return
    }
    if (!Array.isArray(args)) {
      setError(text.invalidArgs)
      return
    }
    setRunning(true)
    setError(undefined)
    setResult(undefined)
    try {
      const next = await invokeProviderMethod(
        baseUrl,
        graphNodeId,
        selectedMethod,
        args,
      )
      setResult(next)
      if (next.status === 'error') {
        setError(next.error?.message ?? 'Provider method invocation failed.')
      }
    } catch (cause) {
      setError(devtoolsErrorMessage(cause))
    } finally {
      setRunning(false)
    }
  }

  if (!connected) {
    return (
      <p className="text-[10px] leading-4 text-ink-muted">{text.unavailable}</p>
    )
  }
  if (loading) {
    return <p className="text-[10px] text-ink-muted">Loading Playground…</p>
  }
  if (!descriptor && error) {
    return (
      <div className="flex items-start gap-2 text-[10px] leading-4 text-red-700 dark:text-red-300">
        <CircleAlert size={12} className="mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    )
  }
  if (!descriptor || descriptor.methods.length === 0) {
    return (
      <p className="text-[10px] leading-4 text-ink-muted">{text.noMethods}</p>
    )
  }

  return (
    <div className="grid gap-3">
      <div>
        <p className="mb-2 text-[9px] font-bold tracking-[0.12em] text-ink-muted uppercase">
          {text.methods}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {descriptor.methods.map((method) => (
            <button
              key={method.name}
              type="button"
              className={`rounded-md border px-2 py-1.5 font-mono text-[9px] transition ${selectedMethod === method.name ? 'border-copper bg-copper/8 text-ink' : 'border-line text-ink-soft hover:border-line-strong hover:bg-surface-muted'}`}
              onClick={() => {
                setSelectedMethod(method.name)
                setArgsText('[]')
                setResult(undefined)
                setError(undefined)
              }}
              title={`${method.arity} argument${method.arity === 1 ? '' : 's'}`}
            >
              {method.name}({method.arity})
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[9px] font-bold tracking-[0.12em] text-ink-muted uppercase">
            {text.arguments}
          </p>
          <Braces size={11} className="text-ink-muted" />
        </div>
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-line bg-paper p-2.5 font-mono text-[10px] leading-4 text-ink outline-none focus:border-line-strong"
          value={argsText}
          onChange={(event) => setArgsText(event.target.value)}
          placeholder={text.argsHint}
          spellCheck={false}
        />
      </div>

      <button
        type="button"
        className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-action px-3 text-[10px] font-semibold text-action-foreground transition hover:bg-action-hover disabled:opacity-50"
        onClick={() => void run()}
        disabled={running || !selectedMethod}
      >
        <Play size={11} /> {running ? text.running : text.run}
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-400/25 bg-red-500/8 p-2.5 text-[10px] leading-4 text-red-700 dark:text-red-300">
          <CircleAlert size={12} className="mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {result?.status === 'ok' && (
        <div className="rounded-md border border-line bg-surface-muted/45 p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-[9px] tracking-[0.12em] text-ink-muted uppercase">
              {text.result}
            </strong>
            {result.traceId && (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[9px] font-semibold text-copper-dark hover:underline"
                onClick={() => onOpenTrace(result.traceId!)}
              >
                {text.openTrace} <SquareArrowOutUpRight size={10} />
              </button>
            )}
          </div>
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-ink">
            {previewText(result.result)}
          </pre>
        </div>
      )}
    </div>
  )
}

function previewText(value: ProviderMethodInvocationResult['result']): string {
  if (!value) return 'undefined'
  if (value.value !== undefined) {
    try {
      return JSON.stringify(value.value, null, 2)
    } catch {
      return value.preview
    }
  }
  return value.preview
}
