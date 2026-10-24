import Image from 'next/image'
import { localePrefix, type Locale } from '../../lib/i18n'
import { DevtoolsShowcase } from './devtools-showcase'
import { homeCopy } from './home-copy'
import { CommandBlock } from './shared'
import { TextLink } from '../text-link'

export function Hero({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale]
  const prefix = localePrefix(locale)

  return (
    <section className="pb-16 pt-12 sm:pb-20 sm:pt-20">
      <div className="shell">
        <div>
          <div className="animate-reveal-up motion-reduce:animate-none">
            <h1 className="max-w-4xl text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1.2] font-bold tracking-tight text-balance">
              {copy.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-ink-soft">
              {copy.hero.lead}
            </p>
            <CommandBlock
              command="npm create loutre@latest my-app"
              label={copy.hero.commandHint}
              className="mt-7 max-w-md"
            />
            <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
              <TextLink href="https://github.com/come25136/loutrejs" external>
                {copy.links.github}
              </TextLink>
              <TextLink href={`${prefix}/docs/getting-started/`}>
                {copy.links.docs}
              </TextLink>
              <TextLink href={`${prefix}/docs/graphql-codegen/`}>
                {copy.links.graphql}
              </TextLink>
            </div>
          </div>
          <div className="mt-24 min-w-0 animate-reveal-up [animation-delay:140ms] motion-reduce:animate-none sm:mt-28">
            <div className="relative mx-auto w-full max-w-5xl">
              <Image
                className="pointer-events-none absolute -top-20 right-5 z-10 h-auto w-24 sm:-top-24 sm:right-10 sm:w-28"
                src="/characters/otter-peek.png"
                width={1254}
                height={1254}
                alt=""
                aria-hidden="true"
              />
              <DevtoolsShowcase className="w-full" locale={locale} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
