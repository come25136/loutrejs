import type { Metadata, Viewport } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { GoogleAnalytics } from '@next/third-parties/google'
import { ExternalLink, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './globals.css'

const siteUrl = 'https://loutrejs.come25136.id'
const googleAnalyticsId = 'G-46R1D6Y88K'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Loutre — ランタイムに縛られないTypeScriptアプリケーション',
    template: '%s | Loutre',
  },
  description:
    'Application、Contract、DI、Taskを一つのGraphとして構築し、複数のRuntimeで実行できるTypeScript Application Framework',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'Loutre',
    title: 'Loutre — ランタイムに縛られないTypeScriptアプリケーション',
    description:
      'Application、Contract、DI、Taskを一つのGraphとして構築し、複数のRuntimeで実行できるTypeScript Application Framework',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Loutre — Graph-firstで型安全なランタイム',
      },
    ],
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Loutre — ランタイムに縛られないTypeScriptアプリケーション',
    description:
      'Application、Contract、DI、Taskを一つのGraphとして構築し、複数のRuntimeで実行できるTypeScript Application Framework',
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
}

function Brand() {
  return (
    <Link
      className="inline-flex items-center gap-2 text-lg font-bold tracking-[-0.03em]"
      href="/"
      aria-label="Loutreトップページ"
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" data-scroll-behavior="smooth">
      <body>
        <header className="animate-header-in sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-xl motion-reduce:animate-none">
          <div className="shell flex min-h-16 items-center gap-9">
            <Brand />
            <nav
              className="flex items-center gap-7 text-sm font-medium max-md:hidden"
              aria-label="メインナビゲーション"
            >
              <Link
                className="transition hover:text-copper"
                href="/docs/getting-started/"
              >
                Document
              </Link>
              <Link className="transition hover:text-copper" href="/examples/">
                Example
              </Link>
              <Link
                className="transition hover:text-copper"
                href="/docs/architecture/"
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
            <div className="ml-auto flex items-center gap-2">
              <a
                className="hidden min-h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 sm:inline-flex"
                href="https://github.com/come25136/loutrejs"
              >
                <Star size={14} aria-hidden="true" /> GitHub
              </a>
              <Link
                className="inline-flex min-h-9 items-center rounded-lg bg-ink px-4 text-xs font-semibold text-white transition hover:bg-gray-800"
                href="/docs/getting-started/"
              >
                はじめる
              </Link>
            </div>
          </div>
        </header>
        {children}
        <footer className="border-t border-gray-200 bg-white">
          <div className="shell grid grid-cols-[1.4fr_repeat(3,1fr)] gap-10 py-12 max-md:grid-cols-2 max-sm:grid-cols-1">
            <div>
              <Brand />
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold text-gray-900">
                ドキュメント
              </p>
              <div className="flex flex-col gap-2 text-xs text-gray-500">
                <Link
                  className="hover:text-gray-900"
                  href="/docs/getting-started/"
                >
                  はじめる
                </Link>
                <Link
                  className="hover:text-gray-900"
                  href="/docs/architecture/"
                >
                  Architecture
                </Link>
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold text-gray-900">
                コミュニティ
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
                リソース
              </p>
              <div className="flex flex-col gap-2 text-xs text-gray-500">
                <Link className="hover:text-gray-900" href="/examples/">
                  Example
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
      </body>
      {process.env.NODE_ENV === 'production' && (
        <GoogleAnalytics gaId={googleAnalyticsId} />
      )}
    </html>
  )
}
