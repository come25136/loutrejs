import type { Metadata, Viewport } from 'next'
import { GoogleAnalytics } from '@next/third-parties/google'
import type { ReactNode } from 'react'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@xyflow/react/dist/style.css'
import { SiteChrome } from '../components/site-chrome'
import './globals.css'

const siteUrl = 'https://loutrejs.come25136.id'
const googleAnalyticsId = 'G-46R1D6Y88K'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Loutre — TypeScript Framework',
    template: '%s | Loutre',
  },
  description:
    'A TypeScript framework for Node.js, Bun, Deno, Cloudflare Workers, AWS Lambda, and Electron, with type inference and DevTools built for a simple development experience.',
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      ja: '/ja/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['ja_JP'],
    siteName: 'Loutre',
    title: 'Loutre — TypeScript Framework',
    description:
      'Build TypeScript applications across server, edge, serverless, and desktop runtimes with type inference and DevTools.',
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
      'Build TypeScript applications across server, edge, serverless, and desktop runtimes with type inference and DevTools.',
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
      </body>
      {process.env.NODE_ENV === 'production' && (
        <GoogleAnalytics gaId={googleAnalyticsId} />
      )}
    </html>
  )
}
