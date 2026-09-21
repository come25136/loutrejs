import { ArrowUpRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import type { Locale } from '../../lib/i18n'
import { localePrefix } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { HomeSection, TextLink } from './shared'

const stackBlitzUrl =
  'https://stackblitz.com/fork/github/come25136/loutrejs/tree/main/examples/hello-http?startScript=dev&title=Loutre%20Hello%20HTTP&initialpath=%2FLoutre'

export function FinalCta({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale]
  const prefix = localePrefix(locale)

  return (
    <HomeSection className="bg-surface-muted/38 py-18 sm:py-24">
      <div className="shell relative grid grid-cols-[1fr_0.55fr] items-center gap-8 max-sm:block md:gap-10">
        <div>
          <div className="max-sm:pr-28">
            <h2 className="text-[clamp(2.3rem,4vw,3.5rem)] leading-tight font-bold tracking-[-0.06em] max-sm:text-[2rem]">
              {copy.finalCta.title}
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-7 text-ink-soft">
              {copy.finalCta.body}
            </p>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <a
              className="inline-flex min-h-12 items-center gap-2 bg-action px-5 text-sm font-semibold text-action-foreground transition hover:bg-action-hover"
              href={stackBlitzUrl}
              target="_blank"
              rel="noreferrer"
            >
              {copy.finalCta.stackblitz}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <Link
              className="inline-flex min-h-12 items-center gap-2 border border-line-strong bg-surface px-5 text-sm font-semibold transition hover:bg-surface-muted"
              href={`${prefix}/examples/`}
            >
              {copy.finalCta.examples}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3">
            <TextLink href={`${prefix}/docs/getting-started/`}>
              {copy.links.docs}
            </TextLink>
            <TextLink href="https://github.com/come25136/loutrejs" external>
              {copy.links.github}
            </TextLink>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[320px] max-sm:absolute max-sm:top-0 max-sm:right-0 max-sm:m-0 max-sm:w-24">
          <Image
            className="mx-auto h-auto w-72 max-sm:w-24"
            src="/characters/otter-laptop.png"
            width={1254}
            height={1254}
            alt=""
            aria-hidden="true"
          />
        </div>
      </div>
    </HomeSection>
  )
}
