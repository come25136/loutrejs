import { useId } from 'react'
import type { Locale } from '../../lib/i18n'
import type { batchResolutionCopy } from '../../lib/batch-resolution-copy'

type DiagramCopy = (typeof batchResolutionCopy)[Locale]['diagram']
const items = ['A', 'B', 'C'] as const

function ResolutionFlow({
  batched,
  copy,
}: {
  readonly batched: boolean
  readonly copy: DiagramCopy
}) {
  const markerId = useId()
  const color = batched ? 'var(--site-accent-text)' : 'var(--site-ink-soft)'

  return (
    <svg
      role="img"
      aria-label={batched ? copy.batchLabel : copy.normalLabel}
      viewBox="0 0 360 194"
      className="mx-auto w-full max-w-[400px]"
    >
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10Z" fill={color} />
        </marker>
      </defs>
      <text
        x="180"
        y="14"
        textAnchor="middle"
        fontSize="12"
        className="fill-ink-soft"
      >
        {copy.list}
      </text>
      {items.map((item, index) => {
        const x = 10 + index * 120
        const center = x + 50
        return (
          <g key={item}>
            <rect
              x={x}
              y="28"
              width="100"
              height="32"
              rx="2"
              fill="var(--site-surface)"
              stroke="var(--site-line-strong)"
            />
            <text
              x={center}
              y="49"
              textAnchor="middle"
              fontSize="13"
              className="fill-ink"
            >
              {copy.item} {item}
            </text>
            <path
              d={
                batched
                  ? `M${center} 60V70Q${center} 76 180 76V88`
                  : `M${center} 60V88`
              }
              fill="none"
              stroke={color}
              strokeWidth="1.4"
              markerEnd={`url(#${markerId})`}
            />
            {!batched && (
              <>
                <rect
                  x={x}
                  y="88"
                  width="100"
                  height="30"
                  rx="2"
                  fill="var(--site-surface)"
                  stroke="var(--site-line-strong)"
                />
                <text
                  x={center}
                  y="107"
                  textAnchor="middle"
                  fontSize="12"
                  className="fill-ink font-mono"
                >
                  resolve({item})
                </text>
                <path
                  d={`M${center} 118V154`}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.4"
                  markerEnd={`url(#${markerId})`}
                />
                <text
                  x={center}
                  y="178"
                  textAnchor="middle"
                  fontSize="12"
                  className="fill-ink"
                >
                  {copy.fetch} {item}
                </text>
              </>
            )}
          </g>
        )
      })}
      {batched && (
        <g>
          <rect
            x="30"
            y="88"
            width="300"
            height="30"
            rx="2"
            fill="var(--site-surface)"
            stroke={color}
          />
          <text
            x="180"
            y="107"
            textAnchor="middle"
            fontSize="12"
            className="fill-ink font-mono"
          >
            load([A, B, C])
          </text>
          <path
            d="M180 118V154"
            stroke={color}
            strokeWidth="1.6"
            markerEnd={`url(#${markerId})`}
          />
          <text
            x="180"
            y="178"
            textAnchor="middle"
            fontSize="12"
            className="fill-ink"
          >
            {copy.bulkFetch}
          </text>
        </g>
      )}
    </svg>
  )
}

export function BatchResolutionDiagram({
  copy,
}: {
  readonly copy: DiagramCopy
}) {
  return (
    <div>
      <p className="mb-7 max-w-3xl text-[15px] leading-8 text-ink-soft">
        {copy.lead}
      </p>
      <div className="grid border-y border-line bg-surface-muted/30 md:grid-cols-2">
        {[false, true].map((batched) => (
          <figure
            key={String(batched)}
            className={`min-w-0 px-4 py-5 sm:px-5 ${batched ? 'border-t border-line md:border-t-0 md:border-l' : ''}`}
          >
            <figcaption className="mb-6 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">
                {batched ? copy.batched : copy.individual}
              </h3>
              <span
                aria-label={copy.calls}
                className={`shrink-0 font-mono text-sm ${batched ? 'text-copper-dark' : 'text-ink-soft'}`}
              >
                {batched ? 1 : 3}
                {copy.callUnit}
              </span>
            </figcaption>
            <ResolutionFlow batched={batched} copy={copy} />
            <p className="mt-4 text-xs leading-6 text-ink-soft">
              {batched ? copy.batchNote : copy.normalNote}
            </p>
          </figure>
        ))}
      </div>
      <p className="mt-4 text-xs leading-6 text-ink-soft">{copy.note}</p>
    </div>
  )
}
