import { localizedPath, type Locale } from './i18n'
import { siteUrl } from './site'

export function resolveDocumentHref(href: string | undefined, locale: Locale) {
  if (!href) {
    return href
  }

  const markdownLink = /^\.\/([^/]+)\.md(#[\w-]+)?$/.exec(href)

  if (markdownLink) {
    return localizedPath(
      locale,
      `/docs/${markdownLink[1]}/${markdownLink[2] ?? ''}`,
    )
  }

  if (href.startsWith('../examples')) {
    return localizedPath(locale, '/examples/')
  }

  const url = URL.canParse(href) ? new URL(href) : undefined
  if (url?.origin === siteUrl) {
    return `${url.pathname}${url.search}${url.hash}`
  }

  return href
}
