import { ArrowRight } from 'lucide-react'
import type { Locale } from '../../lib/i18n'
import { localePrefix } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { TextLink } from '../text-link'

export function BatchResolutionPreview({
  locale,
}: {
  readonly locale: Locale
}) {
  const copy = homeCopy[locale].batchResolution
  const prefix = localePrefix(locale)

  return (
    <section
      aria-labelledby="batch-resolution-title"
      className="mt-10 border-t border-line pt-8 sm:mt-12 sm:pt-10"
    >
      <div className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <h3
            id="batch-resolution-title"
            className="text-lg font-semibold tracking-[-0.025em]"
          >
            {copy.title}
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-ink-soft">
            {copy.body}
          </p>
          <div className="mt-6">
            <TextLink href={`${prefix}/features/batch-resolution/`}>
              {copy.details}
            </TextLink>
          </div>
        </div>
        <figure className="rounded-lg border border-line bg-surface px-5 pt-5 pb-4 sm:px-7">
          <svg
            role="img"
            aria-label={copy.diagramLabel}
            viewBox="0 0 420 220"
            className="mx-auto w-full max-w-[340px] font-mono"
          >
            {[
              { x: 10, name: 'A' },
              { x: 155, name: 'B' },
              { x: 300, name: 'C' },
            ].map((item) => (
              <g key={item.name}>
                <rect
                  x={item.x}
                  y="12"
                  width="110"
                  height="42"
                  rx="4"
                  fill="var(--site-surface)"
                  stroke="var(--site-line-strong)"
                />
                <text
                  x={item.x + 55}
                  y="38"
                  textAnchor="middle"
                  fontSize="16"
                  className="fill-ink"
                >
                  Item {item.name}
                </text>
                <path
                  d={`M${item.x + 55} 54V74Q${item.x + 55} 92 210 92V114`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-sky-600 dark:text-sky-400"
                />
              </g>
            ))}
            <rect
              x="115"
              y="114"
              width="190"
              height="44"
              rx="4"
              fill="var(--site-surface)"
              stroke="currentColor"
              className="text-sky-600 dark:text-sky-400"
            />
            <text
              x="210"
              y="141"
              textAnchor="middle"
              fontSize="16"
              className="fill-sky-600 dark:fill-sky-400"
            >
              load([A, B, C])
            </text>
            <path
              d="M210 158V184M206 180L210 184L214 180"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-sky-600 dark:text-sky-400"
            />
            <text
              x="210"
              y="207"
              textAnchor="middle"
              fontSize="14"
              className="fill-ink-soft"
            >
              CatalogService
            </text>
          </svg>
          <figcaption className="mt-2 flex items-center justify-center gap-4 border-t border-line pt-4 text-xs text-ink-soft sm:gap-6">
            <span>
              {copy.individual}
              <span className="ml-2 font-mono text-base text-ink">3</span>
            </span>
            <ArrowRight
              size={14}
              className="text-ink-muted"
              aria-hidden="true"
            />
            <span>
              {copy.batch}
              <span className="ml-2 font-mono text-base text-sky-600 dark:text-sky-400">
                1
              </span>
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
