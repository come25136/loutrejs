import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'

const output = fileURLToPath(new URL('../out/', import.meta.url))
const origin = 'https://loutrejs.come25136.id'

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? htmlFiles(path)
      : entry.name === 'index.html'
        ? [path]
        : []
  })
}

const sitemap = load(readFileSync(join(output, 'sitemap.xml'), 'utf8'), {
  xmlMode: true,
})
const urls = sitemap('url > loc')
  .toArray()
  .map((node) => sitemap(node).text())
assert.equal(new Set(urls).size, urls.length, 'サイトマップに重複URLがあります')
const pages = new Map(
  htmlFiles(output).flatMap((file) => {
    const html = load(readFileSync(file, 'utf8'))
    if (html('meta[name="robots"]').attr('content')?.includes('noindex'))
      return []
    const path = relative(output, file).replace(/index\.html$/, '')
    return [[`${origin}/${path}`, html]]
  }),
)
assert.deepEqual(
  [...pages.keys()].toSorted(),
  [...urls].toSorted(),
  'サイトマップと公開ページが一致しません',
)

for (const [url, html] of pages) {
  assert.equal(
    html('link[rel="canonical"]').length,
    1,
    `${url} の正規URLが一意ではありません`,
  )
  assert.equal(
    html('link[rel="canonical"]').attr('href'),
    url,
    `${url} の正規URLが異なります`,
  )
  assert.ok(html('title').text().trim(), `${url} にtitleがありません`)
  assert.ok(
    html('meta[name="description"]').attr('content')?.trim(),
    `${url} にdescriptionがありません`,
  )
  assert.equal(
    html('meta[property="og:url"]').attr('content'),
    url,
    `${url} のOG URLが異なります`,
  )
  assert.equal(html('h1').length, 1, `${url} の主見出しが一意ではありません`)
  for (const node of html('link[rel="alternate"][hreflang]').toArray()) {
    const language = html(node).attr('hreflang')
    const target = html(node).attr('href')
    assert.ok(
      pages.has(target),
      `${url} の言語リンク先 ${target} が存在しません`,
    )
    if (language !== 'x-default') {
      assert.ok(
        pages.get(target)(`link[rel="alternate"][href="${url}"]`).length,
        `${target} から ${url} への言語リンクがありません`,
      )
    }
  }
  for (const node of html('a[href]').toArray()) {
    const target = new URL(html(node).attr('href'), url)
    if (target.origin !== origin) continue
    const pathname = `${target.pathname.replace(/\/$/, '')}/`
    assert.ok(
      pages.has(`${origin}${pathname}`),
      `${url} の内部リンク ${target.pathname} が存在しません`,
    )
  }
}
assert.match(
  readFileSync(join(output, 'robots.txt'), 'utf8'),
  /Sitemap: https:\/\/loutrejs\.come25136\.id\/sitemap\.xml/,
)
console.log(
  `検索向けHTML・言語リンク・内部リンク・サイトマップ：${pages.size}ページの検証に成功しました`,
)
