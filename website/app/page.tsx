import Image from 'next/image'
import Link from 'next/link'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import {
  ArrowRight,
  Box,
  Braces,
  Clock3,
  Copy,
  ExternalLink,
  GitBranch,
  PlugZap,
  Terminal,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  SiBun,
  SiCloudflare,
  SiDeno,
  SiElectron,
  SiNodedotjs,
} from 'react-icons/si'

const runtimes = [
  {
    name: 'Node.js',
    note: 'LTS support',
    icon: <SiNodedotjs />,
    color: 'text-[#339933]',
  },
  {
    name: 'Bun',
    note: 'Fast & modern',
    icon: <SiBun />,
    color: 'text-[#14151a]',
  },
  {
    name: 'Deno',
    note: 'Secure by default',
    icon: <SiDeno />,
    color: 'text-black',
  },
  {
    name: 'Cloudflare Workers',
    note: 'Edge runtime',
    icon: <SiCloudflare />,
    color: 'text-[#f6821f]',
  },
  {
    name: 'AWS Lambda',
    note: 'Serverless',
    icon: <PlugZap />,
    color: 'text-[#ff9900]',
  },
  {
    name: 'Electron',
    note: 'Desktop apps',
    icon: <SiElectron />,
    color: 'text-[#47848f]',
  },
] as const

const applicationModel = [
  {
    title: 'Contract',
    body: 'Protocolの仕様と型を定義。',
    icon: <Braces size={25} strokeWidth={1.7} />,
  },
  {
    title: 'Implementation',
    body: 'Contractに対する実装を分離。',
    icon: <Wrench size={25} strokeWidth={1.7} />,
  },
  {
    title: 'Module & DI',
    body: '依存性をModuleで構成。',
    icon: <Box size={25} strokeWidth={1.7} />,
  },
  {
    title: 'Task',
    body: '明示的な処理を型安全に定義。',
    icon: <Clock3 size={25} strokeWidth={1.7} />,
  },
  {
    title: 'Application Graph',
    body: 'すべてを検証・可視化。',
    icon: <GitBranch size={25} strokeWidth={1.7} />,
  },
] as const

const codeExample = `import {
  contract,
  defineApplication,
  defineModule,
  implementation,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const AppContract = contract([
  http({
    hello: {
      method: 'GET',
      path: '/',
      responses: {
        ok: {
          status: 200,
          body: z.object({ message: z.string() }),
        },
      },
      pipeline: [http.controller],
    },
  }),
])

const AppController = implementation({
  name: 'AppController',
  contract: AppContract,
  protocol: http,
  factory: () => ({
    async hello(ctx) {
      return ctx.response.ok({
        body: { message: 'Hello from Loutre!' },
      })
    },
  }),
})

const AppModule = defineModule(() => ({
  implementations: [AppController],
}))

export default defineApplication({
  modules: [AppModule()],
})`

hljs.registerLanguage('typescript', typescript)

const highlightedCodeLines = hljs
  .highlight(codeExample, { language: 'typescript' })
  .value.split('\n')

function NumberedSection({
  number,
  children,
  muted = false,
  className = '',
}: {
  number: number
  children: ReactNode
  muted?: boolean
  className?: string
}) {
  return (
    <section
      className={`border-b border-gray-200 ${muted ? 'bg-gray-50/70' : 'bg-white'}`}
    >
      <div
        className={`shell relative pl-16 before:absolute before:top-0 before:bottom-0 before:left-3.5 before:border-l before:border-gray-200 max-sm:pl-0 max-sm:before:hidden ${className}`}
      >
        <span className="absolute top-8 left-0 z-2 grid size-7 place-items-center rounded-full bg-black text-xs font-bold text-white max-sm:hidden">
          {number}
        </span>
        {children}
      </div>
    </section>
  )
}

