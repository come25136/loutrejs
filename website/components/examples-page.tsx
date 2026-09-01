import { ArrowUpRight } from 'lucide-react'
import type { Locale } from '../lib/i18n'
import { ScrollReveal } from './scroll-reveal'

const buttonClass =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-transparent bg-action px-5 text-sm font-semibold text-action-foreground transition hover:-translate-y-0.5 hover:bg-action-hover max-sm:w-full'

const examples = [
  {
    name: 'Hello CLI',
    slug: 'hello-cli',
    stackblitzUrl: null,
    description: {
      en: 'A CLI application that accepts arguments and runs a Task',
      ja: '引数を受け取り、Taskを実行するCLI application',
    },
  },
  {
    name: 'Hello Worker',
    slug: 'hello-worker',
    stackblitzUrl: null,
    description: {
      en: 'A Worker that repeatedly runs a Task with fixedDelay',
      ja: 'fixedDelayでTaskを繰り返し実行するWorker',
    },
  },
  {
    name: 'Hello HTTP',
    slug: 'hello-http',
    stackblitzUrl:
      'https://stackblitz.com/fork/github/come25136/loutrejs/tree/main/examples/hello-http?startScript=dev&title=Loutre%20Hello%20HTTP&initialpath=%2FLoutre',
    description: {
      en: 'A minimal HTTP API with path parameters and validation',
      ja: 'path parameterとvalidationを含む最小構成のHTTP API',
    },
  },
  {
    name: 'Basic Auth',
    slug: 'basic-auth',
    stackblitzUrl: null,
    description: {
      en: 'Protect an API with HTTP Basic authentication',
      ja: 'HTTP Basic認証でAPIを保護する',
    },
  },
  {
    name: 'Bearer Auth',
    slug: 'bearer-auth',
    stackblitzUrl: null,
    description: {
      en: 'Validate bearer tokens to protect an API',
      ja: 'Bearer tokenを検証してAPIを保護する',
    },
  },
  {
    name: 'CORS',
    slug: 'cors',
    stackblitzUrl: null,
    description: {
      en: 'Handle CORS and preflight requests in a Pipeline',
      ja: 'PipelineでCORSとpreflight requestを処理する',
    },
  },
  {
    name: 'Database Transactions',
    slug: 'database-transactions',
    stackblitzUrl: null,
    description: {
      en: 'The fundamentals of using transactions',
      ja: 'Transactionの基本的な使い方',
    },
  },
  {
    name: 'PostgreSQL',
    slug: 'database-postgres',
    stackblitzUrl: null,
    description: {
      en: 'PostgreSQL transactions with pg',
      ja: 'pgを使ったPostgreSQL transaction',
    },
  },
  {
    name: 'Drizzle + PostgreSQL',
    slug: 'database-drizzle-postgres',
    stackblitzUrl: null,
    description: {
      en: 'Transactions with Drizzle and PostgreSQL',
      ja: 'DrizzleとPostgreSQLを使ったtransaction',
    },
  },
  {
    name: 'Prisma + PostgreSQL',
    slug: 'database-prisma-postgres',
    stackblitzUrl: null,
    description: {
      en: 'Use Prisma interactive transactions from a Pipeline',
      ja: 'Prisma interactive transactionをPipelineから使う',
    },
  },
] as const

const examplesCopy = {
  en: {
    headingFirst: 'Learn Loutre',
    headingSecond: 'from working code',
    categories: 'HTTP, CLI, Worker, Auth, and Database',
    introduction: 'Explore focused examples for each use case',
    listLabel: 'Loutre examples',
    tryInStackBlitz: 'Try in StackBlitz',
    viewCode: 'View code',
  },
  ja: {
    headingFirst: '動くコードから',
    headingSecond: 'Loutreを学ぶ',
    categories: 'HTTP、CLI、Worker、Auth、Database',
    introduction: '用途別のサンプルから使い方を確認できます',
    listLabel: 'Loutreのサンプル一覧',
    tryInStackBlitz: 'StackBlitzで試す',
    viewCode: 'コードを見る',
  },
} satisfies Record<Locale, Record<string, string>>

export function ExamplesPage({ locale }: { locale: Locale }) {
  const copy = examplesCopy[locale]

  return (
    <main className="border-b border-line bg-paper pb-30 dark:bg-transparent">
      <section className="shell animate-reveal-up border-b border-line py-20 motion-reduce:animate-none">
        <p className="mb-5 font-mono text-xs font-medium tracking-[0.08em] text-copper-dark uppercase">
          Examples
        </p>
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-20 max-lg:grid-cols-1 max-lg:gap-8">
          <h1 className="m-0 min-w-0 text-[clamp(3rem,6vw,5.25rem)] leading-[0.98] font-bold tracking-[-0.065em]">
            <span className="block">{copy.headingFirst}</span>
            <span className="block">{copy.headingSecond}</span>
          </h1>
          <p className="m-0 min-w-0 max-w-lg self-end leading-8 text-ink-soft">
            <span className="block">{copy.categories}</span>
            <span className="block">{copy.introduction}</span>
          </p>
        </div>
      </section>

      <ScrollReveal>
        <section
          className="shell mt-12 grid grid-cols-2 gap-4 max-sm:grid-cols-1"
          aria-label={copy.listLabel}
        >
          {examples.map((example) => (
            <article
              className="group flex min-h-60 flex-col rounded-xl border border-line bg-surface p-7 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_14px_36px_rgba(17,24,39,0.08)] max-sm:min-h-64"
              key={example.slug}
            >
              <h2 className="mb-3.5 text-2xl font-bold tracking-[-0.04em]">
                {example.name}
              </h2>
              <p className="m-0 max-w-lg text-sm leading-7 text-ink-soft">
                {example.description[locale]}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                {example.stackblitzUrl !== null && (
                  <a
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-action px-3.5 text-xs font-bold text-action-foreground transition hover:bg-action-hover"
                    href={example.stackblitzUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copy.tryInStackBlitz}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </a>
                )}
                <a
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-xs font-bold transition hover:border-line-strong hover:bg-surface-muted"
                  href={`https://github.com/come25136/loutrejs/tree/main/examples/${example.slug}`}
                >
                  {copy.viewCode}
                  <ArrowUpRight
                    className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </a>
              </div>
            </article>
          ))}
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="shell mt-10 flex items-center justify-end gap-8 rounded-xl border border-line bg-surface-muted px-6 py-5 max-sm:flex-col max-sm:items-stretch">
          <a
            className={buttonClass}
            href="https://github.com/come25136/loutrejs/tree/main/examples"
          >
            View all on GitHub
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </section>
      </ScrollReveal>
    </main>
  )
}
