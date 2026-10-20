import { Code2, Layers3, Radio } from 'lucide-react'
import type { Locale } from '../../lib/i18n'
import { localePrefix } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { HomeSection, TextLink } from './shared'

const endpointSource = [
  'export const endpoint = graphql.endpoint({',
  "  name: 'Counter',",
  "  path: '/graphql',",
  '  manifest,',
  '  transports: {',
  '    http: true,',
  '    websocket: true,',
  '  },',
  '  factory: (counter = inject(CounterStore)) => ({',
  '    context: ({ signal }) => ({ counter, signal }),',
  '  }),',
  '})',
].join('\n')

const featureIcons = [Code2, Radio, Layers3] as const

export function GraphQLSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].graphql
  const prefix = localePrefix(locale)

  return (
    <HomeSection className="bg-surface-muted/40 py-18 sm:py-24">
      <div className="shell">
        <div className="grid grid-cols-[0.95fr_1.05fr] items-center gap-12 max-lg:grid-cols-1 lg:gap-16">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] text-ink-muted">
              {copy.eyebrow}
            </p>
            <h2 className="mt-5 max-w-xl text-[clamp(2.1rem,3.5vw,3.2rem)] leading-[1.08] font-bold tracking-[-0.055em]">
              {copy.title}
            </h2>
            <p className="mt-6 max-w-xl text-[15px] leading-8 text-ink-soft">
              {copy.body}
            </p>
            <div className="mt-8 flex flex-wrap gap-x-7 gap-y-4">
              <TextLink href={prefix + '/docs/graphql-codegen/'}>
                {copy.docs}
              </TextLink>
              <TextLink
                href="https://github.com/come25136/loutrejs/tree/main/examples/graphql-counter"
                external
              >
                {copy.example}
              </TextLink>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-[#29394b] bg-[#0b121b] shadow-[0_22px_60px_rgba(7,13,22,0.15)]">
            <div className="flex h-10 items-center gap-2 border-b border-white/10 bg-[#162033] px-5">
              <span className="size-2 rounded-full bg-[#ff625d]" />
              <span className="size-2 rounded-full bg-[#ffbd2e]" />
              <span className="size-2 rounded-full bg-[#27c93f]" />
              <span className="ml-auto font-mono text-[10px] text-white/65">
                endpoint.ts
              </span>
            </div>
            <pre className="overflow-x-auto px-5 py-6 text-[11px] leading-[1.85] text-[#d8e3ef] sm:px-7 sm:text-xs">
              <code>{endpointSource}</code>
            </pre>
            <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-4 sm:px-7">
              {['Query', 'Mutation', 'Subscription'].map((operation) => (
                <span
                  className="rounded border border-[#456073] bg-[#1a3040] px-2.5 py-1 font-mono text-[10px] text-[#b8e1ef]"
                  key={operation}
                >
                  {operation}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-3 gap-4 max-md:grid-cols-1">
          {copy.features.map((feature, index) => {
            const Icon = featureIcons[index]!
            return (
              <article
                className="rounded-xl border border-line bg-surface p-6 sm:p-7"
                key={feature.title}
              >
                <Icon
                  className="mb-5 text-copper-dark"
                  size={23}
                  aria-hidden="true"
                />
                <h3 className="text-lg font-bold tracking-[-0.03em]">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-ink-soft">
                  {feature.body}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </HomeSection>
  )
}