function InstallCommand({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex min-h-12 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 font-mono text-xs text-gray-800 ${className}`}
    >
      <span className="text-emerald-700">$</span>
      <code>npm create loutre@latest my-app</code>
      <Copy className="ml-auto text-gray-400" size={14} aria-hidden="true" />
    </div>
  )
}

export default function Home() {
  return (
    <main>
      <NumberedSection number={1} className="py-16 lg:py-20">
        <div className="grid grid-cols-[1.05fr_0.95fr] items-center gap-14 max-lg:grid-cols-1">
          <div>
            <h1 className="max-w-2xl text-[clamp(2.7rem,5.6vw,4.3rem)] leading-[1.05] font-bold tracking-[-0.06em] text-balance">
              TypeScript applications, without runtime lock-in.
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-gray-600">
              Application、Contract、DI、TaskをひとつのGraphとして構築。
              <br className="max-sm:hidden" />
              Node.js、Bun、Deno、Workers、Lambda、Electronへ。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white transition hover:bg-gray-800"
                href="/docs/getting-started/"
              >
                Get Started <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 text-sm font-semibold transition hover:bg-gray-50"
                href="https://github.com/come25136/loutrejs"
              >
                GitHub <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
            <InstallCommand className="mt-8 max-w-xl" />
            <div className="mt-7 flex items-center gap-5">
              <span className="text-xs text-gray-500">Works with</span>
              <div className="flex items-center gap-5 text-2xl">
                {runtimes.map((runtime) => (
                  <span
                    className={runtime.color}
                    title={runtime.name}
                    key={runtime.name}
                  >
                    {runtime.icon}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="shadow-code overflow-hidden rounded-xl border border-gray-800 bg-[#0d1117] text-[#e6edf3]">
            <div className="flex h-11 items-center gap-2 border-b border-white/8 px-4">
              <span className="size-2.5 rounded-full bg-[#ff5f56]" />
              <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="size-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-[11px] text-gray-500">
                app.ts
              </span>
            </div>
            <pre className="max-h-[38rem] overflow-auto px-2 py-6 font-mono text-[12px] leading-[1.65] [&_.hljs-attr]:text-[#79c0ff] [&_.hljs-comment]:text-[#8b949e] [&_.hljs-keyword]:text-[#ff7b72] [&_.hljs-literal]:text-[#79c0ff] [&_.hljs-number]:text-[#79c0ff] [&_.hljs-params]:text-[#e6edf3] [&_.hljs-property]:text-[#79c0ff] [&_.hljs-string]:text-[#a5d6ff] [&_.hljs-title]:text-[#d2a8ff] [&_.hljs-type]:text-[#ffa657] [&_.hljs-variable]:text-[#ffa657]">
              {highlightedCodeLines.map((line, index) => (
                <span className="grid grid-cols-[2.2rem_1fr]" key={index}>
                  <span className="pr-3 text-right text-gray-600 select-none">
                    {index + 1}
                  </span>
                  <code
                    dangerouslySetInnerHTML={{
                      __html: line || ' ',
                    }}
                  />
                </span>
              ))}
            </pre>
          </div>
        </div>
      </NumberedSection>

      <NumberedSection number={2} muted className="py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          Runs wherever your application runs
        </h2>
        <div className="mt-7 grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
          {runtimes.map((runtime) => (
            <article
              className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-4 text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              key={runtime.name}
            >
              <span className={`text-4xl ${runtime.color}`}>
                {runtime.icon}
              </span>
              <h3 className="mt-4 text-sm font-semibold">{runtime.name}</h3>
              <p className="mt-1 text-[11px] text-gray-500">{runtime.note}</p>
            </article>
          ))}
        </div>
      </NumberedSection>

      <NumberedSection number={3} className="py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          One application model
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Application、Contract、DI、TaskをGraphとして統一します。
        </p>
        <div className="mt-7 grid grid-cols-5 divide-x divide-gray-200 overflow-hidden rounded-xl border border-gray-200 max-lg:grid-cols-2 max-lg:divide-x-0 max-sm:grid-cols-1">
          {applicationModel.map((item) => (
            <article
              className="flex min-h-40 flex-col items-center justify-center p-5 text-center max-lg:border-b max-lg:border-gray-200"
              key={item.title}
            >
              <span className="mb-4 text-gray-900">{item.icon}</span>
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 max-w-36 text-[11px] leading-5 text-gray-500">
                {item.body}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg bg-gray-50 px-5 py-3 text-center font-mono text-xs whitespace-nowrap text-gray-700">
          Contract + Implementation + Module +
          Task　→　defineApplication()　→　Application Graph
        </div>
      </NumberedSection>

      <NumberedSection number={4} muted className="py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          Protocol と Runtime は分離
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          Applicationは変えずに、Runtimeだけを切り替えられます。
        </p>
        <div className="mx-auto mt-7 grid max-w-4xl grid-cols-[1fr_0.85fr] items-center gap-12 max-md:grid-cols-1">
          <div className="rounded-xl border border-gray-200 bg-white p-5 font-mono text-[11px] leading-6 text-gray-700">
            <p className="mb-4 text-[10px] text-gray-500">
              Loutre Application（共通）
            </p>
            <p>
              <span className="text-copper-dark">const</span> application ={' '}
              <span className="text-[#7c3aed]">defineApplication</span>(&#123;
            </p>
            <p>　modules: [UsersModule(), HealthModule()],</p>
            <p>&#125;)</p>
            <p className="mt-2 text-emerald-700">// Runtime固有APIは含まない</p>
            <p className="mt-3">
              <span className="text-copper-dark">export default</span>{' '}
              application
            </p>
          </div>
          <div>
            <p className="mb-2 text-center text-[10px] font-semibold text-gray-500">
              Runtimes
            </p>
            <div className="space-y-1.5">
              {runtimes.map((runtime) => (
                <div
                  className="relative flex min-h-8 items-center gap-3 rounded-md border border-gray-200 bg-white px-3 text-[11px] before:absolute before:top-1/2 before:right-full before:w-12 before:border-t before:border-dashed before:border-gray-300 max-md:before:hidden"
                  key={runtime.name}
                >
                  <span className={`text-base ${runtime.color}`}>
                    {runtime.icon}
                  </span>
                  {runtime.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </NumberedSection>

      <NumberedSection number={5} className="py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          Application Graph
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          loutre graph のviewを指定して依存関係と構成を可視化。
        </p>
        <div className="mx-auto mt-7 grid max-w-4xl grid-cols-2 overflow-hidden rounded-xl border border-gray-200 max-md:grid-cols-1">
          <div className="border-r border-gray-200 bg-[#fbfcfd] p-5 font-mono text-[11px] leading-7 max-md:border-r-0 max-md:border-b">
            <p className="mb-3 flex items-center gap-2 text-gray-700">
              <Terminal size={14} /> loutre graph modules --entry src/app.ts
            </p>
            <p className="text-emerald-700">AppModule [module:1]</p>
            <p>　description: HTTP Application entry module</p>
            <p>　imports: (none)</p>
          </div>
          <div className="relative min-h-56 bg-gray-50 p-5">
            <div className="absolute top-4 left-1/2 z-2 -translate-x-1/2 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 font-mono text-[10px] text-emerald-900">
              Application
            </div>
            <div className="absolute top-20 left-[18%] z-2 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-[9px]">
              UsersModule
            </div>
            <div className="absolute top-20 right-[18%] z-2 rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-[9px]">
              HealthModule
            </div>
            <div className="absolute bottom-12 left-[14%] z-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-mono text-[9px]">
              Contract (GET /users)
            </div>
            <div className="absolute right-[14%] bottom-12 z-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 font-mono text-[9px]">
              Contract (GET /health)
            </div>
            <svg
              className="absolute inset-0 size-full"
              viewBox="0 0 500 220"
              aria-hidden="true"
            >
              <path
                d="M250 43V63M250 63L135 88M250 63L365 88M135 115V158M365 115V158"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.2"
              />
            </svg>
          </div>
        </div>
      </NumberedSection>

      <NumberedSection number={6} muted className="overflow-hidden py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          Get started in seconds
        </h2>
        <div className="relative mx-auto mt-6 max-w-2xl">
          <InstallCommand />
          <div className="mt-5 flex justify-center gap-7 text-xs text-gray-600 max-sm:gap-4">
            <Link className="hover:text-black" href="/docs/getting-started/">
              Installation →
            </Link>
            <span className="text-gray-300">|</span>
            <Link className="hover:text-black" href="/docs/getting-started/">
              First App →
            </Link>
            <span className="text-gray-300">|</span>
            <Link className="hover:text-black" href="/examples/">
              Examples →
            </Link>
          </div>
          <Image
            className="absolute -right-16 -bottom-16 h-auto w-36 drop-shadow-sm max-sm:hidden"
            src="/loutre.png"
            width={512}
            height={493}
            alt=""
          />
        </div>
      </NumberedSection>
    </main>
  )
}
