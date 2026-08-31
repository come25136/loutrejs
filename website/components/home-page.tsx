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
  Terminal,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { localePrefix, type Locale } from '../lib/i18n'
import { ScrollReveal } from './scroll-reveal'
import { MermaidDiagram } from './mermaid-diagram'

function RuntimeLogo({
  src,
  width,
  height,
}: {
  src: string
  width: number
  height: number
}) {
  return (
    <Image
      className="h-[1em] w-[1.35em] object-contain"
      src={src}
      width={width}
      height={height}
      alt=""
      aria-hidden="true"
    />
  )
}

const runtimes = [
  {
    name: 'Node.js',
    icon: <RuntimeLogo src="/runtimes/nodejs.svg" width={44} height={50} />,
  },
  {
    name: 'Bun',
    icon: <RuntimeLogo src="/runtimes/bun.svg" width={80} height={70} />,
  },
  {
    name: 'Deno',
    icon: <RuntimeLogo src="/runtimes/deno.svg" width={441} height={441} />,
  },
  {
    name: 'Cloudflare Workers',
    icon: <RuntimeLogo src="/runtimes/cloudflare.svg" width={66} height={30} />,
  },
  {
    name: 'AWS Lambda',
    icon: <RuntimeLogo src="/runtimes/aws-lambda.png" width={64} height={64} />,
  },
  {
    name: 'Electron',
    icon: <RuntimeLogo src="/runtimes/electron.svg" width={128} height={128} />,
  },
] as const

const runtimeConnectionPaths = [
  'M 0 122.5 C 38 122.5 62 39 112 39',
  'M 0 122.5 C 38 122.5 62 77 112 77',
  'M 0 122.5 C 38 122.5 62 115 112 115',
  'M 0 122.5 C 38 122.5 62 153 112 153',
  'M 0 122.5 C 38 122.5 62 191 112 191',
  'M 0 122.5 C 38 122.5 62 229 112 229',
] as const

const mobileRuntimeConnectionPaths = [
  'M 300 0 C 300 30 50 34 50 96',
  'M 300 0 C 300 30 150 38 150 96',
  'M 300 0 C 300 30 250 46 250 96',
  'M 300 0 C 300 30 350 46 350 96',
  'M 300 0 C 300 30 450 38 450 96',
  'M 300 0 C 300 30 550 34 550 96',
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
  const section = (
    <section
      className={`border-b border-line ${muted ? 'bg-surface-muted/70 dark:bg-surface-muted/35' : 'bg-paper dark:bg-transparent'}`}
    >
      <div
        className={`shell relative pl-16 before:absolute before:top-0 before:bottom-0 before:left-3.5 before:border-l before:border-line max-sm:pl-0 max-sm:before:hidden ${className}`}
      >
        <span className="absolute top-8 left-0 z-2 grid size-7 place-items-center rounded-full bg-action text-xs font-bold text-action-foreground max-sm:hidden">
          {number}
        </span>
        {children}
      </div>
    </section>
  )

  return number === 1 ? section : <ScrollReveal>{section}</ScrollReveal>
}

