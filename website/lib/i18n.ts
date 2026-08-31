export const locales = ['en', 'ja'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

const localePrefixes: Record<Locale, string> = {
  en: '',
  ja: '/ja',
}

const alternateLocales: Record<Locale, Locale> = {
  en: 'ja',
  ja: 'en',
}

export function localeFromPathname(pathname: string): Locale {
  return (
    locales.find((locale) => {
      const prefix = localePrefixes[locale]
      return (
        prefix && (pathname === prefix || pathname.startsWith(`${prefix}/`))
      )
    }) ?? defaultLocale
  )
}

export function localePrefix(locale: Locale) {
  return localePrefixes[locale]
}

export function alternateLocale(locale: Locale) {
  return alternateLocales[locale]
}

export function localizedPath(locale: Locale, pathname: string) {
  const prefix = localePrefix(locale)
  return pathname === '/' ? `${prefix}/` : `${prefix}${pathname}`
}

export function switchLocalePath(
  pathname: string,
  currentLocale: Locale,
  targetLocale: Locale,
) {
  const currentPrefix = localePrefix(currentLocale)
  const unlocalizedPath = currentPrefix
    ? pathname.replace(new RegExp(`^${currentPrefix}(?=/|$)`), '') || '/'
    : pathname

  return localizedPath(targetLocale, unlocalizedPath)
}
