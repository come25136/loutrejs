import Link from 'next/link'
import { isValidElement, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import {
  getDocument,
  getDocumentNavigation,
  type DocumentSlug,
} from '../lib/documents'
import { localizedPath, localePrefix, type Locale } from '../lib/i18n'
import { MermaidDiagram } from './mermaid-diagram'
import { ScrollReveal } from './scroll-reveal'

const documentPageCopy = {
  en: {
    documentation: 'Documentation',
    documentationNavigation: 'Documentation navigation',
    examples: 'Examples',
    examplesDescription: 'Runnable examples',
    adjacentDocuments: 'Adjacent documents',
    previous: 'Previous',
    next: 'Next',
    onThisPage: 'On this page',
    onPageNavigation: 'On-page navigation',
  },
  ja: {
    documentation: 'ドキュメント',
    documentationNavigation: 'ドキュメントナビゲーション',
    examples: 'サンプル',
    examplesDescription: '実行可能なサンプル',
    adjacentDocuments: '前後のドキュメント',
    previous: '前へ',
    next: '次へ',
    onThisPage: 'このページ',
    onPageNavigation: 'ページ内ナビゲーション',
  },
} satisfies Record<Locale, Record<string, string>>

function resolveDocumentHref(href: string | undefined, locale: Locale) {
  if (!href) {
    return href
  }

  const markdownLink = /^\.\/([^/]+)\.md(#[\w-]+)?$/.exec(href)

  if (markdownLink) {
    return localizedPath(
      locale,
      `/docs/${markdownLink[1]}/${markdownLink[2] ?? ''}`,
    )
  }

  if (href.startsWith('../examples')) {
    return localizedPath(locale, '/examples/')
  }

  return href
}

type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function getNodeText(node: HastNode): string {
  if (node.type === 'text') {
    return node.value ?? ''
  }

  return node.children?.map(getNodeText).join('') ?? ''
}

function getShellPromptOffsets(code: string) {
  const offsets: number[] = []
  let lineOffset = 0
  let isContinuation = false

  for (const line of code.split('\n')) {
    const trimmedLine = line.trim()

    if (
      trimmedLine.length > 0 &&
      !trimmedLine.startsWith('#') &&
      !isContinuation
    ) {
      offsets.push(lineOffset)
    }

    isContinuation = line.trimEnd().endsWith('\\')
    lineOffset += line.length + 1
  }

  return offsets
}

function createShellPromptNode(): HastNode {
  return {
    type: 'element',
    tagName: 'span',
    properties: {
      ariaHidden: true,
      className: ['select-none', 'text-emerald-400', "before:content-['$_']"],
    },
    children: [],
  }
}

function insertShellPromptNodes(
  node: HastNode,
  promptOffsets: number[],
  state: { textOffset: number; promptIndex: number },
) {
  if (!node.children) {
    return
  }

  node.children = node.children.flatMap((child) => {
    if (child.type !== 'text') {
      insertShellPromptNodes(child, promptOffsets, state)
      return child
    }

    const value = child.value ?? ''
    const nodeStart = state.textOffset
    const nodeEnd = nodeStart + value.length
    const replacementNodes: HastNode[] = []
    let sliceStart = 0

    while (
      state.promptIndex < promptOffsets.length &&
      promptOffsets[state.promptIndex] >= nodeStart &&
      promptOffsets[state.promptIndex] < nodeEnd
    ) {
      const sliceEnd = promptOffsets[state.promptIndex] - nodeStart

      if (sliceEnd > sliceStart) {
        replacementNodes.push({
          type: 'text',
          value: value.slice(sliceStart, sliceEnd),
        })
      }

      replacementNodes.push(createShellPromptNode())
      sliceStart = sliceEnd
      state.promptIndex += 1
    }

    state.textOffset = nodeEnd

    if (replacementNodes.length === 0) {
      return child
    }

    if (sliceStart < value.length) {
      replacementNodes.push({ type: 'text', value: value.slice(sliceStart) })
    }

    return replacementNodes
  })
}

function rehypeShellPrompts() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      const className = node.properties?.className
      const isShellCode =
        node.tagName === 'code' &&
        Array.isArray(className) &&
        className.some(
          (value) => value === 'language-sh' || value === 'language-bash',
        )

      if (isShellCode) {
        const promptOffsets = getShellPromptOffsets(getNodeText(node))

        insertShellPromptNodes(node, promptOffsets, {
          textOffset: 0,
          promptIndex: 0,
        })
        return
      }

      node.children?.forEach(visit)
    }

    visit(tree)
  }
}