function InstallCommand({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex min-h-12 items-center gap-3 rounded-lg border border-line bg-surface px-4 font-mono text-xs text-ink ${className}`}
    >
      <span className="text-emerald-700">$</span>
      <code>npm create loutre@latest my-app</code>
      <Copy className="ml-auto text-ink-muted" size={14} aria-hidden="true" />
    </div>
  )
}

const homeCopy = {
  en: {
    heroWords: ['TypeScript', 'applications', 'for any', 'runtime'],
    wordSeparator: ' ',
    introduction: 'Build Application, Contract, DI, and Task as one Graph',
    getStarted: 'Get started',
    runAnywhere: 'Run TypeScript anywhere',
    applicationModelTitle: 'One Application Model',
    applicationModelDescription:
      'Represent Application, Contract, DI, and Task in one Graph',
    applicationModelBodies: [
      'Define protocols and types',
      'Separate contracts from implementations',
      'Compose dependencies with modules',
      'Define jobs and CLIs with type safety',
      'Visualize every dependency',
    ],
    separationTitle: 'Separate Application from Runtime',
    separationDescription: 'Switch runtimes without changing application code',
    graphDescription:
      'Visualize dependencies and structure with the Loutre Graph API',
    startBuilding: 'Start building now',
  },
  ja: {
    heroWords: ['ランタイムに', '縛られない', 'TypeScript', 'アプリケーション'],
    wordSeparator: '',
    introduction: 'Application、Contract、DI、Taskを一つのGraphとして構築',
    getStarted: 'はじめる',
    runAnywhere: 'TypeScriptが動く場所なら、どこでも',
    applicationModelTitle: '一つのApplication Model',
    applicationModelDescription:
      'Application、Contract、DI、Taskを一つのGraphで表現します',
    applicationModelBodies: [
      'Protocolと型を定義',
      'Contractと実装を分離',
      'Moduleで依存性を構成',
      'JobやCLIも型安全に定義',
      '依存関係をすべて可視化',
    ],
    separationTitle: 'ApplicationとRuntimeを分離',
    separationDescription: 'コードは変えずに、Runtimeだけを切り替えられます',
    graphDescription: 'Loutre Graph APIで、依存関係と構成を可視化',
    startBuilding: '今すぐ始める',
  },
} as const

export function HomePage({ locale }: { locale: Locale }) {
  const copy = homeCopy[locale]
  const routePrefix = localePrefix(locale)
  const applicationModel = [
    {
      title: 'Contract',
      body: copy.applicationModelBodies[0],
      icon: <Braces size={25} strokeWidth={1.7} />,
    },
    {
      title: 'Implementation',
      body: copy.applicationModelBodies[1],
      icon: <Wrench size={25} strokeWidth={1.7} />,
    },
    {
      title: 'Module & DI',
      body: copy.applicationModelBodies[2],
      icon: <Box size={25} strokeWidth={1.7} />,
    },
    {
      title: 'Task',
      body: copy.applicationModelBodies[3],
      icon: <Clock3 size={25} strokeWidth={1.7} />,
    },
    {
      title: 'Application Graph',
      body: copy.applicationModelBodies[4],
      icon: <GitBranch size={25} strokeWidth={1.7} />,
    },
  ] as const

  return (
    <main>
      <NumberedSection number={1} className="py-16 lg:py-20">
        <div className="grid grid-cols-[1.05fr_0.95fr] items-center gap-14 max-lg:grid-cols-1">
          <div className="animate-reveal-up motion-reduce:animate-none">
            <h1 className="max-w-2xl text-[clamp(2.7rem,5.6vw,4.3rem)] leading-[1.05] font-bold tracking-[-0.06em] text-balance">
              <span className="animate-word-in inline-block motion-reduce:animate-none">
                {copy.heroWords[0]}
              </span>
              {copy.wordSeparator}
              <wbr />
              <span className="animate-word-in inline-block [animation-delay:70ms] motion-reduce:animate-none">
                {copy.heroWords[1]}
              </span>
              {copy.wordSeparator}
              <wbr />
              <span className="animate-word-in inline-block [animation-delay:140ms] motion-reduce:animate-none">
                {copy.heroWords[2]}
              </span>
              {copy.wordSeparator}
              <wbr />
              <span className="animate-word-in inline-block [animation-delay:210ms] motion-reduce:animate-none">
                {copy.heroWords[3]}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-7 text-ink-soft">
              {copy.introduction}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-5 text-sm font-semibold text-action-foreground transition hover:bg-action-hover"
                href={`${routePrefix}/docs/getting-started/`}
              >
                {copy.getStarted} <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <a
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-5 text-sm font-semibold transition hover:bg-surface-muted"
                href="https://github.com/come25136/loutrejs"
              >
                GitHub <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
            <InstallCommand className="mt-8 max-w-xl" />
          </div>

          <div className="animate-reveal-up shadow-code overflow-hidden rounded-xl border border-gray-800 bg-[#0d1117] text-[#e6edf3] [animation-delay:160ms] motion-reduce:animate-none">
            <div className="flex h-11 items-center gap-2 border-b border-white/8 px-4">
              <span className="size-2.5 rounded-full bg-[#ff5f56]" />
              <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="size-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-[11px] text-ink-soft">
                app.ts
              </span>
            </div>
            <pre className="max-h-[38rem] overflow-auto px-2 py-6 font-mono text-[12px] leading-[1.65] [&_.hljs-attr]:text-[#79c0ff] [&_.hljs-comment]:text-[#8b949e] [&_.hljs-keyword]:text-[#ff7b72] [&_.hljs-literal]:text-[#79c0ff] [&_.hljs-number]:text-[#79c0ff] [&_.hljs-params]:text-[#e6edf3] [&_.hljs-property]:text-[#79c0ff] [&_.hljs-string]:text-[#a5d6ff] [&_.hljs-title]:text-[#d2a8ff] [&_.hljs-type]:text-[#ffa657] [&_.hljs-variable]:text-[#ffa657]">
              {highlightedCodeLines.map((line, index) => (
                <span className="grid grid-cols-[2.2rem_1fr]" key={index}>
                  <span className="pr-3 text-right text-ink-soft select-none">
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
          {copy.runAnywhere}
        </h2>
        <div className="mt-7 grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-sm:grid-cols-2">
          {runtimes.map((runtime) => (
            <article
              className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-line bg-surface p-4 text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              key={runtime.name}
            >
              <span className="text-4xl">{runtime.icon}</span>
              <h3 className="mt-4 text-sm font-semibold">{runtime.name}</h3>
            </article>
          ))}
        </div>
      </NumberedSection>

      <NumberedSection number={3} className="py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          {copy.applicationModelTitle}
        </h2>
        <p className="mt-2 text-center text-sm text-ink-soft">
          {copy.applicationModelDescription}
        </p>
        <div className="mt-7 grid grid-cols-5 divide-x divide-line overflow-hidden rounded-xl border border-line max-lg:grid-cols-2 max-lg:divide-x-0 max-sm:grid-cols-1">
          {applicationModel.map((item) => (
            <article
              className="flex min-h-40 flex-col items-center justify-center p-5 text-center max-lg:border-b max-lg:border-line"
              key={item.title}
            >
              <span className="mb-4 text-ink">{item.icon}</span>
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-0.5 max-w-36 text-[11px] leading-5 text-ink-soft">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </NumberedSection>

      <NumberedSection number={4} muted className="py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          {copy.separationTitle}
        </h2>
        <p className="mt-2 text-center text-sm text-ink-soft">
          {copy.separationDescription}
        </p>
        <div className="isolate mx-auto mt-7 grid max-w-4xl grid-cols-[1fr_7rem_0.85fr] items-center max-md:grid-cols-1">
          <div className="relative z-10 rounded-xl border border-line bg-surface p-5 font-mono text-[11px] leading-6 text-ink after:absolute after:top-1/2 after:-right-1 after:size-2 after:-translate-y-1/2 after:rounded-full after:bg-copper max-md:after:hidden">
            <span
              className="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-copper md:hidden"
              aria-hidden="true"
            />
            <p>
              <span className="text-copper-dark">const</span> application ={' '}
              <span className="text-[#7c3aed]">defineApplication</span>(&#123;
            </p>
            <p>　modules: [UsersModule(), HealthModule()],</p>
            <p>&#125;)</p>
            <p className="mt-3">
              <span className="text-copper-dark">export default</span>{' '}
              application
            </p>
          </div>
          <div
            className="relative z-0 hidden self-stretch md:block"
            aria-hidden="true"
          >
            <svg
              className="absolute inset-0 size-full overflow-visible text-line-strong"
              viewBox="0 0 112 245"
              preserveAspectRatio="none"
            >
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="4 5"
                vectorEffect="non-scaling-stroke"
              >
                {runtimeConnectionPaths.map((path, index) => (
                  <path
                    id={`runtime-connection-${index}`}
                    d={path}
                    key={path}
                  />
                ))}
              </g>
              <g className="motion-reduce:hidden">
                {runtimeConnectionPaths.map((path, index) => (
                  <circle r="2.6" fill="#ff6a30" key={path}>
                    <animateMotion
                      dur={`${2.6 + index * 0.08}s`}
                      begin={`${index * 0.18}s`}
                      repeatCount="indefinite"
                    >
                      <mpath href={`#runtime-connection-${index}`} />
                    </animateMotion>
                    <animate
                      attributeName="opacity"
                      values="0;1;1;0"
                      keyTimes="0;0.12;0.82;1"
                      dur={`${2.6 + index * 0.08}s`}
                      begin={`${index * 0.18}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                ))}
              </g>
            </svg>
          </div>
          <div className="relative z-10 max-md:hidden">
            <p className="mb-2 text-center text-[10px] font-semibold text-ink-soft">
              Runtimes
            </p>
            <div className="space-y-1.5">
              {runtimes.map((runtime) => (
                <div
                  className="relative flex min-h-8 items-center gap-3 rounded-md border border-line bg-surface px-3 text-[11px]"
                  key={runtime.name}
                >
                  <span className="text-base">{runtime.icon}</span>
                  {runtime.name}
                </div>
              ))}
            </div>
          </div>

          <div
            className="relative col-span-full md:hidden"
            aria-label="Runtimes"
          >
            <div className="relative h-24" aria-hidden="true">
              <svg
                className="pointer-events-none absolute inset-0 size-full overflow-visible text-line-strong"
                viewBox="0 0 600 96"
                preserveAspectRatio="none"
              >
                <g
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeDasharray="4 5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                >
                  {mobileRuntimeConnectionPaths.map((path, index) => (
                    <path
                      id={`runtime-connection-mobile-${index}`}
                      d={path}
                      key={path}
                    />
                  ))}
                </g>
                <g className="motion-reduce:hidden">
                  {mobileRuntimeConnectionPaths.map((path, index) => (
                    <circle r="2.6" fill="#ff6a30" key={path}>
                      <animateMotion
                        dur={`${2.4 + index * 0.08}s`}
                        begin={`${index * 0.14}s`}
                        repeatCount="indefinite"
                      >
                        <mpath href={`#runtime-connection-mobile-${index}`} />
                      </animateMotion>
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0"
                        keyTimes="0;0.12;0.82;1"
                        dur={`${2.4 + index * 0.08}s`}
                        begin={`${index * 0.14}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  ))}
                </g>
              </svg>
            </div>

            <div className="grid grid-cols-6">
              {runtimes.map((runtime) => (
                <div
                  className="flex min-w-0 flex-col items-center gap-2 text-center"
                  key={runtime.name}
                >
                  <span className="grid size-9 place-items-center text-2xl">
                    {runtime.icon}
                  </span>
                  <span className="max-w-full text-[8px] leading-[1.15] font-medium text-ink sm:text-[9px]">
                    {runtime.name}
                  </span>
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
        <p className="mt-2 text-center text-sm text-ink-soft">
          {copy.graphDescription}
        </p>
        <div className="mx-auto mt-7 grid max-w-4xl grid-cols-2 overflow-hidden rounded-xl border border-line max-md:grid-cols-1">
          <div className="border-r border-line bg-surface p-5 font-mono text-[11px] leading-7 max-md:border-r-0 max-md:border-b">
            <p className="mb-3 flex items-center gap-2 text-ink">
              <Terminal size={14} /> loutre graph modules --entry src/app.ts
            </p>
            <p className="text-emerald-700">AppModule [module:1]</p>
            <p>　description: HTTP Application entry module</p>
            <p>　imports: (none)</p>
          </div>
          <div className="relative flex min-h-56 items-center overflow-hidden bg-surface-muted p-5">
            <MermaidDiagram
              locale={locale}
              variant="embedded"
              chart={`%%{init: {
  "theme": "base",
  "flowchart": {
    "curve": "basis",
    "diagramPadding": 8,
    "nodeSpacing": 52,
    "rankSpacing": 40,
    "useMaxWidth": true
  },
  "themeVariables": {
    "background": "#F9FAFB",
    "fontFamily": "monospace",
    "fontSize": "10px",
    "lineColor": "#CBD5E1",
    "primaryTextColor": "#172033"
  }
}}%%

flowchart TD
    A["Application"]

    U["UsersModule"]
    H["HealthModule"]

    UC["Contract (GET /users)"]
    HC["Contract (GET /health)"]

    A --- U
    A --- H

    U --- UC
    H --- HC

    classDef application fill:#ECFDF5,stroke:#6EE7B7,stroke-width:1px,color:#164E3B;
    classDef module fill:#FFFFFF,stroke:#CBD5E1,stroke-width:1px,color:#172033;
    classDef contract fill:#F8FAFF,stroke:#AFCBFF,stroke-width:1px,color:#172033;

    class A application;
    class U,H module;
    class UC,HC contract;

    linkStyle default stroke:#CBD5E1,stroke-width:1.5px;`}
              darkChart={`%%{init: {
  "theme": "base",
  "flowchart": {
    "curve": "basis",
    "diagramPadding": 8,
    "nodeSpacing": 52,
    "rankSpacing": 40,
    "useMaxWidth": true
  },
  "themeVariables": {
    "background": "#0F1419",
    "fontFamily": "monospace",
    "fontSize": "10px",
    "lineColor": "#475569",
    "primaryTextColor": "#E5E7EB"
  }
}}%%

flowchart TD
    A["Application"]

    U["UsersModule"]
    H["HealthModule"]

    UC["Contract (GET /users)"]
    HC["Contract (GET /health)"]

    A --- U
    A --- H

    U --- UC
    H --- HC

    classDef application fill:#10251C,stroke:#2F7D57,stroke-width:1px,color:#D1FAE5;
    classDef module fill:#11161C,stroke:#475569,stroke-width:1px,color:#E5E7EB;
    classDef contract fill:#121A26,stroke:#46658A,stroke-width:1px,color:#DBEAFE;

    class A application;
    class U,H module;
    class UC,HC contract;

    linkStyle default stroke:#475569,stroke-width:1.5px;`}
            />
          </div>
        </div>
      </NumberedSection>

      <NumberedSection number={6} muted className="overflow-hidden py-10">
        <h2 className="text-center text-2xl font-semibold tracking-[-0.035em]">
          {copy.startBuilding}
        </h2>
        <div className="relative mx-auto mt-6 max-w-2xl">
          <InstallCommand />
          <Image
            className="absolute -right-16 -bottom-16 h-auto w-36 drop-shadow-sm max-sm:hidden"
            src="/loutre.svg"
            width={1254}
            height={1254}
            alt=""
          />
        </div>
      </NumberedSection>
    </main>
  )
}
