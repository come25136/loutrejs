'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { ThemeToggle } from './theme-toggle'
import {
  localeFromPathname,
  localePrefix,
  switchLocalePath,
  type Locale,
} from '../lib/i18n'

const chromeCopy = {
  en: {
    brandLabel: 'Loutre home page',
    navigationLabel: 'Main navigation',
    documentation: 'Docs',
    tagline: 'Explicit architecture for TypeScript applications.',
    languageLabel: 'Language',
    darkTheme: 'Switch to dark theme',
    lightTheme: 'Switch to light theme',
  },
  ja: {
    brandLabel: 'Loutreトップページ',
    navigationLabel: 'メインナビゲーション',
    documentation: 'Docs',
    tagline: 'Explicit architecture for TypeScript applications.',
    languageLabel: '言語',
    darkTheme: 'ダークテーマに切り替える',
    lightTheme: 'ライトテーマに切り替える',
  },
} satisfies Record<Locale, Record<string, string>>

function Brand({
  prefix,
  label,
  tagline = false,
}: {
  readonly prefix: string
  readonly label: string
  readonly tagline?: boolean
}) {
  return (
    <div className="flex min-w-0 items-center gap-5">
      <Link
        className="inline-flex shrink-0 items-center gap-2 text-lg font-bold tracking-[-0.03em]"
        href={`${prefix}/`}
        aria-label={label}
      >
        <Image
          className="h-7 w-auto dark:brightness-0 dark:invert"
          src="/loutre.svg"
          width={1254}
          height={1254}
          alt=""
          loading="eager"
        />
        <span>Loutre</span>
      </Link>
      {tagline && (
        <p className="max-w-44 border-l border-line pl-5 text-[9px] leading-4 text-ink-muted max-xl:hidden">
          Explicit architecture
          <br />
          for TypeScript applications.
        </p>
      )}
    </div>
  )
}

export function SiteChrome({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname()
  const normalizedPathname = pathname.replace(/\/$/, '')
  const isDevtools =
    normalizedPathname === '/devtools' ||
    normalizedPathname.startsWith('/devtools/') ||
    normalizedPathname === '/ja/devtools' ||
    normalizedPathname.startsWith('/ja/devtools/')
  const currentLocale = localeFromPathname(pathname)
  const prefix = localePrefix(currentLocale)
  const copy = chromeCopy[currentLocale]
  const englishHref = switchLocalePath(pathname, currentLocale, 'en')
  const japaneseHref = switchLocalePath(pathname, currentLocale, 'ja')

  useEffect(() => {
    document.documentElement.lang = currentLocale
  }, [currentLocale])

  if (isDevtools) return <div lang={currentLocale}>{children}</div>

  return (
    <div lang={currentLocale}>
      <header className="animate-header-in border-b border-transparent bg-paper motion-reduce:animate-none">
        <div className="shell flex min-h-18 items-center gap-6">
          <Brand prefix={prefix} label={copy.brandLabel} tagline />
          <nav
            className="ml-auto flex items-center gap-4 text-xs font-semibold sm:gap-6"
            aria-label={copy.navigationLabel}
          >
            <Link
              className="transition hover:text-interaction"
              href={`${prefix}/docs/getting-started/`}
            >
              {copy.documentation}
            </Link>
            <a
              className="hidden transition hover:text-interaction sm:inline"
              href="https://github.com/come25136/loutrejs"
            >
              GitHub
            </a>
            <ThemeToggle
              darkLabel={copy.darkTheme}
              lightLabel={copy.lightTheme}
            />
            <div
              className="flex items-center gap-2"
              aria-label={copy.languageLabel}
            >
              <Link
                className={`py-1 transition hover:text-interaction ${currentLocale === 'en' ? 'border-b border-ink text-ink' : 'text-ink-muted'}`}
                href={englishHref}
                hrefLang="en"
              >
                EN
              </Link>
              <span className="text-line-strong" aria-hidden="true">
                /
              </span>
              <Link
                className={`py-1 transition hover:text-interaction ${currentLocale === 'ja' ? 'border-b border-ink text-ink' : 'text-ink-muted'}`}
                href={japaneseHref}
                hrefLang="ja"
              >
                JP
              </Link>
            </div>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-line bg-paper">
        <div className="shell flex min-h-28 items-center gap-8 py-7 max-md:flex-col max-md:items-start">
          <Brand prefix={prefix} label={copy.brandLabel} />
          <p className="text-[9px] leading-4 text-ink-muted">{copy.tagline}</p>
          <nav
            className="ml-auto flex items-center gap-6 text-[11px] font-medium text-ink-soft max-md:ml-0"
            aria-label={copy.navigationLabel}
          >
            <Link
              className="hover:text-ink"
              href={`${prefix}/docs/getting-started/`}
            >
              Docs
            </Link>
            <a
              className="hover:text-ink"
              href="https://github.com/come25136/loutrejs"
            >
              GitHub
            </a>
            <span>© 2026 · MIT</span>
          </nav>
        </div>
      </footer>
    </div>
  )
}
