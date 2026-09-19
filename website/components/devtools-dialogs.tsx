'use client'

import { AlertTriangle, Copy, Settings, X } from 'lucide-react'
import type { GraphSnapshot } from '../lib/devtools'
import { diagnosticSource } from '../lib/devtools-diagnostics'
import { ThemePicker } from './theme-toggle'

interface SettingsLabels {
  readonly settings: string
  readonly theme: string
  readonly systemTheme: string
  readonly lightTheme: string
  readonly darkTheme: string
  readonly serverUrl: string
  readonly serverUrlHint: string
  readonly cancel: string
  readonly apply: string
}

export function DevtoolsSettingsDialog({
  labels,
  serverUrl,
  error,
  onServerUrlChange,
  onClose,
  onApply,
}: {
  readonly labels: SettingsLabels
  readonly serverUrl: string
  readonly error?: string
  readonly onServerUrlChange: (value: string) => void
  readonly onClose: () => void
  readonly onApply: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
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
            {labels.settings}
          </h2>
        </div>

        <div className="grid gap-5">
          <label className="block">
            <span className="text-[11px] font-semibold text-ink">
              {labels.theme}
            </span>
            <div className="mt-2">
              <ThemePicker
                systemLabel={labels.systemTheme}
                lightLabel={labels.lightTheme}
                darkLabel={labels.darkTheme}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold text-ink">
              {labels.serverUrl}
            </span>
            <span className="mt-1 block text-[10px] leading-4 text-ink-soft">
              {labels.serverUrlHint}
            </span>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-line bg-surface-muted/45 px-3 font-mono text-xs text-ink outline-none transition focus:border-line-strong"
              value={serverUrl}
              spellCheck={false}
              onChange={(event) => onServerUrlChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onApply()
                if (event.key === 'Escape') onClose()
              }}
            />
            {error && (
              <span className="mt-2 block text-[10px] text-red-600 dark:text-red-300">
                {error}
              </span>
            )}
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            className="h-9 rounded-lg border border-line px-3 text-xs font-semibold text-ink-soft transition hover:bg-surface-muted hover:text-ink"
            onClick={onClose}
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            className="h-9 rounded-lg bg-action px-4 text-xs font-semibold text-action-foreground transition hover:bg-action-hover"
            onClick={onApply}
          >
            {labels.apply}
          </button>
        </div>
      </section>
    </div>
  )
}

interface DiagnosticsLabels {
  readonly diagnostics: string
  readonly agentPromptHint: string
  readonly close: string
  readonly agentPrompt: string
  readonly copied: string
  readonly copyPrompt: string
}

export function DevtoolsDiagnosticsDialog({
  labels,
  snapshot,
  agentPrompt,
  copied,
  onCopied,
  onClose,
}: {
  readonly labels: DiagnosticsLabels
  readonly snapshot: GraphSnapshot
  readonly agentPrompt: string
  readonly copied: boolean
  readonly onCopied: () => void
  readonly onClose: () => void
}) {
  const diagnostics = snapshot.diagnostics
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
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
                {diagnostics.length} {labels.diagnostics}
              </h2>
              <p className="mt-1 text-[10px] text-ink-soft">
                {labels.agentPromptHint}
              </p>
            </div>
          </div>
          <button
            className="grid size-8 place-items-center rounded-md text-ink-soft transition hover:bg-surface-muted hover:text-ink"
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            title={labels.close}
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-5 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
          {diagnostics.map((diagnostic, index) => {
            const source = diagnosticSource(snapshot, diagnostic)
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
              {labels.agentPrompt}
            </h3>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[10px] font-semibold text-ink-soft transition hover:bg-surface-muted hover:text-ink"
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(agentPrompt)
                  .then(onCopied, () => undefined)
              }}
            >
              <Copy size={11} />
              {copied ? labels.copied : labels.copyPrompt}
            </button>
          </div>
          <textarea
            className="h-40 w-full resize-y rounded-lg border border-line bg-surface-muted/45 p-3 font-mono text-[10px] leading-5 text-ink outline-none"
            value={agentPrompt}
            readOnly
            aria-label={labels.agentPrompt}
          />
        </div>
      </section>
    </div>
  )
}
