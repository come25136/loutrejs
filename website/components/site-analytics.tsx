'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AnalyticsSession, linkEvent, measurementId } from '../lib/analytics'
import { siteUrl } from '../lib/site'

function enqueue(..._args: unknown[]) {
  const target = window as Window & { dataLayer?: unknown[] }
  target.dataLayer ??= []
  target.dataLayer.push(arguments)
}

export function sendAnalyticsEvent(
  name: string,
  parameters: Record<string, unknown>,
) {
  if (
    process.env.NODE_ENV === 'production' &&
    window.location.origin === siteUrl
  ) {
    enqueue('event', name, parameters)
  }
}

export function SiteAnalytics() {
  const pathname = usePathname()
  const [session] = useState(() => new AnalyticsSession(enqueue))

  useEffect(() => {
    if (window.location.origin !== siteUrl) return
    session.view(
      pathname,
      document.referrer,
      document.title,
      new URLSearchParams(window.location.search).get('analytics_debug') ===
        '1',
    )
  }, [pathname, session])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button > 1) return
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href]')
      const href = anchor?.getAttribute('href')
      if (!href) return
      const action = linkEvent(href, pathname)
      if (action) sendAnalyticsEvent(action.name, action.parameters)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('auxclick', onClick)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('auxclick', onClick)
    }
  }, [pathname])

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  )
}
