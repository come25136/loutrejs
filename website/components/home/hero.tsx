import Image from 'next/image'
import { localePrefix, type Locale } from '../../lib/i18n'
import { DevtoolsShowcase } from './devtools-showcase'
import { homeCopy } from './home-copy'
import { CommandBlock, TextLink } from './shared'

export function Hero({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale]
  const prefix = localePrefix(locale)

  return (
    <section className="overflow-hidden pb-20 pt-14 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
      <div className="shell">
        <div className="grid grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] items-start gap-8 max-lg:grid-cols-1 lg:gap-10">
          <div className="relative z-10 animate-reveal-up motion-reduce:animate-none lg:pt-4">
            <h1 className="max-w-3xl text-[clamp(2.8rem,4.8vw,4.35rem)] leading-[1.01] font-bold tracking-[-0.045em] text-balance">
              <span className="block lg:whitespace-nowrap">
                {copy.hero.title[0]}
              </span>
              <span className="mt-1 block lg:whitespace-nowrap">
                {copy.hero.title[1]}
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-[15px] leading-7 text-ink-soft sm:text-base">
              <span className="block">{copy.hero.lead[0]}</span>
              <span className="block">{copy.hero.lead[1]}</span>
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
            </div>
          </div>
          <div className="min-w-0 animate-reveal-up [animation-delay:140ms] motion-reduce:animate-none lg:-mr-[20vw] lg:mt-64">
            <div className="relative w-full lg:w-[min(940px,72vw)]">
              <Image
                className="pointer-events-none absolute -top-[122px] right-[205px] z-10 hidden h-auto w-36 xl:block"
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
