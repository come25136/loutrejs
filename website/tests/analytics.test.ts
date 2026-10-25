import { describe, expect, it } from 'vitest'
import { AnalyticsSession, linkEvent, pageView } from '../lib/analytics'

describe('公式サイトの利用計測', () => {
  it('通常の閲覧にはデバッグ指定を含めず、検証時だけ有効にする', () => {
    for (const debug of [false, true]) {
      const events: unknown[][] = []
      new AnalyticsSession((...args) => events.push(args)).view(
        '/ja/',
        '',
        'トップ',
        debug,
      )
      const config = events.find((event) => event[0] === 'config')?.[2]
      expect(config).toEqual(
        debug
          ? { send_page_view: false, debug_mode: true }
          : { send_page_view: false },
      )
    }
  })
  it('初回・内部移動・戻るを各一回計測し同じパスの再描画では増やさない', () => {
    const events: unknown[][] = []
    const session = new AnalyticsSession((...args) => events.push(args))
    session.view('/ja/', '', 'トップ')
    session.view('/ja/', '', 'トップ')
    session.view('/ja/docs/getting-started/', '', 'はじめる')
    session.view('/ja/', '', 'トップ')
    expect(events.filter((event) => event[0] === 'config')).toHaveLength(1)
    expect(events.find((event) => event[0] === 'config')?.[2]).toMatchObject({
      send_page_view: false,
    })
    expect(
      events.filter((event) => event[0] === 'event').map((event) => event[2]),
    ).toEqual([
      expect.objectContaining({ page_path: '/ja/', page_title: 'トップ' }),
      expect.objectContaining({
        page_path: '/ja/docs/getting-started/',
        page_title: 'はじめる',
      }),
      expect.objectContaining({ page_path: '/ja/', page_title: 'トップ' }),
    ])
  })

  it('別の閲覧セッションで初回計測の状態を共有しない', () => {
    const events: unknown[][] = []
    for (let index = 0; index < 2; index++) {
      new AnalyticsSession((...args) => events.push(args)).view(
        '/ja/',
        '',
        'トップ',
      )
    }
    expect(events.filter((event) => event[0] === 'event')).toHaveLength(2)
  })

  it('閲覧URLからクエリとフラグメントを除き参照元はオリジンだけにする', () => {
    expect(
      pageView(
        '/ja/devtools/trace/?trace=private#span',
        'https://example.com/private?q=secret',
      ),
    ).toEqual({
      page_location: 'https://loutrejs.come25136.id/ja/devtools/trace/',
      page_path: '/ja/devtools/trace/',
      content_language: 'ja',
      page_referrer: 'https://example.com/',
    })
    expect(pageView('/not-published/', '')).toBeUndefined()
    expect(pageView('/ja/', '')?.page_referrer).toBe('')
  })

  it.each([
    [
      '/ja/docs/getting-started/?source=secret#install',
      'view_documentation',
      '/ja/docs/getting-started/',
    ],
    [
      'https://stackblitz.com/fork/github/come25136/loutrejs/tree/main/examples/hello-http?title=secret',
      'try_example',
      '/fork/github/come25136/loutrejs/tree/main/examples/hello-http',
    ],
    [
      'https://github.com/come25136/loutrejs/tree/main/examples/graphql-orders?query=secret',
      'visit_repository',
      '/come25136/loutrejs/tree/main/examples/graphql-orders',
    ],
    [
      'https://www.npmjs.com/package/@loutrejs/loutre?query=secret',
      'visit_package',
      '/package/@loutrejs/loutre',
    ],
  ])(
    'リンク %s の利用行動と安全な移動先を識別する',
    (href, name, destination) => {
      expect(linkEvent(href, '/ja/')).toEqual({
        name,
        parameters: { page_path: '/ja/', content_language: 'ja', destination },
      })
    },
  )

  it.each([
    'https://github.com/other/repository',
    'https://github.com/come25136/loutrejs-fake',
    'https://stackblitz.com/fork/github/other/project',
    'https://www.npmjs.com/package/unrelated',
    'https://github.com.evil.example/come25136/loutrejs',
    '/ja/docs/not-published/',
    'mailto:hello@example.com',
    '#installation',
  ])('未知のリンクやページ内移動 %s を利用行動へ含めない', (href) => {
    expect(linkEvent(href, '/ja/')).toBeUndefined()
  })

  it('閲覧中のDocsへのアンカー移動と未公開ページからの操作を計測しない', () => {
    expect(linkEvent('#load', '/ja/docs/graphql-codegen/')).toBeUndefined()
    expect(
      linkEvent('/ja/docs/getting-started/', '/not-published/'),
    ).toBeUndefined()
  })
})
