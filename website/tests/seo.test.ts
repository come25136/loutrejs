import { describe, expect, it } from 'vitest'
import { pageMetadata } from '../lib/seo'
import { sitePages } from '../lib/site-pages'
import { siteUrl } from '../lib/site'
import { switchLocalePath } from '../lib/i18n'
import sitemap from '../app/sitemap'
import robots from '../app/robots'

describe('検索向けの公開ページ情報', () => {
  it('すべての公開ページが自身の正規URLと実在する翻訳先を持つ', () => {
    for (const page of sitePages) {
      for (const locale of page.locales) {
        const metadata = pageMetadata(page.path, locale, {
          title: 'ページの主題',
          description: 'ページ固有の説明',
        })
        const prefix = locale === 'ja' ? '/ja' : ''
        expect(metadata.alternates?.canonical).toBe(
          `${siteUrl}${prefix}${page.path}`,
        )
        expect(metadata.openGraph).toMatchObject({
          url: `${siteUrl}${prefix}${page.path}`,
          title: 'ページの主題',
          description: 'ページ固有の説明',
          locale: locale === 'ja' ? 'ja_JP' : 'en_US',
        })
        expect(metadata.twitter).toMatchObject({ title: 'ページの主題' })
        const languages = metadata.alternates?.languages
        expect(Object.keys(languages ?? {})).toEqual([
          ...page.locales,
          'x-default',
        ])
        for (const language of page.locales) {
          expect(languages?.[language]).toBe(
            `${siteUrl}${language === 'ja' ? '/ja' : ''}${page.path}`,
          )
        }
      }
    }
  })

  it('サイトマップが翻訳を含むすべての公開URLを重複なく案内する', () => {
    const entries = sitemap()
    const expected = sitePages.flatMap((page) =>
      page.locales.map(
        (locale) => `${siteUrl}${locale === 'ja' ? '/ja' : ''}${page.path}`,
      ),
    )
    expect(entries.map((entry) => entry.url).toSorted()).toEqual(
      expected.toSorted(),
    )
    expect(new Set(expected).size).toBe(expected.length)
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    )
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: `${siteUrl}/sitemap.xml`,
    })
  })

  it('翻訳がない記事の言語切り替えで存在しないURLへ案内しない', () => {
    expect(switchLocalePath('/ja/docs/graphql-n-plus-one/', 'ja', 'en')).toBe(
      '/',
    )
    expect(switchLocalePath('/ja/docs/graphql-codegen/', 'ja', 'en')).toBe(
      '/docs/graphql-codegen/',
    )
  })
})
