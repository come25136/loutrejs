'use client'

import { ExternalLink, GitBranch } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { GraphCanvas } from '../devtools-graph/graph-canvas'
import { Inspector, PaneTitle } from '../devtools-graph-sidebars'
import { localePrefix, type Locale } from '../../lib/i18n'
import { homeGraphSnapshot } from '../../lib/home-devtools-fixture'

const inspectorLabels = {
  en: {
    selectNode: 'Select a node to inspect its semantics and relationships.',
    source: 'Source',
    relationships: 'Relationships',
    attributes: 'Attributes',
    diagnostics: 'Diagnostics',
  },
  ja: {
    selectNode: 'Nodeを選択するとsemanticsとrelationshipsを確認できます。',
    source: 'Source',
    relationships: 'Relationships',
    attributes: 'Attributes',
    diagnostics: 'Diagnostics',
  },
} as const

export function DevtoolsShowcase({
  className = '',
  locale,
}: {
  readonly className?: string
  readonly locale: Locale
}) {
  const [selectedId, setSelectedId] = useState<string>('UsersController')
  const selected = homeGraphSnapshot.nodes.find(
    (node) => node.id === selectedId,
  )
  const prefix = localePrefix(locale)

  return (
    <div
      className={`loutre-devtools shadow-code overflow-hidden rounded-lg border border-line-strong bg-paper text-ink ${className}`}
      aria-label="Loutre DevTools Graph demo"
    >
      <div className="flex h-11 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Image
            src="/loutre.svg"
            width={20}
            height={20}
            alt=""
            className="size-5"
          />
          <span className="text-[10px] font-semibold">Loutre Dev</span>
        </div>
        <span className="rounded border border-line bg-surface-muted px-2 py-1 font-mono text-[8px] text-ink-muted">
          http-crud
        </span>
        <span className="ml-auto hidden items-center gap-1.5 font-mono text-[8px] text-ink-muted sm:inline-flex">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Demo Graph
        </span>
        <Link
          className="inline-flex items-center gap-1 text-[9px] font-semibold text-ink-soft transition hover:text-ink"
          href={`${prefix}/devtools/graph/`}
        >
          Open <ExternalLink size={11} aria-hidden="true" />
        </Link>
      </div>

      <div className="grid h-[345px] grid-cols-[minmax(0,1fr)_185px] sm:h-[420px] max-md:grid-cols-1">
        <div className="flex min-h-0 min-w-0 flex-col bg-surface-muted/35">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
            <GitBranch
              size={13}
              className="text-copper-dark"
              aria-hidden="true"
            />
            <strong className="text-[10px]">Graph</strong>
            <span className="font-mono text-[8px] text-ink-muted">
              9 nodes · 9 edges
            </span>
          </div>
          <div className="min-h-0 flex-1">
            <GraphCanvas
              graph={homeGraphSnapshot}
              emptyMessage="No nodes match this graph."
              selectedId={selectedId}
              showMiniMap={false}
              focusRequest={{
                nodeId: 'UsersController',
                nonce: 1,
                scope: 'neighbors',
              }}
              onSelect={(node) => setSelectedId(node?.id ?? '')}
            />
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface max-md:hidden">
          <PaneTitle title="Inspector" label="DETAILS" />
          <Inspector
            node={selected}
            snapshot={homeGraphSnapshot}
            onSelect={setSelectedId}
            labels={inspectorLabels[locale]}
            locale={locale}
            baseUrl="http://127.0.0.1:25136"
            connected={false}
            onOpenTrace={() => undefined}
          />
        </aside>
      </div>
    </div>
  )
}
