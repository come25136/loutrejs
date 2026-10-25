import { localizedPath, type Locale } from './i18n'
import { getDocumentNavigation } from './documents'
import { siteUrl } from './site'

const repositorySource = 'https://github.com/come25136/loutrejs/blob/main/'

export function resolveDocumentHref(href: string | undefined, locale: Locale) {
  if (!href) {
    return href
  }

  const url = URL.canParse(href) ? new URL(href) : undefined
  if (url?.origin === siteUrl) {
    return `${url.pathname}${url.search}${url.hash}`
  }

  if (href.startsWith('./') || href.startsWith('../')) {
    const directory = locale === 'ja' ? 'docs/ja/' : 'docs/'
    const target = new URL(href, `${repositorySource}${directory}`)

    for (const targetLocale of ['en', 'ja'] as const) {
      const targetDirectory = targetLocale === 'ja' ? 'docs/ja/' : 'docs/'
      const document = getDocumentNavigation(targetLocale).find(
        (entry) =>
          new URL(`${targetDirectory}${entry.filename}`, repositorySource)
            .pathname === target.pathname,
      )

      if (document) {
        return `${localizedPath(targetLocale, `/docs/${document.slug}/`)}${target.search}${target.hash}`
      }
    }

    if (
      target.pathname.startsWith(
        new URL('examples/', repositorySource).pathname,
      )
    ) {
      return localizedPath(locale, '/examples/')
    }

    return target.href
  }

  return href
}
