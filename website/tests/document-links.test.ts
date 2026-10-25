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
      const examples = locale === 'ja' ? '../../examples' : '../examples'
      expect(resolveDocumentHref(`${examples}/hello-http`, locale)).toBe(
        `${prefix}/examples/`,
      )
    },
  )

  it.each([
    ['en', './adr/loutre_graphql_codegen_architecture.md#decision'],
    ['ja', '../adr/loutre_graphql_codegen_architecture.md#decision'],
  ] as const)('%sのADRへのリンクはGitHub上の原稿を参照する', (locale, href) => {
    expect(resolveDocumentHref(href, locale)).toBe(
      'https://github.com/come25136/loutrejs/blob/main/docs/adr/loutre_graphql_codegen_architecture.md#decision',
    )
  })

  it('言語ディレクトリをまたぐリンクも参照先の言語で表示する', () => {
    expect(resolveDocumentHref('./ja/architecture.md#logger', 'en')).toBe(
      '/ja/docs/architecture/#logger',
    )
    expect(
      resolveDocumentHref('../getting-started.md?from=docs#setup', 'ja'),
    ).toBe('/docs/getting-started/?from=docs#setup')
  })

  it('未公開の文書は存在しないサイト内URLにせず原稿を参照する', () => {
    expect(resolveDocumentHref('./unpublished.md', 'ja')).toBe(
      'https://github.com/come25136/loutrejs/blob/main/docs/ja/unpublished.md',
    )
    expect(resolveDocumentHref('../../README.md', 'ja')).toBe(
      'https://github.com/come25136/loutrejs/blob/main/README.md',
    )
  })
})
