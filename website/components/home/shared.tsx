import Link from 'next/link'
import { ArrowRight, Copy } from 'lucide-react'
import type { ReactNode } from 'react'
import { ScrollReveal } from '../scroll-reveal'

export function HomeSection({
  children,
  className = '',
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return (
    <ScrollReveal>
      <section className={`border-t border-line ${className}`}>
        {children}
      </section>
    </ScrollReveal>
  )
}

export function CommandBlock({
  command,
  label,
  className = '',
}: {
  readonly command: string
  readonly label: string
  readonly className?: string
}) {
  return (
    <div
      className={`flex min-h-14 items-center gap-3 rounded-md border border-[#263447] bg-[#0b121b] px-4 text-left font-mono text-sm text-[#d8e3ef] shadow-[0_18px_45px_rgba(7,13,22,0.14)] ${className}`}
      aria-label={label}
    >
      <span className="text-sky-400" aria-hidden="true">
        $
      </span>
      <code className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {command}
      </code>
      <Copy
        className="ml-auto shrink-0 text-slate-500"
        size={15}
        aria-hidden="true"
      />
    </div>
  )
}

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
