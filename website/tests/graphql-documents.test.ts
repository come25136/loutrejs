import { describe, expect, it } from 'vitest'
import { getDocument, getDocumentNavigation } from '../lib/documents.js'

describe('GraphQLドキュメント', () => {
  it.each(['en', 'ja'] as const)(
    '%sのナビゲーションからGraphQLガイドへ移動できる',
    (locale) => {
      expect(
        getDocumentNavigation(locale).some(
          (entry) => entry.slug === 'graphql-codegen',
        ),
      ).toBe(true)

      const document = getDocument('graphql-codegen', locale)
      expect(document.content).toContain('graphql.endpoint')
      expect(document.headings.length).toBeGreaterThan(0)
    },
  )
})
