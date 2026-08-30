import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import {
  documentNavigation,
  getDocument,
  type DocumentSlug,
} from '../lib/documents'

function resolveDocumentHref(href: string | undefined) {
  if (!href) {
    return href
  }

  const markdownLink = /^\.\/([^/]+)\.md(#[\w-]+)?$/.exec(href)

  if (markdownLink) {
    return `/docs/${markdownLink[1]}/${markdownLink[2] ?? ''}`
  }

  if (href.startsWith('../examples')) {
    return '/examples/'
  }

  return href
}

const proseClass = [
  'prose prose-stone max-w-none text-[0.96rem] leading-[1.9]',
  'prose-headings:scroll-mt-28 prose-headings:text-ink',
  'prose-h2:mt-18 prose-h2:border-t prose-h2:border-ink/15 prose-h2:pt-12 prose-h2:font-serif prose-h2:text-3xl prose-h2:font-semibold prose-h2:tracking-[-0.035em]',
  'prose-h3:mt-11 prose-h3:text-xl prose-h3:tracking-[-0.02em]',
  'prose-a:text-copper-dark prose-a:decoration-copper-dark/35 prose-a:underline-offset-4',
  'prose-strong:text-ink prose-strong:font-bold',
  'prose-code:rounded-[5px] prose-code:border prose-code:border-copper-dark/15 prose-code:bg-[#f1e8dc] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.83em] prose-code:text-[#71391f] prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:my-7 prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-white/10 prose-pre:bg-[#1c1714] prose-pre:p-6 prose-pre:text-[#eadfd2] prose-pre:shadow-[0_14px_36px_rgba(55,35,24,0.12)] max-sm:prose-pre:-mx-4 max-sm:prose-pre:rounded-none max-sm:prose-pre:px-5',
  'prose-blockquote:border-l-copper prose-blockquote:bg-paper prose-blockquote:px-5 prose-blockquote:py-2 prose-blockquote:not-italic prose-blockquote:text-ink-soft',
  'prose-th:bg-paper-deep prose-th:text-ink prose-th:font-bold prose-td:whitespace-nowrap',
  '[&_.hljs-keyword]:text-[#e29b77] [&_.hljs-selector-tag]:text-[#e29b77] [&_.hljs-literal]:text-[#e29b77]',
  '[&_.hljs-string]:text-[#b9cc95] [&_.hljs-title]:text-[#b9cc95] [&_.hljs-section]:text-[#b9cc95]',
  '[&_.hljs-variable]:text-[#dfbd90] [&_.hljs-template-variable]:text-[#dfbd90] [&_.hljs-attr]:text-[#dfbd90] [&_.hljs-property]:text-[#dfbd90]',
  '[&_.hljs-comment]:text-[#897c72] [&_.hljs-comment]:italic [&_.hljs-quote]:text-[#897c72] [&_.hljs-quote]:italic',
].join(' ')

export function DocumentPage({ slug }: { slug: DocumentSlug }) {
  const document = getDocument(slug)
  const currentIndex = documentNavigation.findIndex(
    (entry) => entry.slug === slug,
  )
  const previousDocument = documentNavigation[currentIndex - 1]
  const nextDocument = documentNavigation[currentIndex + 1]

  return (
    <main className="border-b border-ink/15 bg-cream">
      <div className="shell grid min-h-[calc(100vh-4.5rem)] grid-cols-[210px_minmax(0,720px)_190px] items-start gap-[clamp(2rem,5vw,4.5rem)] py-18 pb-30 max-lg:grid-cols-[190px_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:py-8 max-sm:pb-20">
        <aside className="sticky top-28 max-sm:static max-sm:overflow-x-auto">
          <p className="mb-4.5 text-xs font-extrabold tracking-[0.13em] text-copper-dark uppercase max-sm:hidden">
            Documentation
          </p>
          <nav
            className="flex flex-col gap-1 max-sm:w-max max-sm:flex-row"
            aria-label="ドキュメントナビゲーション"
          >
            {documentNavigation.map((entry) => (
              <Link
                className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-ink-soft hover:bg-paper-deep hover:text-ink max-sm:min-w-36 ${entry.slug === slug ? 'bg-paper-deep text-ink' : ''}`}
                href={`/docs/${entry.slug}/`}
                key={entry.slug}
              >
                <span className="text-sm font-bold">{entry.label}</span>
                <small className="text-[0.67rem] text-[#807166]">
                  {entry.title}
                </small>
              </Link>
            ))}
            <Link
              className="flex flex-col gap-1 rounded-xl px-3 py-2.5 text-ink-soft hover:bg-paper-deep hover:text-ink max-sm:min-w-36"
              href="/examples/"
            >
              <span className="text-sm font-bold">Examples</span>
              <small className="text-[0.67rem] text-[#807166]">
                実行可能なサンプル
              </small>
            </Link>
          </nav>
          <a
            className="mt-6 flex justify-between border-t border-ink/15 px-3 pt-4 text-xs font-semibold text-ink-soft max-sm:hidden"
            href={document.sourceUrl}
          >
            GitHubで編集 <span aria-hidden="true">↗</span>
          </a>
        </aside>

        <article>
          <header className="border-b border-ink/15 pb-14 max-sm:pt-5">
            <p className="mb-6 flex items-center gap-3 text-xs font-extrabold tracking-[0.17em] text-copper-dark uppercase">
              <span className="h-0.5 w-6 bg-current" aria-hidden="true" />{' '}
              {document.label}
            </p>
            <h1 className="m-0 font-serif text-[clamp(2.8rem,5vw,4.9rem)] leading-[1.03] font-medium tracking-[-0.055em] max-sm:text-[3.25rem]">
              {document.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-ink-soft">
              {document.description}
            </p>
          </header>

          <div className={`${proseClass} pt-8`}>
            <ReactMarkdown
              rehypePlugins={[rehypeSlug, rehypeHighlight]}
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => {
                  const resolvedHref = resolveDocumentHref(href)
                  const external = resolvedHref?.startsWith('http')

                  if (external) {
                    return (
                      <a
                        href={resolvedHref}
                        rel="noreferrer"
                        target="_blank"
                        {...props}
                      >
                        {children}
                      </a>
                    )
                  }

                  return (
                    <Link href={resolvedHref ?? '#'} {...props}>
                      {children}
                    </Link>
                  )
                },
              }}
            >
              {document.content}
            </ReactMarkdown>
          </div>

          <nav
            className="mt-20 grid grid-cols-2 gap-3.5 border-t border-ink/15 pt-7 max-sm:grid-cols-1"
            aria-label="前後のドキュメント"
          >
            {previousDocument ? (
              <Link
                className="flex flex-col gap-2 rounded-xl border border-ink/15 bg-paper p-4.5 transition hover:-translate-y-0.5 hover:border-copper-dark/50"
                href={`/docs/${previousDocument.slug}/`}
              >
                <span className="text-[0.67rem] text-[#85776c]">← 前へ</span>
                <strong className="text-sm">{previousDocument.label}</strong>
              </Link>
            ) : (
              <span />
            )}
            {nextDocument ? (
              <Link
                className="flex flex-col gap-2 rounded-xl border border-ink/15 bg-paper p-4.5 text-right transition hover:-translate-y-0.5 hover:border-copper-dark/50 max-sm:text-left"
                href={`/docs/${nextDocument.slug}/`}
              >
                <span className="text-[0.67rem] text-[#85776c]">次へ →</span>
                <strong className="text-sm">{nextDocument.label}</strong>
              </Link>
            ) : (
              <Link
                className="flex flex-col gap-2 rounded-xl border border-ink/15 bg-paper p-4.5 text-right transition hover:-translate-y-0.5 hover:border-copper-dark/50 max-sm:text-left"
                href="/examples/"
              >
                <span className="text-[0.67rem] text-[#85776c]">次へ →</span>
                <strong className="text-sm">Examples</strong>
              </Link>
            )}
          </nav>
        </article>

        <aside className="sticky top-28 max-lg:hidden">
          <p className="mb-4.5 text-xs font-extrabold tracking-[0.13em] text-copper-dark uppercase">
            このページ
          </p>
          <nav
            className="flex max-h-[calc(100vh-180px)] flex-col gap-2 overflow-y-auto border-l border-ink/15 pl-4"
            aria-label="ページ内ナビゲーション"
          >
            {document.headings.map((heading) => (
              <a
                className={`text-[0.68rem] leading-5 text-[#786a60] hover:text-copper-dark ${heading.depth === 3 ? 'pl-3' : ''}`}
                href={`#${heading.id}`}
                key={heading.id}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        </aside>
      </div>
    </main>
  )
}
