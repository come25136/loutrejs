import Image from 'next/image'
import { localePrefix, type Locale } from '../../lib/i18n'
import { DevtoolsShowcase } from './devtools-showcase'
import { homeCopy } from './home-copy'
import { CommandBlock, TextLink } from './shared'

export function Hero({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale]
  const prefix = localePrefix(locale)

  return (
    <section className="overflow-hidden pb-16 pt-10 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
      <div className="shell">
        <div className="grid grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] items-start gap-8 max-lg:grid-cols-1 lg:gap-10">
          <div className="relative z-10 animate-reveal-up motion-reduce:animate-none lg:pt-4">
            <h1 className="max-w-3xl text-[clamp(2.55rem,4.2vw,3.6rem)] leading-[1.04] font-extrabold tracking-[-0.065em] text-balance">
              <span className="block lg:whitespace-nowrap">
                {copy.hero.title[0]}
              </span>
              <span className="mt-1 block lg:whitespace-nowrap">
                {copy.hero.title[1]}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-[15px] leading-7 font-medium text-ink-soft sm:text-base">
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
          <div className="relative min-w-0 animate-reveal-up [animation-delay:140ms] motion-reduce:animate-none lg:-mr-[18vw] lg:mt-44">
            <Image
              className="pointer-events-none absolute -top-[122px] right-[24%] z-10 hidden h-auto w-36 xl:block"
              src="/characters/otter-peek.png"
              width={1254}
              height={1254}
              alt=""
              aria-hidden="true"
            />
            <p className="absolute -top-20 right-[12%] hidden rotate-[-7deg] text-sm leading-5 font-medium text-sky-500/80 italic xl:block">
              Understand
              <br /> your app
              <br /> faster.
            </p>
            <DevtoolsShowcase
              className="w-full lg:w-[min(940px,72vw)]"
              locale={locale}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
