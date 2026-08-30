import Image from 'next/image'
import Link from 'next/link'

const codeExample = `const app = defineApplication({
  modules: [GreetingModule()],
})

const runtime = bootstrap({
  application: app,
})

await runtime.run(rebuild)`

const features = [
  {
    number: '01',
    title: 'Application Graph',
    body: 'Module、Contract、Task、依存関係を一つのGraphとして検査。実行前に構造を理解できます。',
  },
  {
    number: '02',
    title: 'Typed by default',
    body: 'Contractから実装、HTTP Client、RuntimeまでTypeScriptの型が途切れません。',
  },
  {
    number: '03',
    title: 'Runtime portable',
    body: 'Application codeを環境固有APIから分離し、Node.js、Bun、Deno、Workersなどへ接続します。',
  },
]

const runtimes = [
  'Node.js',
  'Bun',
  'Deno',
  'Cloudflare Workers',
  'AWS Lambda',
  'Electron',
]

const eyebrowClass =
  'mb-6 flex items-center gap-3 text-xs font-extrabold tracking-[0.17em] text-copper-dark uppercase'
const buttonClass =
  'inline-flex min-h-13 items-center justify-center gap-3.5 rounded-full border border-transparent px-6 text-sm font-bold transition hover:-translate-y-0.5 max-sm:w-full'