const proseClass = [
  'prose prose-gray max-w-none text-[0.96rem] leading-[1.9]',
  'prose-headings:scroll-mt-28 prose-headings:text-ink',
  'prose-h2:mt-18 prose-h2:border-t prose-h2:border-gray-200 prose-h2:pt-12 prose-h2:text-3xl prose-h2:font-bold prose-h2:tracking-[-0.035em]',
  'prose-h3:mt-11 prose-h3:text-xl prose-h3:font-semibold prose-h3:tracking-[-0.02em]',
  'prose-a:font-medium prose-a:text-copper-dark prose-a:decoration-copper-dark/35 prose-a:underline-offset-4',
  'prose-strong:text-ink prose-strong:font-bold',
  'prose-code:rounded-md prose-code:border prose-code:border-gray-200 prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.83em] prose-code:text-[#9a3412] prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:my-7 prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-white/10 prose-pre:bg-[#0f1419] prose-pre:p-6 prose-pre:text-[#e5e7eb] prose-pre:shadow-[0_16px_36px_rgba(17,24,39,0.12)] max-sm:prose-pre:-mx-4 max-sm:prose-pre:rounded-none max-sm:prose-pre:px-5',
  '[&_pre_code]:rounded-none [&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  'prose-blockquote:border-l-copper prose-blockquote:bg-gray-50 prose-blockquote:px-5 prose-blockquote:py-2 prose-blockquote:not-italic prose-blockquote:text-ink-soft',
  'prose-th:bg-gray-50 prose-th:text-ink prose-th:font-bold prose-td:whitespace-nowrap',
  '[&_.hljs-keyword]:text-[#ff9d76] [&_.hljs-selector-tag]:text-[#ff9d76] [&_.hljs-literal]:text-[#ff9d76]',
  '[&_.hljs-string]:text-[#a7d28d] [&_.hljs-title]:text-[#a7d28d] [&_.hljs-section]:text-[#a7d28d]',
  '[&_.hljs-variable]:text-[#f4c58a] [&_.hljs-template-variable]:text-[#f4c58a] [&_.hljs-attr]:text-[#f4c58a] [&_.hljs-property]:text-[#f4c58a]',
  '[&_.hljs-comment]:text-[#7d8790] [&_.hljs-comment]:italic [&_.hljs-quote]:text-[#7d8790] [&_.hljs-quote]:italic',
].join(' ')

