import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HomePage } from '../components/home-page'

describe('トップページの機能案内', () => {
  it('見出しから機能を探し、その中でGraphQLの個別機能を確認できる', () => {
    const html = renderToStaticMarkup(createElement(HomePage, { locale: 'ja' }))
    const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map(
      ([, content]) => content!.replace(/<[^>]*>/g, ''),
    )
    const featureHeadings = [
      '複数のランタイムに対応',
      'DevTools',
      'HTTP APIの型推論',
      'GraphQL',
      'アプリケーションモデル',
      'AIエージェントとの連携',
      '今すぐ試す',
    ]
    expect(
      headings.filter((heading) => featureHeadings.includes(heading)),
    ).toEqual(featureHeadings)
    expect(html).toMatch(/<h3\b[^>]*>N\+1対策<\/h3>/)
    expect(html).toContain('DataLoader')
    expect(html).toMatch(/href="\/ja\/docs\/graphql-codegen\/?"/)
    expect(html).toMatch(/href="\/ja\/docs\/architecture\/?"/)
  })
})
