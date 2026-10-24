import { load } from 'cheerio'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TypeInferenceSection } from '../components/home/type-inference-section'

describe('トップページのHTTP型推論の紹介', () => {
  it.each(['en', 'ja'] as const)(
    '%sでContractと実装をファイルタブ付きで表示する',
    (locale) => {
      const html = renderToStaticMarkup(
        createElement(TypeInferenceSection, { locale }),
      )
      expect(html).toContain('role="tablist"')
      expect(html).toContain('contract.ts')
      expect(html).toContain('controller.ts')
      expect(html).toContain('language-typescript')
      expect(html).toContain('hljs-keyword')
      const text = load(html).text()
      expect(text).toContain('ctx.input.params.name')
      expect(text).toContain('ctx.response.ok')
      expect(text).not.toContain('TERMINAL')
      expect(text).not.toContain('UTF-8')
      expect(text).not.toContain(' — Loutre')
    },
  )
})
