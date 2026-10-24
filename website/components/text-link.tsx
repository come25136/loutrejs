import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function TextLink({
  href,
  children,
  external = false,
}: {
  readonly href: string
  readonly children: ReactNode
  readonly external?: boolean
}) {
  const className =
    'inline-flex items-center gap-2 text-sm font-semibold text-ink transition hover:text-interaction'
  const content = (
    <>
      {children} <ArrowRight size={14} aria-hidden="true" />
    </>
  )

  return external ? (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <Link className={className} href={href}>
      {content}
    </Link>
  )
}
