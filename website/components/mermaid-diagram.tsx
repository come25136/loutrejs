'use client'

import mermaid from 'mermaid'
import { useEffect, useRef, useState } from 'react'

let renderSequence = 0

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  themeVariables: {
    background: '#ffffff',
    primaryColor: '#f9fafb',
    primaryTextColor: '#111827',
    primaryBorderColor: '#d1d5db',
    lineColor: '#6b7280',
    secondaryColor: '#fff7ed',
    tertiaryColor: '#ffffff',
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

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [renderFailed, setRenderFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    let cancelled = false
    const renderId = `mermaid-${renderSequence++}`

    setRenderFailed(false)

    void mermaid
      .render(renderId, chart)
      .then(({ svg, bindFunctions }) => {
        if (cancelled) {
          return
        }

        container.innerHTML = svg
        bindFunctions?.(container)
      })
      .catch((error: unknown) => {
        document.getElementById(renderId)?.remove()
        console.error('Mermaidの描画に失敗しました。', error)

        if (!cancelled) {
          setRenderFailed(true)
        }
      })

    return () => {
      cancelled = true
      container.replaceChildren()
    }
  }, [chart])

  if (renderFailed) {
    return (
      <pre className="not-prose my-7 overflow-x-auto rounded-xl border border-white/10 bg-[#0f1419] p-6 text-sm text-[#e5e7eb] shadow-[0_16px_36px_rgba(17,24,39,0.12)]">
        <code>{chart}</code>
      </pre>
    )
  }

  return (
    <figure className="not-prose my-7 overflow-x-auto rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-[0_16px_36px_rgba(17,24,39,0.08)] sm:px-5">
      <div
        ref={containerRef}
        className="grid min-h-48 min-w-[36rem] place-items-center text-sm text-gray-500 [&_svg]:h-auto [&_svg]:max-w-full"
        role="img"
        aria-label="ドキュメントの構成図"
      >
        図を読み込んでいます…
      </div>
    </figure>
  )
}
