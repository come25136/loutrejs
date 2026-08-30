import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

const siteUrl = 'https://loutrejs.come25136.id'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Loutre — Graph-first TypeScript Application Framework',
    template: '%s | Loutre',
  },
  description:
    'Application Graphを中心に、Contract、DI、Task、Runtimeを一つの型安全なモデルへ統合するTypeScript Application Framework。',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'Loutre',
    title: 'Loutre — Graph-first TypeScript Application Framework',
    description:
      'Application Graphを中心に、複数ランタイムへ同じ設計を届けるTypeScript Application Framework。',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Loutre — Graph-first, type-safe runtime.',
      },
    ],
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Loutre — Graph-first TypeScript Application Framework',
    description:
      'Application Graphを中心に、複数ランタイムへ同じ設計を届けるTypeScript Application Framework。',
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#17120f',
  colorScheme: 'light',
}

const brandMark = (
  <span
    className="grid size-8 place-items-center rounded-[50%_50%_44%_56%] bg-copper font-serif text-base italic text-cream"
    aria-hidden="true"
  >
    L
  </span>
)

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body>
        <header className="sticky top-0 z-30 border-b border-ink/10 bg-paper/90 backdrop-blur-lg">
          <div className="shell flex min-h-18 items-center justify-between gap-9 max-sm:min-h-16">
            <Link
              className="inline-flex items-center gap-3 text-lg font-bold tracking-[-0.025em]"
              href="/"
              aria-label="Loutre トップページ"
            >
              {brandMark}
              <span>Loutre</span>
            </Link>
            <nav
              className="flex items-center gap-[clamp(1.125rem,3vw,2.25rem)] text-sm font-semibold"
              aria-label="メインナビゲーション"
            >
              <Link
                className="py-2 hover:text-copper-dark"
                href="/docs/getting-started/"
              >
                はじめる
              </Link>
              <Link
                className="py-2 hover:text-copper-dark max-sm:hidden"
                href="/docs/architecture/"
              >
                設計
              </Link>
              <Link
                className="py-2 hover:text-copper-dark max-sm:hidden"
                href="/examples/"
              >
                例
              </Link>
              <a
                className="py-2 hover:text-copper-dark"
                href="https://github.com/come25136/loutrejs"
              >
                GitHub ↗
              </a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="border-t border-ink/15 bg-paper-deep">
          <div className="shell flex min-h-55 items-center justify-between gap-12 max-sm:flex-col max-sm:items-start max-sm:justify-center max-sm:py-14">
            <div>
              <Link
                className="mb-3.5 inline-flex items-center gap-3 text-lg font-bold tracking-[-0.025em]"
                href="/"
              >
                {brandMark}
                <span>Loutre</span>
              </Link>
              <p className="m-0 font-serif text-sm italic text-ink-soft">
                Graph-first, type-safe runtime.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-x-7 gap-y-4 text-xs font-semibold text-ink-soft max-sm:justify-start">
              <Link
                className="hover:text-copper-dark"
                href="/docs/getting-started/"
              >
                Documentation
              </Link>
              <a
                className="hover:text-copper-dark"
                href="https://www.npmjs.com/package/@loutrejs/loutre"
              >
                npm
              </a>
              <a
                className="hover:text-copper-dark"
                href="https://github.com/come25136/loutrejs"
              >
                GitHub
              </a>
              <a
                className="hover:text-copper-dark"
                href="https://github.com/come25136/loutrejs/blob/main/LICENSE"
              >
                MIT License
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
