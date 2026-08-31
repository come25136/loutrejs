'use client'

import mermaid from 'mermaid'
import { useEffect, useRef, useState } from 'react'
import type { Locale } from '../lib/i18n'

let renderSequence = 0

const mermaidCopy = {
  en: {
    label: 'Document diagram',
    loading: 'Loading diagram…',
  },
  ja: {
    label: 'ドキュメントの構成図',
    loading: '図を読み込んでいます…',
  },
} satisfies Record<Locale, Record<string, string>>

type Theme = 'light' | 'dark'

function initializeMermaid(theme: Theme) {
  const dark = theme === 'dark'

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      background: dark ? '#0a131d' : '#ffffff',
      primaryColor: dark ? '#0d1722' : '#f9fafb',
      primaryTextColor: dark ? '#f3f6f9' : '#111827',
      primaryBorderColor: dark ? '#32465f' : '#d1d5db',
      lineColor: dark ? '#5d7895' : '#6b7280',
      secondaryColor: dark ? '#211710' : '#fff7ed',
      tertiaryColor: dark ? '#081018' : '#ffffff',
      fontFamily: "'Inter Variable', 'Noto Sans JP', sans-serif",
      fontSize: '13px',
    },
    flowchart: {
      curve: 'basis',
      nodeSpacing: 18,
      rankSpacing: 24,
      padding: 8,
      useMaxWidth: true,
    },
  })
}

export function MermaidDiagram({
  chart,
  darkChart,
  locale,
  variant = 'card',
}: {
  chart: string
  darkChart?: string
  locale: Locale
  variant?: 'card' | 'embedded'
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderFailed, setRenderFailed] = useState(false)
  const [theme, setTheme] = useState<Theme>('light')
  const copy = mermaidCopy[locale]
  const embedded = variant === 'embedded'
  const renderedChart = theme === 'dark' && darkChart ? darkChart : chart

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () =>
      setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light')
    const observer = new MutationObserver(syncTheme)

    syncTheme()
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    let cancelled = false
    const renderId = `mermaid-${renderSequence++}`

    setRenderFailed(false)
    initializeMermaid(theme)

    void mermaid
      .render(renderId, renderedChart)
      .then(({ svg, bindFunctions }) => {
        if (cancelled) {
          return
        }

        container.innerHTML = svg
        bindFunctions?.(container)
      })
      .catch((error: unknown) => {
        document.getElementById(renderId)?.remove()
        console.error('Failed to render the Mermaid diagram.', error)

        if (!cancelled) {
          setRenderFailed(true)
        }
      })

    return () => {
      cancelled = true
      container.replaceChildren()
    }
  }, [renderedChart, theme])

  if (renderFailed) {
    return (
      <pre className="not-prose my-7 overflow-x-auto rounded-xl border border-white/10 bg-[#0f1419] p-6 text-sm text-[#e5e7eb] shadow-[0_16px_36px_rgba(17,24,39,0.12)]">
        <code>{renderedChart}</code>
      </pre>
    )
  }

  return (
    <figure
      className={
        embedded
          ? 'not-prose m-0 w-full min-w-0 bg-transparent'
          : 'not-prose my-7 overflow-x-auto rounded-xl border border-line bg-surface px-4 py-4 shadow-[0_16px_36px_rgba(17,24,39,0.08)] sm:px-5'
      }
    >
      <div
        ref={containerRef}
        className={
          embedded
            ? 'grid min-h-48 w-full min-w-0 place-items-center text-sm text-ink-soft [&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-w-full'
            : 'grid min-h-48 min-w-[36rem] place-items-center text-sm text-ink-soft [&_svg]:h-auto [&_svg]:max-w-full'
        }
        role="img"
        aria-label={copy.label}
      >
        {copy.loading}
      </div>
    </figure>
  )
}
