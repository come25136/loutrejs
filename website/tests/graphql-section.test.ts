import { load } from 'cheerio'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GraphQLSection } from '../components/home/graphql-section'
import { homeCopy } from '../components/home/home-copy'

describe('トップページのGraphQL紹介', () => {
  it.each(['en', 'ja'] as const)(
    '%sでSDLと生成型を使うResolverをハイライトして表示する',
    (locale) => {
      const html = renderToStaticMarkup(
        createElement(GraphQLSection, { locale }),
      )
      const codeBlocks = [...html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)]
      expect(html.match(/<h2\b/g)).toHaveLength(1)
      const subheadings = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)]
      expect(
        subheadings.some(
          ([, title]) => title === homeCopy[locale].batchResolution.title,
        ),
      ).toBe(true)

      expect(html).toContain('language-graphql')
      expect(html).toContain('language-typescript')
      expect(html).toContain('role="tablist"')
      expect(html).toContain('role="tabpanel"')
      const selectedTabs = [
        ...html.matchAll(
          /role="tab"[^>]*aria-selected="true"[^>]*>([\s\S]*?)<\/button>/g,
        ),
      ]
      expect(
        selectedTabs.some(([, content]) => content.includes('resolvers.ts')),
      ).toBe(true)
      expect(html).toContain('endpoint.ts')
      expect(
        codeBlocks.some(
          ([block]) =>
            block.includes('hljs-keyword') && block.includes('increment'),
        ),
      ).toBe(true)
      expect(
        codeBlocks.some(
          ([block]) =>
            block.includes('hljs-keyword') && block.includes('satisfies'),
        ),
      ).toBe(true)

      const text = load(html).text()
      expect(text).toContain('increment(amount: Int!): Counter!')
      expect(text).toContain('args.amount')
      expect(text).toContain('Resolvers<AppContext>')
      expect(text).not.toContain('TERMINAL')
      expect(text).not.toContain('UTF-8')
      expect(text).not.toContain(' — Loutre')
      expect(text).toContain('schemaDocument')
      expect(text).toContain('bindManifest')
      expect(html).toMatch(
        new RegExp(
          `href="${locale === 'ja' ? '/ja' : ''}/docs/graphql-codegen/?"`,
        ),
      )
    },
  )
})
