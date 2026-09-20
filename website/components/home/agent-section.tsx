import { ArrowRight, Braces, CircleAlert, Copy } from 'lucide-react'
import type { Locale } from '../../lib/i18n'
import { homeDiagnosticFixture } from '../../lib/home-devtools-fixture'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

export function AgentSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].agent

  return (
    <HomeSection className="border-[#263447] bg-[#0b131d] py-18 text-slate-100 sm:py-24">
      <div className="shell grid grid-cols-[0.95fr_1.05fr] items-center gap-12 max-lg:grid-cols-1 lg:gap-16">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-slate-500">
            {copy.eyebrow}
          </p>
          <h2 className="mt-5 text-[clamp(2rem,3.1vw,2.8rem)] leading-[1.08] font-bold tracking-[-0.055em]">
            <span className="block lg:whitespace-nowrap">{copy.title[0]}</span>
            <span className="block lg:whitespace-nowrap">{copy.title[1]}</span>
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-slate-400">
            {copy.body.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </p>
          <p className="mt-7 inline-flex items-center gap-2 border-b border-sky-400/40 pb-2 font-mono text-[11px] text-sky-300">
            <CircleAlert size={13} aria-hidden="true" /> {copy.feature}
          </p>
        </div>
        <div className="relative grid grid-cols-[0.78fr_auto_1.22fr] items-center gap-4 max-sm:grid-cols-1">
          <div className="rounded-md border border-slate-700 bg-[#0e1925] p-4">
            <p className="flex items-center gap-2 text-[10px] font-semibold text-slate-300">
              <Braces size={12} className="text-sky-400" /> {copy.graphLabel}
            </p>
            <ul className="mt-4 space-y-2 font-mono text-[9px] text-slate-500">
              {[
                'Module',
                'Provider',
                'Execution',
                'Route / Middleware / Handler',
                'Runtime Capability',
                'Source Location',
              ].map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <ArrowRight
            size={18}
            className="text-slate-600 max-sm:mx-auto max-sm:rotate-90"
            aria-hidden="true"
          />
          <div className="overflow-hidden rounded-md border border-slate-700 bg-[#0d1721] shadow-[0_22px_60px_rgba(0,0,0,0.2)]">
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
              <p className="mt-2 text-slate-500">
                Graph context: {homeDiagnosticFixture.graphContext}
              </p>
              <p className="mt-3 text-amber-300">Diagnostics:</p>
              <p>
                [{homeDiagnosticFixture.severity}] {homeDiagnosticFixture.code}
              </p>
              <p>Path: {homeDiagnosticFixture.path}</p>
              <p>Source: {homeDiagnosticFixture.source}</p>
              <p>Message: {homeDiagnosticFixture.message}</p>
            </div>
          </div>
          <p className="absolute -right-1 -bottom-10 rotate-[-4deg] text-sm font-medium text-sky-300/80 italic">
            {copy.annotation}
          </p>
        </div>
      </div>
    </HomeSection>
  )
}
