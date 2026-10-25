import { load } from 'cheerio'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BatchResolutionPage } from '../components/batch-resolution-page'

describe('Batch Resolutionの機能詳細', () => {
  it.each(['en', 'ja'] as const)(
    '%sで個別取得と一括取得の比較・実装からDocsへ進める',
    (locale) => {
      const html = renderToStaticMarkup(
        createElement(BatchResolutionPage, { locale }),
      )
      expect(html.match(/<h1[ >]/g)).toHaveLength(1)
      expect(html.match(/<figure/g)).toHaveLength(2)
      expect(html).not.toContain('id="reuse"')
      expect(html).not.toContain('href="#reuse"')
      expect(html).not.toContain('type="radio"')
      expect(html).toContain('language-typescript')
      expect(html).toContain('hljs-keyword')
      for (const id of ['comparison', 'implementation']) {
        expect(html).toContain(`id="${id}"`)
        expect(html).toContain(`href="#${id}"`)
      }
      const text = load(html).text()
      expect(text).toContain('load([A, B, C])')
      expect(text).toContain('parents: items')
      expect(text).toContain('findForItems')
      expect(html).toMatch(
        new RegExp(
          `href="${locale === 'ja' ? '/ja' : ''}/docs/graphql-codegen/?"`,
        ),
      )
      expect(html).toContain(
        'https://github.com/come25136/loutrejs/tree/main/examples/graphql-orders',
      )
    },
  )
})
