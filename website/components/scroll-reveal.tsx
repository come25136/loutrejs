'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function ScrollReveal({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const elementRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const element = elementRef.current

    if (!element) {
      return
    }

    if (!('IntersectionObserver' in window)) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return
        }

        setIsVisible(true)
        observer.disconnect()
      },
      {
        rootMargin: '0px 0px -25% 0px',
        threshold: 0.08,
      },
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={elementRef}
      className={`${className} ${
        isVisible
          ? 'animate-reveal-up'
          : 'translate-y-5 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100'
      } motion-reduce:animate-none`}
    >
      {children}
    </div>
  )
}
