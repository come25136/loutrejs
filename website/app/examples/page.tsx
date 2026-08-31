import type { Metadata } from 'next'
import { ArrowUpRight } from 'lucide-react'
import { ScrollReveal } from '../../components/scroll-reveal'

export const metadata: Metadata = {
  title: 'Example',
  description:
    'HTTP、Auth、Task、Worker、Databaseを扱うLoutreの実行可能なサンプル集',
}

const examples = [
  {
    name: 'Hello CLI',
    slug: 'hello-cli',
    description: '引数を受け取り、Taskを実行するCLI application',
  },
  {
    name: 'Hello Worker',
    slug: 'hello-worker',
    description: 'fixedDelayでTaskを繰り返し実行するWorker',
  },
  {
    name: 'Hello HTTP',
    slug: 'hello-http',
    description: 'ControllerとProviderを使った最小構成のHTTP API',
  },
  {
    name: 'Basic Auth',
    slug: 'basic-auth',
    description: 'HTTP Basic認証でAPIを保護する',
  },
  {
    name: 'Bearer Auth',
    slug: 'bearer-auth',
    description: 'Bearer tokenを検証してAPIを保護する',
  },
  {
    name: 'CORS',
    slug: 'cors',
    description: 'PipelineでCORSとpreflight requestを処理する',
  },
  {
    name: 'Database Transactions',
    slug: 'database-transactions',
    description: 'Transactionの基本的な使い方',
  },
  {
    name: 'PostgreSQL',
    slug: 'database-postgres',
    description: 'pgを使ったPostgreSQL transaction',
  },
  {
    name: 'Drizzle + PostgreSQL',
    slug: 'database-drizzle-postgres',
    description: 'DrizzleとPostgreSQLを使ったtransaction',
  },
  {
    name: 'Prisma + PostgreSQL',
    slug: 'database-prisma-postgres',
    description: 'Prisma interactive transactionをPipelineから使う',
  },
] as const

const buttonClass =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-transparent bg-ink px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-gray-800 max-sm:w-full'

export default function ExamplesPage() {
  return (
    <main className="border-b border-gray-200 bg-white pb-30">
      <section className="shell animate-reveal-up border-b border-gray-200 py-20 motion-reduce:animate-none">
        <p className="mb-5 font-mono text-xs font-medium tracking-[0.08em] text-copper-dark uppercase">
          Examples
        </p>
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-20 max-sm:grid-cols-1 max-sm:gap-8">
          <h1 className="m-0 text-[clamp(3rem,6vw,5.25rem)] leading-[0.98] font-bold tracking-[-0.065em]">
            <span className="block whitespace-nowrap">動くコードから</span>
            <span className="block whitespace-nowrap">Loutreを学ぶ</span>
          </h1>
          <p className="m-0 max-w-lg self-end leading-8 text-ink-soft">
            <span className="block whitespace-nowrap">
              HTTP、CLI、Worker、Auth、Database
            </span>
            <span className="block whitespace-nowrap">
              用途別のサンプルから使い方を確認できます
            </span>
          </p>
        </div>
      </section>

      <ScrollReveal>
        <section
          className="shell mt-12 grid grid-cols-2 gap-4 max-sm:grid-cols-1"
          aria-label="Loutreのサンプル一覧"
        >
          {examples.map((example) => (
            <a
              className="group flex min-h-60 flex-col rounded-xl border border-gray-200 bg-white p-7 transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-[0_14px_36px_rgba(17,24,39,0.08)] max-sm:min-h-64"
              href={`https://github.com/come25136/loutrejs/tree/main/examples/${example.slug}`}
              key={example.slug}
            >
              <h2 className="mb-3.5 text-2xl font-bold tracking-[-0.04em]">
                {example.name}
              </h2>
              <p className="m-0 max-w-lg text-sm leading-7 text-ink-soft">
                {example.description}
              </p>
              <span className="mt-auto flex items-center gap-1.5 pt-6 text-xs font-bold">
                コードを見る
                <ArrowUpRight
                  className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </span>
            </a>
          ))}
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="shell mt-10 flex items-center justify-end gap-8 rounded-xl border border-gray-200 bg-gray-50 px-6 py-5 max-sm:flex-col max-sm:items-stretch">
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
