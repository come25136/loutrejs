export type Locale = 'en' | 'ja'

export function localizedPath(locale: Locale, pathname: string) {
  return locale === 'ja' ? `/ja${pathname}` : pathname
}
