'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { localeFromPathname } from '../lib/i18n'
import { sendAnalyticsEvent } from './site-analytics'

export function CopyInstallCommand({ command }: { readonly command: string }) {
  const pathname = usePathname() ?? '/'
  const locale = localeFromPathname(pathname)
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const label = locale === 'ja' ? 'コマンドをコピー' : 'Copy command'

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setStatus('copied')
      sendAnalyticsEvent('copy_install_command', {
        page_path: pathname,
        content_language: locale,
        destination: 'create-loutre',
      })
    } catch {
      setStatus('failed')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        title={label}
        className="ml-auto shrink-0 rounded p-2 text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {status === 'copied' ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
      </button>
      <span role="status" className="sr-only">
        {status === 'copied'
          ? locale === 'ja'
            ? 'コピーしました'
            : 'Copied'
          : status === 'failed'
            ? locale === 'ja'
              ? 'コピーできませんでした。コマンドを選択してコピーしてください。'
              : 'Copy failed. Select and copy the command.'
            : ''}
      </span>
    </>
  )
}
