import type { Metadata } from 'next'
import { localizedPath, type Locale } from './i18n'
import { siteUrl } from './site'
import { sitePages, type SitePath } from './site-pages'

export function pageMetadata(
  path: SitePath,
  locale: Locale,
  content: { title: string; description: string },
): Metadata {
  const page = sitePages.find((entry) => entry.path === path)!
  const languages = Object.fromEntries(
    page.locales.map((language) => [
      language,
      `${siteUrl}${localizedPath(language, path)}`,
    ]),
  )
  const url = `${siteUrl}${localizedPath(locale, path)}`

  return {
    ...content,
    alternates: {
      canonical: url,
      languages: { ...languages, 'x-default': languages[page.locales[0]] },
    },
    openGraph: {
      ...content,
      type: 'website',
      siteName: 'Loutre',
      url,
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
      alternateLocale: page.locales
        .filter((language) => language !== locale)
        .map((language) => (language === 'ja' ? 'ja_JP' : 'en_US')),
      images: [{ url: '/og.png', width: 1280, height: 640, alt: 'Loutre' }],
    },
    twitter: { ...content, card: 'summary_large_image', images: ['/og.png'] },
  }
}
