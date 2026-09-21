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
        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] xl:gap-10">
          <div className="relative z-10 animate-reveal-up motion-reduce:animate-none xl:pt-4">
            <h1 className="max-w-3xl text-[clamp(2.8rem,4.8vw,4.35rem)] leading-[1.01] font-bold tracking-[-0.045em] text-balance">
              <span className="block xl:whitespace-nowrap">
                {copy.hero.title[0]}
              </span>
              <span className="mt-1 block xl:whitespace-nowrap">
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
          <div className="min-w-0 animate-reveal-up [animation-delay:140ms] motion-reduce:animate-none mt-4 xl:-mr-[20vw] xl:mt-64">
            <div className="relative w-full xl:w-[min(940px,72vw)]">
              <Image
                className="pointer-events-none absolute -top-20 right-5 z-10 h-auto w-24 sm:-top-24 sm:right-10 sm:w-28 xl:-top-[122px] xl:right-[205px] xl:w-36"
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
