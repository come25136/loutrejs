'use client'

import { BookOpen, Code2, Wrench } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
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
    examples: 'Examples',
    devtools: 'DevTools',
    github: 'GitHub',
    tagline: 'Explicit architecture for TypeScript applications.',
    languageLabel: 'Language',
    darkTheme: 'Switch to dark theme',
    lightTheme: 'Switch to light theme',
  },
  ja: {
    brandLabel: 'Loutreトップページ',
    navigationLabel: 'メインナビゲーション',
    documentation: 'Docs',
    examples: 'Examples',
    devtools: 'DevTools',
    github: 'GitHub',
    tagline: 'Explicit architecture for TypeScript applications.',
    languageLabel: '言語',
    darkTheme: 'ダークテーマに切り替える',
    lightTheme: 'ライトテーマに切り替える',
  },
} satisfies Record<Locale, Record<string, string>>

function GithubMark({ className = '' }: { readonly className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.596 2 12.272c0 4.542 2.865 8.394 6.839 9.754.5.095.682-.223.682-.495 0-.244-.009-.89-.014-1.746-2.782.62-3.369-1.377-3.369-1.377-.455-1.188-1.11-1.504-1.11-1.504-.908-.638.069-.625.069-.625 1.004.073 1.532 1.059 1.532 1.059.892 1.57 2.341 1.117 2.91.854.091-.664.349-1.117.635-1.374-2.221-.26-4.555-1.141-4.555-5.076 0-1.121.39-2.037 1.029-2.755-.103-.26-.446-1.304.098-2.717 0 0 .84-.276 2.75 1.052A9.32 9.32 0 0 1 12 7.026a9.32 9.32 0 0 1 2.504.346c1.91-1.328 2.748-1.052 2.748-1.052.546 1.413.203 2.457.1 2.717.64.718 1.027 1.634 1.027 2.755 0 3.945-2.338 4.813-4.566 5.068.359.318.679.946.679 1.906 0 1.376-.013 2.486-.013 2.824 0 .275.18.595.688.494C19.137 20.662 22 16.81 22 12.272 22 6.596 17.523 2 12 2Z" />
    </svg>
  )
}

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
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    document.documentElement.lang = currentLocale
  }, [currentLocale])

  useEffect(() => {
    const syncScrollState = () => setIsScrolled(window.scrollY > 0)

    syncScrollState()
    window.addEventListener('scroll', syncScrollState, { passive: true })

    return () => window.removeEventListener('scroll', syncScrollState)
  }, [])

  if (isDevtools) return <div lang={currentLocale}>{children}</div>

  return (
    <div lang={currentLocale}>
      <header
        className={`animate-header-in sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-200 motion-reduce:animate-none ${isScrolled ? 'border-line bg-paper/78 shadow-[0_8px_28px_rgba(2,8,23,0.08)] backdrop-blur-xl' : 'border-transparent bg-transparent shadow-none backdrop-blur-none'}`}
      >
        <div className="shell flex min-h-16 items-center gap-6">
          <Brand prefix={prefix} label={copy.brandLabel} />
          <nav
            className="ml-auto flex items-center gap-2.5 text-xs font-semibold sm:gap-4 lg:gap-5"
            aria-label={copy.navigationLabel}
          >
            <Link
              className="inline-flex items-center gap-1.5 transition hover:text-interaction"
              href={`${prefix}/docs/getting-started/`}
              title={copy.documentation}
            >
              <BookOpen className="size-3.5" aria-hidden="true" />
              <span className="max-lg:hidden">{copy.documentation}</span>
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 transition hover:text-interaction"
              href={`${prefix}/examples/`}
              title={copy.examples}
            >
              <Code2 className="size-3.5" aria-hidden="true" />
              <span className="max-lg:hidden">{copy.examples}</span>
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 transition hover:text-interaction"
              href={`${prefix}/devtools/`}
              title={copy.devtools}
            >
              <Wrench className="size-3.5" aria-hidden="true" />
              <span className="max-lg:hidden">{copy.devtools}</span>
            </Link>
            <a
              className="inline-flex items-center gap-1.5 transition hover:text-interaction"
              href="https://github.com/come25136/loutrejs"
              target="_blank"
              rel="noreferrer"
              title={copy.github}
            >
              <GithubMark className="size-3.5" />
              <span className="max-lg:hidden">{copy.github}</span>
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
            className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] font-medium text-ink-soft max-md:ml-0"
            aria-label={copy.navigationLabel}
          >
            <Link
              className="inline-flex items-center gap-1.5 hover:text-ink"
              href={`${prefix}/docs/getting-started/`}
            >
              <BookOpen className="size-3.5" aria-hidden="true" />
              {copy.documentation}
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 hover:text-ink"
              href={`${prefix}/examples/`}
            >
              <Code2 className="size-3.5" aria-hidden="true" />
              {copy.examples}
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 hover:text-ink"
              href={`${prefix}/devtools/`}
            >
              <Wrench className="size-3.5" aria-hidden="true" />
              {copy.devtools}
            </Link>
            <a
              className="inline-flex items-center gap-1.5 hover:text-ink"
              href="https://github.com/come25136/loutrejs"
              target="_blank"
              rel="noreferrer"
            >
              <GithubMark className="size-3.5" />
              {copy.github}
            </a>
            <span>© 2026 · MIT</span>
          </nav>
        </div>
      </footer>
    </div>
  )
}
