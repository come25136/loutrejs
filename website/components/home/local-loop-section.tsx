import { Check, Code2, Play, RotateCcw, Route } from 'lucide-react'
import type { Locale } from '../../lib/i18n'
import { homeDevtoolsFixture } from '../../lib/home-devtools-fixture'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

const icons = [Play, Route, RotateCcw, Code2] as const

function StepVisual({ index }: { readonly index: number }) {
  if (index === 0) {
    return (
      <div className="font-mono text-[9px] leading-5 text-slate-400">
        <p>
          <span className="text-sky-400">$</span> loutre dev
        </p>
        <p>Local: http://localhost:25136</p>
        <p className="flex items-center gap-1 text-emerald-400">
          <Check size={9} /> Graph ready
        </p>
        <p className="flex items-center gap-1 text-emerald-400">
          <Check size={9} /> Tracing enabled
        </p>
      </div>
    )
  }
  if (index === 1) {
    return (
      <div className="space-y-1 font-mono text-[8px] text-slate-400">
        {homeDevtoolsFixture.trace.map((entry, rowIndex) => (
          <p
            className={`rounded px-2 py-1 ${rowIndex === 0 ? 'bg-sky-400/12 text-sky-300' : ''}`}
            key={entry.name}
            style={{ marginLeft: entry.depth * 5 }}
          >
            {entry.name}
          </p>
        ))}
      </div>
    )
  }
  if (index === 2) {
    return (
      <div className="font-mono text-[8px] text-slate-400">
        <div className="mb-2 flex gap-3 border-b border-white/8 pb-2">
          <span className="text-sky-300">Input</span>
          <span>Return</span>
        </div>
        <p className="text-slate-300">{'{ name: "Loutre",'}</p>
        <p className="pl-2 text-slate-300">{'email: "otter@example.com" }'}</p>
        <span className="mt-3 inline-flex items-center gap-1 rounded border border-sky-400/40 px-2 py-1 text-sky-300">
          <Play size={8} /> Replay
        </span>
      </div>
    )
  }
  return (
    <div className="font-mono text-[8px] leading-5 text-slate-400">
      <p>
        <span className="text-fuchsia-300">async</span> create(ctx) {'{'}
      </p>
      <p className="pl-2">
        <span className="text-fuchsia-300">return</span>{' '}
        {'ctx.response.created({'}
      </p>
      <p className="pl-4">body: users.create(ctx.input.body.name),</p>
      <p className="pl-2">{'}'})</p>
      <p>{'}'}</p>
    </div>
  )
}

export function LocalLoopSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].localLoop

  return (
    <HomeSection className="py-18 sm:py-24">
      <div className="shell">
        <h2 className="text-[clamp(2rem,4vw,3.25rem)] leading-tight font-bold tracking-[-0.05em]">
          {copy.title}
        </h2>
        <div className="mt-12 grid grid-cols-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {copy.steps.map((step, index) => {
            const Icon = icons[index]
            return (
              <article
                className="relative border-l border-line px-5 first:border-l-0 max-lg:[&:nth-child(3)]:border-l-0 max-lg:[&:nth-child(n+3)]:border-t max-lg:[&:nth-child(n+3)]:pt-8 max-sm:border-l-0 max-sm:border-t max-sm:px-0 max-sm:py-8 max-sm:first:border-t-0 max-sm:first:pt-0"
                key={step.number}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-sky-500">
                    {step.number}
                  </span>
                  <Icon
                    size={15}
                    className="text-ink-muted"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="mt-3 text-xl font-bold tracking-[-0.03em]">
                  {step.title}
                </h3>
                <p className="mt-2 min-h-12 max-w-xs text-xs leading-5 text-ink-soft">
                  {step.body}
                </p>
                <div className="mt-5 min-h-32 rounded-md border border-[#263447] bg-[#0b121b] p-3 shadow-[0_12px_32px_rgba(7,13,22,0.09)]">
                  <StepVisual index={index} />
                </div>
              </article>
            )
          })}
        </div>
        <p className="mt-6 rotate-[-2deg] text-right text-sm font-semibold text-sky-500 italic">
          {copy.annotation}
        </p>
      </div>
    </HomeSection>
  )
}
