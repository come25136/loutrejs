'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink, Languages, Moon, Star, Sun } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
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
    darkTheme: 'Switch to dark theme',
    lightTheme: 'Switch to light theme',
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
    darkTheme: 'ダークテーマに切り替える',
    lightTheme: 'ライトテーマに切り替える',
  },
} satisfies Record<Locale, Record<string, string>>

type Theme = 'light' | 'dark'

const themeStorageKey = 'loutre-theme'

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function ThemeToggle({
  darkLabel,
  lightLabel,
}: {
  darkLabel: string
  lightLabel: string
}) {
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const syncTheme = () => {
      setTheme(
        document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      )
    }
    const syncSystemTheme = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(themeStorageKey) === null) {
        applyTheme(event.matches ? 'dark' : 'light')
        syncTheme()
      }
    }

    syncTheme()
    media.addEventListener('change', syncSystemTheme)

    return () => media.removeEventListener('change', syncSystemTheme)
  }, [])

  const isDark = theme === 'dark'
  const label = isDark ? lightLabel : darkLabel

  return (
    <button
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-soft transition hover:border-line-strong hover:bg-surface-muted hover:text-ink"
      type="button"
      onClick={() => {
        const nextTheme: Theme = isDark ? 'light' : 'dark'
        localStorage.setItem(themeStorageKey, nextTheme)
        applyTheme(nextTheme)
        setTheme(nextTheme)
      }}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      {isDark ? (
        <Sun size={15} aria-hidden="true" />
      ) : (
        <Moon size={15} aria-hidden="true" />
      )}
    </button>
  )
}

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

  return (
    <div lang={currentLocale}>
      <header
        className={`animate-header-in sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-200 motion-reduce:animate-none ${isScrolled ? 'border-line bg-paper/78 shadow-[0_8px_28px_rgba(2,8,23,0.08)] backdrop-blur-xl' : 'border-transparent bg-transparent shadow-none backdrop-blur-none'}`}
      >
        <div className="shell flex min-h-16 items-center gap-9 max-lg:gap-4">
          <Brand prefix={prefix} label={copy.brandLabel} />
          <nav
            className="flex items-center gap-7 text-sm font-medium max-lg:hidden"
            aria-label={copy.navigationLabel}
          >
            <Link
              className="transition hover:text-interaction"
              href={`${prefix}/docs/getting-started/`}
            >
              {copy.documentation}
            </Link>
            <Link
              className="transition hover:text-interaction"
              href={`${prefix}/examples/`}
            >
              {copy.examples}
            </Link>
            <Link
              className="transition hover:text-interaction"
              href={`${prefix}/docs/architecture/`}
            >
              Architecture
            </Link>
            <a
              className="inline-flex items-center gap-1 transition hover:text-interaction"
              href="https://github.com/come25136/loutrejs"
            >
              GitHub <ExternalLink size={12} aria-hidden="true" />
            </a>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle
              darkLabel={copy.darkTheme}
              lightLabel={copy.lightTheme}
            />
            <Link
              className="inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-line px-3 text-xs font-semibold text-ink-soft transition hover:border-line-strong hover:bg-surface-muted hover:text-ink"
              href={switchLocalePath(pathname, currentLocale, targetLocale)}
              hrefLang={targetLocale}
              aria-label={copy.languageLabel}
            >
              <Languages size={14} aria-hidden="true" /> {copy.language}
            </Link>
            <a
              className="hidden min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-line px-3 text-xs font-semibold text-ink-soft transition hover:border-line-strong hover:bg-surface-muted hover:text-ink sm:inline-flex"
              href="https://github.com/come25136/loutrejs"
            >
              <Star size={14} aria-hidden="true" /> GitHub
            </a>
            <Link
              className="hidden min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg bg-action px-4 text-xs font-semibold text-action-foreground transition hover:bg-action-hover sm:inline-flex"
              href={`${prefix}/docs/getting-started/`}
            >
              {copy.getStarted}
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-line bg-paper">
        <div className="shell grid grid-cols-[1.4fr_repeat(3,1fr)] gap-10 py-12 max-md:grid-cols-2 max-sm:grid-cols-1">
          <div>
            <Brand prefix={prefix} label={copy.brandLabel} />
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold text-ink">
              {copy.documentation}
            </p>
            <div className="flex flex-col gap-2 text-xs text-ink-soft">
              <Link
                className="hover:text-ink"
                href={`${prefix}/docs/getting-started/`}
              >
                {copy.getStarted}
              </Link>
              <Link
                className="hover:text-ink"
                href={`${prefix}/docs/architecture/`}
              >
                Architecture
              </Link>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold text-ink">
              {copy.community}
            </p>
            <div className="flex flex-col gap-2 text-xs text-ink-soft">
              <a
                className="hover:text-ink"
                href="https://github.com/come25136/loutrejs"
              >
                GitHub
              </a>
            </div>
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold text-ink">
              {copy.resources}
            </p>
            <div className="flex flex-col gap-2 text-xs text-ink-soft">
              <Link className="hover:text-ink" href={`${prefix}/examples/`}>
                {copy.examples}
              </Link>
              <a
                className="hover:text-ink"
                href="https://www.npmjs.com/package/@loutrejs/loutre"
              >
                npm
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-line py-5">
          <div className="shell flex items-center justify-between gap-4 text-[11px] text-ink-soft max-sm:flex-col max-sm:items-start">
            <span>© 2026 come25136. MIT License</span>
            <a
              className="inline-flex items-center gap-1.5 font-medium text-ink-soft hover:text-ink"
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