export function DocumentPage({
  slug,
  locale,
}: {
  slug: DocumentSlug
  locale: Locale
}) {
  const documentNavigation = getDocumentNavigation(locale)
  const document = getDocument(slug, locale)
  const copy = documentPageCopy[locale]
  const prefix = localePrefix(locale)
  const currentIndex = documentNavigation.findIndex(
    (entry) => entry.slug === slug,
  )
  const previousDocument = documentNavigation[currentIndex - 1]
  const nextDocument = documentNavigation[currentIndex + 1]

  return (
    <main className="border-b border-gray-200 bg-white">
      <div className="shell grid min-h-[calc(100vh-4.5rem)] grid-cols-[210px_minmax(0,720px)_190px] items-start gap-[clamp(2rem,5vw,4.5rem)] py-18 pb-30 max-lg:grid-cols-[190px_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:py-8 max-sm:pb-20">
        <aside className="animate-reveal-up sticky top-28 motion-reduce:animate-none max-sm:static max-sm:overflow-x-auto">
          <p className="mb-4.5 text-xs font-bold tracking-[0.13em] text-ink uppercase max-sm:hidden">
            {copy.documentation}
          </p>
          <nav
            className="flex flex-col gap-1 max-sm:w-max max-sm:flex-row"
            aria-label={copy.documentationNavigation}
          >
            {documentNavigation.map((entry) => (
              <Link
                className={`flex flex-col gap-1 rounded-lg border-l-2 px-3 py-2.5 text-ink-soft transition hover:bg-gray-50 hover:text-ink max-sm:min-w-36 ${entry.slug === slug ? 'border-copper bg-gray-50 text-ink' : 'border-transparent'}`}
                href={`${prefix}/docs/${entry.slug}/`}
                key={entry.slug}
              >
                <span className="text-sm font-bold">{entry.label}</span>
                <small className="text-[0.67rem] text-gray-500">
                  {entry.title}
                </small>
              </Link>
            ))}
            <Link
              className="flex flex-col gap-1 rounded-lg border-l-2 border-transparent px-3 py-2.5 text-ink-soft transition hover:bg-gray-50 hover:text-ink max-sm:min-w-36"
              href={`${prefix}/examples/`}
            >
              <span className="text-sm font-bold">{copy.examples}</span>
              <small className="text-[0.67rem] text-gray-500">
                {copy.examplesDescription}
              </small>
            </Link>
          </nav>
        </aside>

        <article className="animate-reveal-up [animation-delay:90ms] motion-reduce:animate-none">
          <header className="border-b border-gray-200 pb-12 max-sm:pt-5">
            <p className="mb-5 font-mono text-xs font-medium tracking-[0.08em] text-copper-dark uppercase">
              {copy.documentation} / {document.label}
            </p>
            <h1 className="m-0 text-[clamp(2.75rem,5vw,4.25rem)] leading-[1.02] font-bold tracking-[-0.055em] max-sm:text-[3rem]">
              {document.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-ink-soft">
              {document.description}
            </p>
          </header>

          <div className={`${proseClass} pt-8`}>
            <ReactMarkdown
              rehypePlugins={[rehypeSlug, rehypeHighlight, rehypeShellPrompts]}
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ children, ...props }) => (
                  <ScrollReveal>
                    <h2 {...props}>{children}</h2>
                  </ScrollReveal>
                ),
                pre: ({ children, ...props }) => {
                  const code = Array.isArray(children) ? children[0] : children

                  if (
                    isValidElement<{
                      className?: string
                      children?: ReactNode
                    }>(code) &&
                    code.props.className?.includes('language-mermaid')
                  ) {
                    return (
                      <MermaidDiagram
                        chart={String(code.props.children).trim()}
                        locale={locale}
                      />
                    )
                  }

                  return <pre {...props}>{children}</pre>
                },
                a: ({ href, children, ...props }) => {
                  const resolvedHref = resolveDocumentHref(href, locale)
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
            className="mt-20 grid grid-cols-2 gap-3 border-t border-gray-200 pt-7 max-sm:grid-cols-1"
            aria-label={copy.adjacentDocuments}
          >
            {previousDocument ? (
              <Link
                className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4.5 transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-sm"
                href={`${prefix}/docs/${previousDocument.slug}/`}
              >
                <span className="text-[0.67rem] text-gray-500">
                  ← {copy.previous}
                </span>
                <strong className="text-sm">{previousDocument.label}</strong>
              </Link>
            ) : (
              <span />
            )}
            {nextDocument ? (
              <Link
                className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4.5 text-right transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-sm max-sm:text-left"
                href={`${prefix}/docs/${nextDocument.slug}/`}
              >
                <span className="text-[0.67rem] text-gray-500">
                  {copy.next} →
                </span>
                <strong className="text-sm">{nextDocument.label}</strong>
              </Link>
            ) : (
              <Link
                className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4.5 text-right transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-sm max-sm:text-left"
                href={`${prefix}/examples/`}
              >
                <span className="text-[0.67rem] text-gray-500">
                  {copy.next} →
                </span>
                <strong className="text-sm">Example</strong>
              </Link>
            )}
          </nav>
        </article>

        <aside className="animate-reveal-up sticky top-28 [animation-delay:180ms] motion-reduce:animate-none max-lg:hidden">
          <p className="mb-4.5 text-xs font-bold tracking-[0.13em] text-ink uppercase">
            {copy.onThisPage}
          </p>
          <nav
            className="flex max-h-[calc(100vh-180px)] flex-col gap-2 overflow-y-auto border-l border-gray-200 pl-4"
            aria-label={copy.onPageNavigation}
          >
            {document.headings.map((heading) => (
              <a
                className={`text-[0.68rem] leading-5 text-gray-500 transition hover:text-ink ${heading.depth === 3 ? 'pl-3' : ''}`}
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
