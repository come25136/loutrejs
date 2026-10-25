import { load } from 'cheerio'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BatchResolutionPreview } from '../components/home/batch-resolution-preview'
import { homeCopy } from '../components/home/home-copy'

describe('トップページのBatch Resolution紹介', () => {
  it.each(['en', 'ja'] as const)(
    '%sのLPは短い図から機能詳細へ移動できる',
    (locale) => {
      const html = renderToStaticMarkup(
        createElement(BatchResolutionPreview, { locale }),
      )
      expect(html.match(/<figure/g)).toHaveLength(1)
      expect(html.match(/<svg[^>]*role="img"/g)).toHaveLength(1)
      expect(html).not.toContain('<select')
      expect(html).not.toContain('role="tablist"')
      expect(html).not.toContain('maxBatchSize')
      expect(html).not.toMatch(/<h[12]\b/)
      expect(html).toMatch(/<h3\b/)
      const text = load(html).text()
      expect(text).toContain('N+1')
      expect(text).toContain('load')
      expect(text).toContain('Loutre')
      expect(homeCopy[locale].batchResolution.body.length).toBeLessThan(90)
      expect(html).toMatch(
        new RegExp(
          `href="${locale === 'ja' ? '/ja' : ''}/features/batch-resolution/?"`,
        ),
      )
    },
  )
})
