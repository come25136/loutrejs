import { load } from 'cheerio'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BatchResolutionDiagram } from '../components/batch-resolution/diagram'
import { batchResolutionCopy } from '../lib/batch-resolution-copy'

describe('Batch Resolutionの比較図', () => {
  it.each(['ja', 'en'] as const)(
    '%sで個別取得3回と一括取得1回を同じ条件で比較する',
    (locale) => {
      const copy = batchResolutionCopy[locale].diagram
      const html = renderToStaticMarkup(
        createElement(BatchResolutionDiagram, { copy }),
      )
      const $ = load(html)
      const figures = $('figure')
        .toArray()
        .map((figure) => $(figure).text())
      expect(figures).toHaveLength(2)
      expect(figures[0]).toContain(copy.individual)
      expect(figures[0]).toContain(`3${copy.callUnit}`)
      expect(figures[1]).toContain(copy.batched)
      expect(figures[1]).toContain(`1${copy.callUnit}`)
      expect(figures[1]).toContain('load([A, B, C])')
      expect(html.indexOf(copy.lead)).toBeLessThan(html.indexOf('<figure'))
      expect(html).not.toContain('OrderItem')
      expect(html).not.toContain('CatalogService')
      expect(html).not.toContain('<fieldset')
      expect(html).not.toContain('type="radio"')
      expect(html).not.toContain('<select')
    },
  )
})
