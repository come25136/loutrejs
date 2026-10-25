import { describe, expect, it } from 'vitest'
import { getDocument, getDocumentNavigation } from '../lib/documents'

describe('N+1問題の実行ガイド', () => {
  it('日本語のDocsからサンプルの起動と計測値の意味を確認できる', () => {
    expect(
      getDocumentNavigation('ja').some(
        (entry) => entry.slug === 'graphql-n-plus-one',
      ),
    ).toBe(true)
    const document = getDocument('graphql-n-plus-one', 'ja')
    expect(document.content).toContain('productBatchCount')
    expect(document.content).toContain(
      'npm run dev --workspace @loutrejs/example-graphql-orders',
    )
    expect(document.content).toContain('毎回差分を取ります')
    expect(document.content).toContain('必ず1回')
    expect(document.content).toContain('SQLの実行回数')
    expect(document.content).toContain('./graphql-codegen.md')
    expect(document.headings.length).toBeGreaterThan(3)
  })
})
