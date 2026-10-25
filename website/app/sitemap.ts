import type { MetadataRoute } from 'next'
import { localizedPath } from '../lib/i18n'
import { siteUrl } from '../lib/site'
import { sitePages } from '../lib/site-pages'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return sitePages.flatMap((page) => {
    const languages = Object.fromEntries(
      page.locales.map((locale) => [
        locale,
        `${siteUrl}${localizedPath(locale, page.path)}`,
      ]),
    )
    return page.locales.map((locale) => ({
      url: languages[locale],
      alternates: { languages },
    }))
  })
}
