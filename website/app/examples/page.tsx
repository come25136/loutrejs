import type { Metadata } from 'next'

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
  'inline-flex min-h-13 items-center justify-center gap-3.5 rounded-full border border-transparent bg-ink px-6 text-sm font-bold text-cream transition hover:-translate-y-0.5 hover:bg-copper-dark max-sm:w-full'

export default function ExamplesPage() {
  return (
    <main className="pb-30">
      <section className="shell py-24 pb-20">
        <p className="mb-6 flex items-center gap-3 text-xs font-extrabold tracking-[0.17em] text-copper-dark uppercase">
          <span className="h-0.5 w-6 bg-current" aria-hidden="true" /> Learn by
          running
        </p>
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-20 max-sm:grid-cols-1 max-sm:gap-8">
          <h1 className="m-0 font-serif text-[clamp(3.1rem,6vw,6rem)] leading-[0.98] font-medium tracking-[-0.065em]">
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
        className="shell grid grid-cols-2 gap-px overflow-hidden rounded-[22px] border border-ink/15 bg-ink/15 max-sm:grid-cols-1"
        aria-label="Loutreのサンプル一覧"
      >
        {examples.map((example, index) => (
          <a
            className="flex min-h-75 flex-col bg-cream p-8 transition hover:bg-paper-deep max-sm:min-h-68"
            href={`https://github.com/come25136/loutrejs/tree/main/examples/${example.slug}`}
            key={example.slug}
          >
            <div className="flex justify-between font-mono text-xs text-copper-dark uppercase">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span>{example.kind}</span>
            </div>
            <h2 className="mt-14 mb-3.5 font-serif text-3xl font-semibold tracking-[-0.04em]">
              {example.name}
            </h2>
            <p className="m-0 max-w-lg text-sm leading-7 text-ink-soft">
              {example.description}
            </p>
            <span className="mt-auto pt-6 text-xs font-bold">
              コードを見る ↗
            </span>
          </a>
        ))}
      </section>

      <section className="shell mt-10 flex items-center justify-between gap-8 max-sm:flex-col max-sm:items-stretch">
        <p className="m-0 text-sm text-ink-soft">
          すべてのサンプルはCIで継続的に実行されています。
        </p>
        <a
          className={buttonClass}
          href="https://github.com/come25136/loutrejs/tree/main/examples"
        >
          GitHubですべて見る <span aria-hidden="true">↗</span>
        </a>
      </section>
    </main>
  )
}