export default function Home() {
  return (
    <main>
      <section className="overflow-hidden bg-[radial-gradient(circle_at_78%_42%,rgba(181,96,55,0.12),transparent_33%),linear-gradient(180deg,#f6f0e7_0%,#f9f5ee_100%)]">
        <div className="shell grid min-h-[700px] grid-cols-[minmax(0,1.03fr)_minmax(420px,0.97fr)] items-center gap-[clamp(3rem,7vw,6.25rem)] py-20 max-lg:grid-cols-1 max-lg:pt-16 max-sm:min-h-0 max-sm:gap-10 max-sm:py-14">
          <div className="max-lg:max-w-3xl">
            <p className={eyebrowClass}>
              <span className="h-0.5 w-6 bg-current" aria-hidden="true" />{' '}
              TypeScript Application Framework
            </p>
            <h1 className="m-0 text-[clamp(3.4rem,6.4vw,6.15rem)] leading-[0.98] font-bold tracking-[-0.075em] max-sm:text-[clamp(3rem,14vw,4.4rem)]">
              ランタイムを選べる。
              <br />
              <em className="font-serif font-medium text-copper">
                設計は、ぶれない。
              </em>
            </h1>
            <p className="mt-8 max-w-xl text-[clamp(1rem,1.4vw,1.18rem)] leading-8 text-ink-soft max-sm:text-base">
              Loutreは、Application
              Graphを中心にContract、DI、Task、Runtimeを一つの型安全なモデルへ統合します。
            </p>
            <div className="mt-9 flex flex-wrap gap-3 max-sm:flex-col">
              <Link
                className={`${buttonClass} bg-ink text-cream hover:bg-copper-dark`}
                href="/docs/getting-started/"
              >
                5分で始める <span aria-hidden="true">→</span>
              </Link>
              <a
                className={`${buttonClass} border-ink/15 bg-cream/60 hover:border-ink/35 hover:bg-cream`}
                href="https://github.com/come25136/loutrejs"
              >
                GitHubで見る <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="mt-5 flex items-center gap-2.5 font-mono text-xs text-[#75665c]">
              <span className="text-copper" aria-hidden="true">
                $
              </span>
              <code>npm create loutre@latest my-app</code>
            </p>
          </div>

          <div
            className="relative min-h-[520px] max-lg:mx-auto max-lg:min-h-[470px] max-lg:w-full max-lg:max-w-2xl max-sm:min-h-[405px]"
            aria-label="LoutreのApplicationモデル"
          >
            <div
              className="absolute -top-10 -right-30 size-[520px] rounded-full border border-copper/20"
              aria-hidden="true"
            />
            <div
              className="absolute right-20 -bottom-2 size-48 rounded-full border border-copper/20"
              aria-hidden="true"
            />
            <div className="shadow-code absolute top-8 right-1 z-2 w-full max-w-[480px] rotate-[1.3deg] overflow-hidden rounded-[22px] border border-white/10 bg-[#1c1714] text-[#f4e9da] max-lg:right-18 max-lg:left-0 max-lg:w-auto max-lg:max-w-none max-sm:top-2 max-sm:right-6">
              <div className="flex h-12 items-center gap-2 border-b border-white/10 px-4.5">
                <span className="size-2 rounded-full bg-copper" />
                <span className="size-2 rounded-full bg-[#796a60]" />
                <span className="size-2 rounded-full bg-[#796a60]" />
                <p className="ml-auto font-mono text-[0.68rem] text-[#9b8a7e]">
                  application.ts
                </p>
              </div>
              <pre className="m-0 whitespace-pre-wrap p-7 font-mono text-[clamp(0.72rem,1.15vw,0.88rem)] leading-[1.85] text-[#ead1b6] max-sm:p-5">
                <code>{codeExample}</code>
              </pre>
              <div className="flex items-center gap-2 border-t border-white/10 px-6 py-4 font-mono text-[0.68rem] text-[#b8ad9f]">
                <span
                  className="size-2 rounded-full bg-[#9caf7d] shadow-[0_0_0_5px_rgba(156,175,125,0.1)]"
                  aria-hidden="true"
                />
                Graph compiled · 6 runtimes ready
              </div>
            </div>
            <Image
              className="absolute -right-18 -bottom-11 z-4 h-auto w-[285px] -rotate-7 drop-shadow-[0_24px_28px_rgba(64,39,26,0.22)] max-lg:-right-8 max-sm:-right-14 max-sm:-bottom-5 max-sm:w-[220px]"
              src="/loutre.png"
              width={512}
              height={493}
              preload
              alt="Loutreのカワウソのマスコット"
            />
          </div>
        </div>
      </section>

      <section
        className="border-y border-ink/15 bg-paper-deep"
        aria-label="対応ランタイム"
      >
        <div className="shell flex min-h-24 items-center gap-[clamp(2rem,6vw,5rem)] max-lg:flex-col max-lg:items-start max-lg:gap-4 max-lg:py-6">
          <p className="shrink-0 font-serif text-sm italic text-copper-dark">
            Run anywhere
          </p>
          <div className="flex w-full items-center justify-between gap-5 text-xs font-bold text-[#53473f] max-lg:flex-wrap max-lg:justify-start">
            {runtimes.map((runtime) => (
              <span key={runtime}>{runtime}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-36 max-sm:py-24">
        <div className="grid grid-cols-[1.15fr_0.85fr] gap-x-20 max-sm:grid-cols-1 max-sm:gap-8">
          <p className={`${eyebrowClass} col-span-full`}>
            <span className="h-0.5 w-6 bg-current" aria-hidden="true" /> One
            application, explicit architecture
          </p>
          <h2 className="m-0 font-serif text-[clamp(2.7rem,5vw,5rem)] leading-[1.04] font-medium tracking-[-0.055em]">
            コードから追える。
            <br />
            型でつながる。
          </h2>
          <p className="m-0 max-w-lg self-end leading-8 text-ink-soft">
            decoratorやfilesystem
            discoveryに頼らず、Applicationの構造と実行境界を明示します。
          </p>
        </div>
        <div className="mt-20 grid grid-cols-3 gap-px overflow-hidden rounded-[22px] border border-ink/15 bg-ink/15 max-sm:mt-14 max-sm:grid-cols-1">
          {features.map((feature, index) => (
            <article
              className={`min-h-72 p-8 max-sm:min-h-0 ${index === 1 ? 'bg-[#f0e7da]' : 'bg-cream'}`}
              key={feature.number}
            >
              <p className="mb-16 font-mono text-xs text-copper max-sm:mb-10">
                {feature.number}
              </p>
              <h3 className="mb-4 text-xl font-bold tracking-[-0.025em]">
                {feature.title}
              </h3>
              <p className="m-0 text-sm leading-7 text-ink-soft">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="overflow-hidden bg-ink text-cream">
        <div className="shell grid min-h-[710px] grid-cols-[0.9fr_1.1fr] items-center gap-20 py-28 max-lg:gap-8 max-sm:grid-cols-1 max-sm:py-24">
          <div>
            <p className={`${eyebrowClass} text-[#d7916d]`}>
              <span className="h-0.5 w-6 bg-current" aria-hidden="true" />{' '}
              Graph-first
            </p>
            <h2 className="m-0 font-serif text-[clamp(2.7rem,5vw,5rem)] leading-[1.04] font-medium tracking-[-0.055em]">
              実行する前に、
              <br />
              構造が見える。
            </h2>
            <p className="mt-8 max-w-lg leading-8 text-[#c8bdb3]">
              Application
              GraphはRuntimeとToolingが共有する設計図です。依存関係、公開境界、実行能力を検査し、CLIから可視化できます。
            </p>
            <Link
              className="mt-8 inline-flex items-center gap-5 border-b border-white/20 pb-2 text-sm font-bold"
              href="/docs/architecture/"
            >
              Architectureを読む <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div
            className="relative ml-auto aspect-square w-full max-w-[550px] max-sm:mx-auto max-sm:mt-5"
            aria-label="Application Graphの概念図"
          >
            <div className="absolute top-1/2 left-1/2 z-2 grid min-h-16 min-w-36 -translate-1/2 place-items-center rounded-full border border-[#d7916d]/50 bg-copper-dark font-mono text-xs text-white">
              Application
            </div>
            <div className="absolute top-[10%] left-1/2 z-2 grid min-h-11 min-w-27 -translate-x-1/2 place-items-center rounded-full border border-white/15 bg-[#27201c] font-mono text-xs text-[#d9cdc2]">
              Contract
            </div>
            <div className="absolute top-1/2 right-[7%] z-2 grid min-h-11 min-w-27 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#27201c] font-mono text-xs text-[#d9cdc2]">
              Runtime
            </div>
            <div className="absolute bottom-[10%] left-1/2 z-2 grid min-h-11 min-w-27 -translate-x-1/2 place-items-center rounded-full border border-white/15 bg-[#27201c] font-mono text-xs text-[#d9cdc2]">
              Tooling
            </div>
            <div className="absolute top-1/2 left-[7%] z-2 grid min-h-11 min-w-27 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#27201c] font-mono text-xs text-[#d9cdc2]">
              Module
            </div>
            <svg
              className="size-full overflow-visible"
              viewBox="0 0 500 500"
              aria-hidden="true"
            >
              <path
                className="fill-none stroke-paper-deep/25 stroke-[1px]"
                d="M250 205V108"
              />
              <path
                className="fill-none stroke-paper-deep/25 stroke-[1px]"
                d="M295 250H392"
              />
              <path
                className="fill-none stroke-paper-deep/25 stroke-[1px]"
                d="M250 295V392"
              />
              <path
                className="fill-none stroke-paper-deep/25 stroke-[1px]"
                d="M205 250H108"
              />
              <circle
                className="fill-none stroke-paper-deep/25 stroke-[1px] [stroke-dasharray:3_7]"
                cx="250"
                cy="250"
                r="145"
              />
            </svg>
          </div>
        </div>
      </section>

      <section className="shell grid grid-cols-[1.05fr_0.95fr] gap-24 py-36 max-sm:grid-cols-1 max-sm:gap-8 max-sm:py-24">
        <div>
          <p className={eyebrowClass}>
            <span className="h-0.5 w-6 bg-current" aria-hidden="true" /> Start
            building
          </p>
          <h2 className="m-0 font-serif text-[clamp(2.7rem,5vw,5rem)] leading-[1.04] font-medium tracking-[-0.055em]">
            最初のApplicationを、
            <br />
            いま作ろう。
          </h2>
        </div>
        <div className="self-end">
          <p className="mb-7 max-w-lg leading-8 text-ink-soft">
            Node.js 22以上。initializerがTargetとpackage
            managerの選択から案内します。
          </p>
          <Link
            className={`${buttonClass} bg-ink text-cream hover:bg-copper-dark`}
            href="/docs/getting-started/"
          >
            Getting Started <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}
