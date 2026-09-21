import type { Locale } from '../lib/i18n'
import { AgentSection } from './home/agent-section'
import { ArchitectureSection } from './home/architecture-section'
import { ExplicitGraphSection } from './home/explicit-graph-section'
import { FinalCta } from './home/final-cta'
import { Hero } from './home/hero'
import { TypeInferenceSection } from './home/type-inference-section'
import { RuntimeSection } from './home/runtime-section'

export function HomePage({ locale }: { readonly locale: Locale }) {
  return (
    <main>
      <Hero locale={locale} />
      <RuntimeSection locale={locale} />
      <ExplicitGraphSection locale={locale} />
      <TypeInferenceSection locale={locale} />
      <AgentSection locale={locale} />
      <ArchitectureSection locale={locale} />
      <FinalCta locale={locale} />
    </main>
  )
}
