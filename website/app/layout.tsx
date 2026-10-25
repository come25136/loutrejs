import type { Metadata, Viewport } from 'next'
import { SiteAnalytics } from '../components/site-analytics'
import type { ReactNode } from 'react'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@xyflow/react/dist/style.css'
import { SiteChrome } from '../components/site-chrome'
import { siteUrl } from '../lib/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Loutre — TypeScript Framework',
    template: '%s | Loutre',
  },
  description:
    'A multi-runtime TypeScript framework with typed HTTP and GraphQL APIs, WebSocket Subscriptions, Codegen, and DevTools.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ja_JP'],
    siteName: 'Loutre',
    title: 'Loutre — TypeScript Framework',
    description:
      'Build typed HTTP and GraphQL APIs, real-time Subscriptions, and multi-runtime applications with Loutre DevTools.',
    images: [
      {
        url: '/og.png',
        width: 1280,
        height: 640,
        alt: 'Loutre — TypeScript Framework',
      },
    ],
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Loutre — TypeScript Framework',
    description:
      'Build typed HTTP and GraphQL APIs, real-time Subscriptions, and multi-runtime applications with Loutre DevTools.',
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#081018' },
  ],
  colorScheme: 'light dark',
}

const themeScript = `(() => {
  const storedTheme = localStorage.getItem('loutre-theme')
  const theme = storedTheme === 'light' || storedTheme === 'dark'
    ? storedTheme
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'

  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
})()`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteChrome>{children}</SiteChrome>
        {process.env.NODE_ENV === 'production' && <SiteAnalytics />}
      </body>
    </html>
  )
}
