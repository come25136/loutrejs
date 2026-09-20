import Image from 'next/image'
import type { Locale } from '../../lib/i18n'
import { localePrefix } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { CommandBlock, HomeSection, TextLink } from './shared'

export function FinalCta({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale]
  const prefix = localePrefix(locale)

  return (
    <HomeSection className="bg-surface-muted/38 py-18 sm:py-24">
      <div className="shell grid grid-cols-[1fr_0.55fr] items-center gap-10 max-md:grid-cols-1">
        <div>
          <h2 className="text-[clamp(2.3rem,4vw,3.5rem)] leading-tight font-bold tracking-[-0.06em]">
            {copy.finalCta.title}
          </h2>
          <p className="mt-3 text-sm text-ink-soft">{copy.finalCta.body}</p>
          <CommandBlock
            command="npm create loutre@latest my-app"
            label={copy.finalCta.commandHint}
            className="mt-7 max-w-lg"
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
        <div className="relative mx-auto w-full max-w-[320px] max-md:mt-4">
          <Image
            className="mx-auto h-auto w-72"
            src="/characters/otter-laptop.png"
            width={1254}
            height={1254}
            alt=""
            aria-hidden="true"
          />
          <p className="absolute -right-2 top-7 rotate-[-6deg] text-sm leading-5 font-medium text-ink-soft italic max-sm:right-1">
            {copy.finalCta.annotation}
          </p>
        </div>
      </div>
    </HomeSection>
  )
}
