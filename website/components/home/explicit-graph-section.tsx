import { ArrowRight, FileCode2, GitBranch } from 'lucide-react'
import type { Locale } from '../../lib/i18n'
import { homeDevtoolsFixture } from '../../lib/home-devtools-fixture'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

function GraphItem({
  index,
  active = false,
}: {
  readonly index: number
  readonly active?: boolean
}) {
  const node = homeDevtoolsFixture.graphNodes[index]!
  return (
    <div
      className={`rounded border px-3 py-2 font-mono text-[9px] ${active ? 'border-sky-400 bg-sky-400/8 text-ink' : 'border-line bg-surface-muted/55 text-ink-soft'}`}
    >
      <span className="mb-1 block text-[7px] tracking-[0.12em] text-ink-muted uppercase">
        {node.kind.replace('-', ' ')}
      </span>
      {node.label}
    </div>
  )
}

export function ExplicitGraphSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].explicitGraph

  return (
    <HomeSection className="bg-surface-muted/45 py-18 sm:py-24">
      <div className="shell grid grid-cols-[0.95fr_1.05fr] items-center gap-12 max-lg:grid-cols-1 lg:gap-16">
        <div>
          <h2 className="text-[clamp(2rem,3.2vw,2.9rem)] leading-[1.08] font-bold tracking-[-0.055em]">
            <span className="block lg:whitespace-nowrap">{copy.title[0]}</span>
            <span className="block lg:whitespace-nowrap">{copy.title[1]}</span>
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-ink-soft">
            {copy.body.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </p>
        </div>
        <div className="relative grid grid-cols-[0.86fr_auto_1.14fr] items-stretch gap-5 max-sm:grid-cols-1">
          <article className="border-y border-line bg-surface/45 p-5">
            <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-ink-muted uppercase">
              <FileCode2 size={13} aria-hidden="true" /> {copy.before}
            </p>
            <pre className="mt-5 font-mono text-[10px] leading-6 text-ink-soft">
              <code>{`src/
  users/
    user.controller.ts
    user.service.ts
    user.repository.ts
  tasks/`}</code>
            </pre>
            <div className="mt-6 space-y-1.5 text-[10px] text-ink-muted italic">
              {copy.questions.map((question) => (
                <p key={question}>{question}</p>
              ))}
            </div>
          </article>
          <ArrowRight
            className="self-center text-ink-muted max-sm:mx-auto max-sm:rotate-90"
            size={19}
            aria-hidden="true"
          />
          <article className="border-y border-sky-400/40 bg-surface/45 p-5">
            <p className="flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-sky-500 uppercase">
              <GitBranch size={13} aria-hidden="true" /> {copy.after}
            </p>
            <div className="mt-5">
              <div className="mx-auto max-w-48">
                <GraphItem index={0} />
              </div>
              <div className="mx-auto h-3 w-px bg-line-strong" />
              <div className="grid grid-cols-[1.2fr_0.8fr] gap-3">
                <div>
                  <p className="mb-1 text-center font-mono text-[7px] text-sky-500">
                    handles: create
                  </p>
                  <GraphItem index={1} />
                  <div className="mx-auto h-2.5 w-px bg-line-strong" />
                  <GraphItem index={2} />
                  <div className="mx-auto h-2.5 w-px bg-line-strong" />
                  <GraphItem index={3} active />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-center font-mono text-[7px] text-emerald-600">
                      injects
                    </p>
                    <GraphItem index={4} />
                  </div>
                  <div>
                    <p className="mb-1 text-center font-mono text-[7px] text-ink-muted">
                      requires
                    </p>
                    <GraphItem index={5} />
                  </div>
                </div>
              </div>
            </div>
          </article>
          <p className="sr-only">
            {copy.annotation}
          </p>
        </div>
      </div>
    </HomeSection>
  )
}
