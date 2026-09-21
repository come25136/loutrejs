import { ArrowRight, Braces, Copy } from 'lucide-react'
import type { Locale } from '../../lib/i18n'
import { homeDevtoolsFixture } from '../../lib/home-devtools-fixture'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

function GraphNode({
  kind,
  label,
}: {
  readonly kind: string
  readonly label: string
}) {
  return (
    <div className="min-w-0 border border-line bg-surface-muted/45 px-2.5 py-2 font-mono">
      <span className="block text-[7px] tracking-[0.12em] text-ink-muted uppercase">
        {kind}
      </span>
      <strong className="mt-1 block min-w-0 whitespace-nowrap text-[9px] font-semibold text-ink">
        {label}
      </strong>
    </div>
  )
}

function GraphRelation({ label }: { readonly label: string }) {
  return (
    <div className="flex h-6 items-center justify-center gap-1.5 font-mono text-[7px] text-sky-600">
      <span className="h-full w-px bg-line-strong" />
      {label}
    </div>
  )
}

export function AgentSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].agent
  const [controller, route, , handler, service] = homeDevtoolsFixture.graphNodes

  return (
    <HomeSection className="bg-surface-muted/45 py-18 sm:py-24">
      <div className="shell grid grid-cols-[0.9fr_1.1fr] items-center gap-12 max-xl:grid-cols-1 lg:gap-16">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-ink-muted">
            {copy.eyebrow}
          </p>
          <h2 className="mt-5 text-[clamp(2rem,3.1vw,2.8rem)] leading-[1.08] font-bold tracking-[-0.055em]">
            <span className="block lg:whitespace-nowrap">{copy.title[0]}</span>
            <span className="block lg:whitespace-nowrap">{copy.title[1]}</span>
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-ink-soft">
            {copy.body}
          </p>
        </div>

        <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-4 max-sm:grid-cols-1">
          <div className="overflow-hidden border border-line bg-surface">
            <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-[10px] font-semibold text-ink">
              <Braces size={12} className="text-sky-500" aria-hidden="true" />
              {copy.graphLabel}
            </div>
            <div className="p-4">
              <GraphNode kind={controller.kind} label={controller.label} />
              <div className="mt-1 grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] gap-3 [&>div]:min-w-0">
                <div>
                  <GraphRelation label="handles" />
                  <GraphNode kind={route.kind} label={route.label} />
                  <GraphRelation label="flows to" />
                  <GraphNode kind={handler.kind} label={handler.label} />
                </div>
                <div>
                  <GraphRelation label="injects" />
                  <GraphNode kind={service.kind} label={service.label} />
                </div>
              </div>
            </div>
          </div>

          <ArrowRight
            size={18}
            className="self-center text-ink-muted max-sm:mx-auto max-sm:rotate-90"
            aria-hidden="true"
          />

          <div className="overflow-hidden border border-slate-700 bg-[#0d1721]">
            <div className="flex h-9 items-center gap-2 border-b border-white/8 px-3 font-mono text-[9px] text-slate-400">
              <span className="size-2 rounded-full bg-emerald-400" /> agent
              <Copy
                size={11}
                className="ml-auto text-slate-600"
                aria-hidden="true"
              />
            </div>
            <div className="p-4 font-mono text-[9px] leading-5 text-slate-400">
              <p className="text-slate-200">{copy.contextLabel}</p>
              <dl className="mt-4 grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2">
                <dt className="text-slate-600">route</dt>
                <dd>{route.label}</dd>
                <dt className="text-slate-600">handler</dt>
                <dd>{handler.label}</dd>
                <dt className="text-slate-600">depends on</dt>
                <dd>{service.label}</dd>
                <dt className="text-slate-600">source</dt>
                <dd className="break-words">
                  {homeDevtoolsFixture.sourceFile}:54
                </dd>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </HomeSection>
  )
}
