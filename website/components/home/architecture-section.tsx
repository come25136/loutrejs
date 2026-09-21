import type { Locale } from '../../lib/i18n'
import { localePrefix } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { HomeSection, TextLink } from './shared'

const architectureNodes = [
  {
    title: 'Module',
    body: 'Ownership / Visibility',
    className: 'left-0 top-0',
  },
  {
    title: 'Provider & DI',
    body: 'Dependencies',
    className: 'right-0 top-0',
  },
  {
    title: 'Execution',
    body: 'HTTP / Tasks / MessagePort',
    className: 'bottom-0 left-0',
  },
  {
    title: 'Runtime Capability',
    body: 'http.server / queue',
    className: 'bottom-0 right-0',
  },
] as const

export function ArchitectureSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale]
  const prefix = localePrefix(locale)

  return (
    <HomeSection className="py-18 sm:py-24">
      <div className="shell grid grid-cols-[1.05fr_0.95fr] items-center gap-12 max-lg:grid-cols-1 lg:gap-16">
        <div className="lg:order-2">
          <p className="text-[10px] font-bold tracking-[0.18em] text-ink-muted">
            {copy.architecture.eyebrow}
          </p>
          <h2 className="mt-5 whitespace-pre-line text-[clamp(2rem,3.2vw,2.9rem)] leading-[1.08] font-bold tracking-[-0.055em] lg:whitespace-pre">
            {copy.architecture.title}
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-ink-soft">
            {copy.architecture.body}
          </p>
          <div className="mt-7">
            <TextLink href={`${prefix}/docs/architecture/`}>
              {copy.links.architecture}
            </TextLink>
          </div>
        </div>
        <div className="relative mx-auto h-[390px] w-full max-w-[620px] sm:h-[420px] lg:order-1">
          <svg
            className="absolute inset-0 size-full text-line-strong"
            viewBox="0 0 620 420"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M96 96V128H194V182H210"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeDasharray="4 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M524 96V128H426V182H410"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeDasharray="4 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M96 324V292H194V238H210"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeDasharray="4 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M524 324V292H426V238H410"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeDasharray="4 7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="absolute left-1/2 top-1/2 grid h-28 w-44 -translate-x-1/2 -translate-y-1/2 place-items-center border border-sky-400/70 bg-sky-400/6 text-center">
            <div>
              <strong className="block text-base text-sky-500">
                Application
              </strong>
              <span className="text-xs font-semibold text-sky-500">
                Model / Graph
              </span>
            </div>
          </div>
          {architectureNodes.map((node) => (
            <div
              className={`absolute flex h-24 w-48 flex-col items-center justify-center border border-line-strong bg-paper text-center max-sm:w-36 ${node.className}`}
              key={node.title}
            >
              <strong className="text-sm">{node.title}</strong>
              <span className="mt-1 font-mono text-[9px] text-ink-muted">
                {node.body}
              </span>
            </div>
          ))}
          <p className="sr-only">{copy.architecture.annotation}</p>
        </div>
      </div>
    </HomeSection>
  )
}
