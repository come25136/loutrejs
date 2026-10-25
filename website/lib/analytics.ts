import { localeFromPathname, localizedPath } from './i18n'
import { siteUrl } from './site'
import { sitePages } from './site-pages'

export const measurementId = 'G-46R1D6Y88K'

export class AnalyticsSession {
  private previousPath: string | null = null
  private configured = false

  constructor(private readonly send: (...args: unknown[]) => void) {}

  view(pathname: string, referrer: string, title: string, debug = false) {
    const view = pageView(pathname, this.previousPath ? siteUrl : referrer)
    this.send('set', {
      page_location: view?.page_location ?? siteUrl,
      page_referrer: view?.page_referrer ?? '',
    })
    if (!this.configured) {
      this.send('js', new Date())
      this.send('config', measurementId, {
        send_page_view: false,
        ...(debug ? { debug_mode: true } : {}),
      })
      this.configured = true
    }
    if (view && this.previousPath !== pathname) {
      this.send('event', 'page_view', { ...view, page_title: title })
    }
    this.previousPath = pathname
  }
}

function publishedPath(value: string) {
  const pathname = new URL(value, siteUrl).pathname
  return sitePages.some((page) =>
    page.locales.some(
      (locale) => localizedPath(locale, page.path) === pathname,
    ),
  )
    ? pathname
    : undefined
}

export function pageView(pathname: string, referrer: string) {
  const pagePath = publishedPath(pathname)
  if (!pagePath) return undefined
  return {
    page_location: `${siteUrl}${pagePath}`,
    page_path: pagePath,
    content_language: localeFromPathname(pagePath),
    page_referrer: URL.canParse(referrer) ? `${new URL(referrer).origin}/` : '',
  }
}

export function linkEvent(href: string, pathname: string) {
  const pagePath = publishedPath(pathname)
  if (!pagePath || !URL.canParse(href, `${siteUrl}${pagePath}`))
    return undefined
  const target = new URL(href, `${siteUrl}${pagePath}`)
  let name: string | undefined
  if (
    target.origin === siteUrl &&
    target.pathname !== pagePath &&
    publishedPath(target.pathname) &&
    /^\/(ja\/)?docs\//.test(target.pathname)
  ) {
    name = 'view_documentation'
  } else if (
    target.origin === 'https://stackblitz.com' &&
    target.pathname.startsWith(
      '/fork/github/come25136/loutrejs/tree/main/examples/',
    )
  ) {
    name = 'try_example'
  } else if (
    target.origin === 'https://github.com' &&
    /^\/come25136\/loutrejs(?:\/|$)/.test(target.pathname)
  ) {
    name = 'visit_repository'
  } else if (
    target.origin === 'https://www.npmjs.com' &&
    /^\/package\/(?:@loutrejs\/[^/]+|create-loutre)\/?$/.test(target.pathname)
  ) {
    name = 'visit_package'
  }
  return name
    ? {
        name,
        parameters: {
          page_path: pagePath,
          content_language: localeFromPathname(pagePath),
          destination: target.pathname,
        },
      }
    : undefined
}
