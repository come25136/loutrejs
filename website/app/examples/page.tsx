import type { Metadata } from 'next'
import { ArrowUpRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Examples',
  description:
    'HTTP、認証、Task、Worker、Databaseを扱うLoutreの実行可能なサンプル集。',
}

const examples = [
  {
    name: 'Hello HTTP',
    slug: 'hello-http',
    kind: 'HTTP',
    description:
      'path parameterの検証、型付きController、Providerの依存注入を含む最小のHTTP API。',
  },
  {
    name: 'Hello CLI',
    slug: 'hello-cli',
    kind: 'Task',
    description:
      'CLI引数をApplication Argumentsへbindし、public Taskを明示的に実行する構成。',
  },
  {
    name: 'Hello Worker',
    slug: 'hello-worker',
    kind: 'Trigger',
    description:
      'HTTPを持たず、fixedDelay Triggerだけで常駐するApplicationの最小例。',
  },
  {
    name: 'Basic Auth',
    slug: 'basic-auth',
    kind: 'Security',
    description:
      '認証Layer、Context Key、short circuitでHTTP Basic認証を構成します。',
  },
  {
    name: 'Bearer Auth',
    slug: 'bearer-auth',
    kind: 'Security',
    description:
      '公開APIだけを使ってユーザー定義のBearer認証Layerを組み立てます。',
  },
  {
    name: 'CORS',
    slug: 'cors',
    kind: 'HTTP',
    description:
      'PipelineへCORS policyを組み込み、preflightをApplication境界で処理します。',
  },
  {
    name: 'Database Transactions',
    slug: 'database-transactions',
    kind: 'Database',
    description:
      '外部DBなしでtyped Contextと再帰Pipelineによるtransaction境界を確認できます。',
  },
  {
    name: 'PostgreSQL',
    slug: 'database-postgres',
    kind: 'Database',
    description:
      'pgのPoolClientをtransaction LayerからControllerへ型安全に渡します。',
  },
  {
    name: 'Drizzle + PostgreSQL',
    slug: 'database-drizzle-postgres',
    kind: 'Database',
    description:
      'Drizzleのnative transaction clientを型を変えずにContextへ接続します。',
  },
  {
    name: 'Prisma + PostgreSQL',
    slug: 'database-prisma-postgres',
    kind: 'Database',
    description:
      'Prismaのinteractive transactionを再帰Pipelineから直接利用します。',
  },
] as const

const buttonClass =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-transparent bg-ink px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-gray-800 max-sm:w-full'

export default function ExamplesPage() {
  return (
    <main className="border-b border-gray-200 bg-white pb-30">
      <section className="shell border-b border-gray-200 py-20">
        <p className="mb-5 font-mono text-xs font-medium tracking-[0.08em] text-copper-dark uppercase">
          Learn by running
        </p>
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-20 max-sm:grid-cols-1 max-sm:gap-8">
          <h1 className="m-0 text-[clamp(3rem,6vw,5.25rem)] leading-[0.98] font-bold tracking-[-0.065em]">
            動くコードから、
            <br />
            Loutreを知る。
          </h1>
          <p className="m-0 max-w-lg self-end leading-8 text-ink-soft">
            小さなHTTP APIから認証、Worker、Database
            transactionまで。すべてrepositoryからそのまま実行できます。
          </p>
        </div>
      </section>

      <section
        className="shell mt-12 grid grid-cols-2 gap-4 max-sm:grid-cols-1"
        aria-label="Loutreのサンプル一覧"
      >
        {examples.map((example, index) => (
          <a
            className="group flex min-h-70 flex-col rounded-xl border border-gray-200 bg-white p-7 transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-[0_14px_36px_rgba(17,24,39,0.08)] max-sm:min-h-64"
            href={`https://github.com/come25136/loutrejs/tree/main/examples/${example.slug}`}
            key={example.slug}
          >
            <div className="flex items-center justify-between font-mono text-xs uppercase">
              <span className="text-gray-400">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-copper-dark">
                {example.kind}
              </span>
            </div>
            <h2 className="mt-12 mb-3.5 text-2xl font-bold tracking-[-0.04em]">
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

      <section className="shell mt-10 flex items-center justify-between gap-8 rounded-xl border border-gray-200 bg-gray-50 px-6 py-5 max-sm:flex-col max-sm:items-stretch">
        <p className="m-0 text-sm text-ink-soft">
          すべてのサンプルはCIで継続的に実行されています。
        </p>
        <a
          className={buttonClass}
          href="https://github.com/come25136/loutrejs/tree/main/examples"
        >
          GitHubですべて見る
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </section>
    </main>
  )
}
