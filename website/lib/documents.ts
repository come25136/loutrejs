import fs from 'node:fs'
import path from 'node:path'
import GithubSlugger from 'github-slugger'

export const documentNavigation = [
  {
    slug: 'getting-started',
    label: 'Getting Started',
    title: 'Loutreをはじめる',
    description:
      'プロジェクト作成からHTTP、Task、Runtime、CLIまでを順に解説します。',
    filename: 'getting-started.md',
  },
  {
    slug: 'architecture',
    label: 'Architecture',
    title: 'Loutreの設計',
    description:
      'Graph-firstの原則と、Applicationを構成する公開境界を解説します。',
    filename: 'architecture.md',
  },
] as const

export type DocumentSlug = (typeof documentNavigation)[number]['slug']

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
  sourceUrl: string
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

export function getDocument(slug: DocumentSlug): Document {
  const entry = documentNavigation.find((document) => document.slug === slug)

  if (!entry) {
    throw new Error(`公開対象ではないドキュメントです: ${slug}`)
  }

  const sourcePath = path.join(getRepositoryRoot(), 'docs', entry.filename)
  const source = fs.readFileSync(sourcePath, 'utf8')
  const content = source.replace(/^#\s+.+\n+/, '')

  return {
    content,
    description: entry.description,
    headings: collectHeadings(content),
    label: entry.label,
    slug: entry.slug,
    sourceUrl: `https://github.com/come25136/loutrejs/blob/main/docs/${entry.filename}`,
    title: entry.title,
  }
}
