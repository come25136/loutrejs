import { load } from 'cheerio'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CodeEditor } from '../components/code-editor'

function renderEditor() {
  return load(
    renderToStaticMarkup(
      createElement(CodeEditor, {
        project: 'counter',
        label: '契約と実装の比較',
        panes: [
          [
            {
              path: 'contracts/counter.graphql',
              language: 'graphql',
              content: 'type Query { counter: Int! }',
            },
          ],
          [
            {
              path: 'src/resolvers.ts',
              language: 'typescript',
              content: 'export const resolvers = {}',
            },
            {
              path: 'src/endpoint.ts',
              language: 'typescript',
              content: 'export const endpoint = {}',
            },
          ],
        ],
      }),
    ),
  )
}

describe('コード比較のアクセシビリティ', () => {
  it('比較するコード全体を名前付きのグループで識別できる', () => {
    const $ = renderEditor()
    expect($('[role="group"]').attr('aria-label')).toBe('契約と実装の比較')
  })

  it('Explorerから各ペインの表示中のファイルを識別できる', () => {
    const $ = renderEditor()
    const currentFiles = $('aside button[aria-current="true"]')
      .toArray()
      .map((button) => $(button).text())
    expect(currentFiles).toEqual(['counter.graphql', 'resolvers.ts'])
    expect($('aside button').last().attr('aria-current')).toBeUndefined()
  })
})
