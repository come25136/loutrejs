'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink, Languages, Star } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import {
  alternateLocale,
  localeFromPathname,
  localePrefix,
  switchLocalePath,
  type Locale,
} from '../lib/i18n'

const chromeCopy = {
  en: {
    brandLabel: 'Loutre home page',
    navigationLabel: 'Main navigation',
    documentation: 'Documentation',
    examples: 'Examples',
    getStarted: 'Get started',
    community: 'Community',
    resources: 'Resources',
    language: '日本語',
    languageLabel: 'Switch to Japanese',
  },
  ja: {
    brandLabel: 'Loutreトップページ',
    navigationLabel: 'メインナビゲーション',
    documentation: 'ドキュメント',
    examples: 'サンプル',
    getStarted: 'はじめる',
    community: 'コミュニティ',
    resources: 'リソース',
    language: 'English',
    languageLabel: '英語に切り替える',
  },
} satisfies Record<Locale, Record<string, string>>

function Brand({ prefix, label }: { prefix: string; label: string }) {
  return (
    <Link
      className="inline-flex shrink-0 items-center gap-2 text-lg font-bold tracking-[-0.03em]"
      href={`${prefix}/`}
      aria-label={label}
    >
      <Image
        className="h-7 w-auto"
        src="/loutre.svg"
        width={1254}
        height={1254}
        alt=""
        loading="eager"
      />
      <span>Loutre</span>
    </Link>
  )
}

export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const currentLocale = localeFromPathname(pathname)
  const targetLocale = alternateLocale(currentLocale)
  const prefix = localePrefix(currentLocale)
  const copy = chromeCopy[currentLocale]

  useEffect(() => {
    document.documentElement.lang = currentLocale
  }, [currentLocale])

  return (
    <div lang={currentLocale}>
      <header className="animate-header-in sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-xl motion-reduce:animate-none">
        <div className="shell flex min-h-16 items-center gap-9 max-lg:gap-4">
          <Brand prefix={prefix} label={copy.brandLabel} />
          <nav
            className="flex items-center gap-7 text-sm font-medium max-lg:hidden"
            aria-label={copy.navigationLabel}
          >
            <Link
              className="transition hover:text-copper"
              href={`${prefix}/docs/getting-started/`}
            >
              {copy.documentation}
            </Link>
            <Link
              className="transition hover:text-copper"
              href={`${prefix}/examples/`}
            >
              {copy.examples}
            </Link>
            <Link
              className="transition hover:text-copper"
              href={`${prefix}/docs/architecture/`}
            >
              Architecture
            </Link>
            <a
              className="inline-flex items-center gap-1 transition hover:text-copper"
              href="https://github.com/come25136/loutrejs"
            >
              GitHub <ExternalLink size={12} aria-hidden="true" />
            </a>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              className="inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
              href={switchLocalePath(pathname, currentLocale, targetLocale)}
              hrefLang={targetLocale}
              aria-label={copy.languageLabel}
            >
              <Languages size={14} aria-hidden="true" /> {copy.language}
            </Link>
            <a
              className="hidden min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 sm:inline-flex"
              href="https://github.com/come25136/loutrejs"
            >
              <Star size={14} aria-hidden="true" /> GitHub
            </a>
            <Link
              className="hidden min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-ink px-4 text-xs font-semibold text-white transition hover:bg-gray-800 sm:inline-flex"
              href={`${prefix}/docs/getting-started/`}
            >
              {copy.getStarted}
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-gray-200 bg-white">
        <div className="shell grid grid-cols-[1.4fr_repeat(3,1fr)] gap-10 py-12 max-md:grid-cols-2 max-sm:grid-cols-1">
          <div>
            <Brand prefix={prefix} label={copy.brandLabel} />
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold text-gray-900">
              {copy.documentation}
            </p>
            <div className="flex flex-col gap-2 text-xs text-gray-500">
              <Link
                className="hover:text-gray-900"
                href={`${prefix}/docs/getting-started/`}
              >
                {copy.getStarted}
              </Link>
              <Link
                className="hover:text-gray-900"
                href={`${prefix}/docs/architecture/`}
              >
                Architecture
              </Link>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold text-gray-900">
              {copy.community}
            </p>
            <div className="flex flex-col gap-2 text-xs text-gray-500">
              <a
                className="hover:text-gray-900"
                href="https://github.com/come25136/loutrejs"
              >
                GitHub
              </a>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold text-gray-900">
              {copy.resources}
            </p>
            <div className="flex flex-col gap-2 text-xs text-gray-500">
              <Link
                className="hover:text-gray-900"
                href={`${prefix}/examples/`}
              >
                {copy.examples}
              </Link>
              <a
                className="hover:text-gray-900"
                href="https://www.npmjs.com/package/@loutrejs/loutre"
              >
                npm
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-gray-100 py-5">
          <div className="shell flex items-center justify-between gap-4 text-[11px] text-gray-500 max-sm:flex-col max-sm:items-start">
            <span>© 2026 come25136. MIT License</span>
            <a
              className="inline-flex items-center gap-1.5 font-medium text-gray-700 hover:text-black"
              href="https://github.com/come25136/loutrejs"
            >
              <Star size={12} aria-hidden="true" /> Star on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
