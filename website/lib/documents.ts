import fs from 'node:fs'
import path from 'node:path'
import GithubSlugger from 'github-slugger'
import type { Locale } from './i18n'

const documentMetadata = {
  en: [
    {
      slug: 'getting-started',
      label: 'Getting Started',
      title: 'Get started with Loutre',
      description:
        'Learn how to create a project and work with HTTP, Tasks, Runtimes, and the CLI.',
      filename: 'getting-started.md',
    },
    {
      slug: 'graphql-codegen',
      label: 'GraphQL',
      title: 'GraphQL, Codegen & Data Resolution',
      description:
        'Use SDL-first Codegen, HTTP, WebSocket Subscriptions, and batched Data Resolution.',
      filename: 'graphql-codegen.md',
    },
    {
      slug: 'architecture',
      label: 'Architecture',
      title: 'Loutre Architecture',
      description:
        'Explore the public boundaries that connect Application, Runtime, and Tooling.',
      filename: 'architecture.md',
    },
  ],
  ja: [
    {
      slug: 'getting-started',
      label: 'はじめる',
      title: 'Loutreをはじめる',
      description:
        'プロジェクト作成からHTTP、Task、Runtime、CLIまでを順に解説します。',
      filename: 'getting-started.md',
    },
    {
      slug: 'graphql-codegen',
      label: 'GraphQL',
      title: 'GraphQLとCodegen',
      description:
        'SDLから型付きResolverを生成し、HTTP・Subscription・Batch Data Resolutionを実装します。',
      filename: 'graphql-codegen.md',
    },
    {
      slug: 'graphql-n-plus-one',
      label: 'N+1問題を確認する',
      title: 'GraphQLのN+1問題をTypeScriptで確認する',
      description:
        'Ordersサンプルを動かし、先読みとBatch Resolutionの取得回数を比較します。',
      filename: 'graphql-n-plus-one.md',
    },
    {
      slug: 'architecture',
      label: 'Architecture',
      title: 'Loutre Architecture',
      description:
        'Application、Runtime、Toolingをつなぐ公開インターフェースを解説します。',
      filename: 'architecture.md',
    },
  ],
} as const

const documentDirectories: Record<Locale, string> = {
  en: 'docs',
  ja: path.join('docs', 'ja'),
}

export type DocumentSlug = (typeof documentMetadata)[Locale][number]['slug']

export function getDocumentNavigation(locale: Locale) {
  return documentMetadata[locale]
}

export type DocumentHeading = {
  depth: 2 | 3
  id: string
  text: string
}

export type Document = {
  content: string
  description: string
  headings: DocumentHeading[]
  label: string
  slug: DocumentSlug
  title: string
}

function getRepositoryRoot() {
  return fs.existsSync(path.join(process.cwd(), 'docs'))
    ? process.cwd()
    : path.resolve(process.cwd(), '..')
}

function plainHeading(value: string) {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim()
}

function collectHeadings(markdown: string) {
  const slugger = new GithubSlugger()

  return markdown.split('\n').flatMap<DocumentHeading>((line) => {
    const match = /^(##|###)\s+(.+)$/.exec(line)

    if (!match) {
      return []
    }

    const text = plainHeading(match[2])

    return [
      {
        depth: match[1].length as 2 | 3,
        id: slugger.slug(text),
        text,
      },
    ]
  })
}

export function getDocument(slug: DocumentSlug, locale: Locale): Document {
  const entry = getDocumentNavigation(locale).find(
    (document) => document.slug === slug,
  )

  if (!entry) {
    throw new Error(`Document is not published: ${slug}`)
  }

  const localizedDirectory = documentDirectories[locale]
  const sourcePath = path.join(
    getRepositoryRoot(),
    localizedDirectory,
    entry.filename,
  )
  const source = fs.readFileSync(sourcePath, 'utf8')
  const content = source.replace(/^#\s+.+\n+/, '')

  return {
    content,
    description: entry.description,
    headings: collectHeadings(content),
    label: entry.label,
    slug: entry.slug,
    title: entry.title,
  }
}
