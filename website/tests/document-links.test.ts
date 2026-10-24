import { describe, expect, it } from 'vitest'
import { resolveDocumentHref } from '../lib/document-links'

describe('Docsのリンク解決', () => {
  it.each(['ja', 'en'] as const)(
    '%sで公式サイトへの絶対URLを閲覧中の環境の内部パスにする',
    (locale) => {
      expect(
        resolveDocumentHref(
          'https://loutrejs.come25136.id/ja/features/batch-resolution/?from=docs#comparison',
          locale,
        ),
      ).toBe('/ja/features/batch-resolution/?from=docs#comparison')
      expect(
        resolveDocumentHref('https://loutrejs.come25136.id/', locale),
      ).toBe('/')
    },
  )

  it.each([
    'https://github.com/come25136/loutrejs',
    'https://loutrejs.come25136.id.example.com/ja/',
    'https://example.com/?url=https://loutrejs.come25136.id/',
    '#comparison',
    'mailto:hello@example.com',
    undefined,
  ])('公式サイト以外のリンク %s は変更しない', (href) => {
    expect(resolveDocumentHref(href, 'ja')).toBe(href)
  })

  it.each(['ja', 'en'] as const)(
    '%sでMarkdownとサンプルのリンクを対応する言語へ向ける',
    (locale) => {
      const prefix = locale === 'ja' ? '/ja' : ''
      expect(resolveDocumentHref('./getting-started.md#setup', locale)).toBe(
        `${prefix}/docs/getting-started/#setup`,
      )
      expect(resolveDocumentHref('../examples/hello-http', locale)).toBe(
        `${prefix}/examples/`,
      )
    },
  )
})
