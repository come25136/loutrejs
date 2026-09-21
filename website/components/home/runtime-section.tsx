import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import Image from 'next/image'
import type { Locale } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

hljs.registerLanguage('typescript', typescript)

const applicationSource = `const application = defineApplication({
  modules: [UsersModule(), HealthModule()],
})

export default application`

const runtimes = [
  { name: 'Node.js', src: '/runtimes/nodejs.svg', width: 44, height: 50 },
  { name: 'Bun', src: '/runtimes/bun.svg', width: 80, height: 70 },
  { name: 'Deno', src: '/runtimes/deno.svg', width: 441, height: 441 },
  {
    name: 'Cloudflare Workers',
    src: '/runtimes/cloudflare.svg',
    width: 66,
    height: 30,
  },
  {
    name: 'AWS Lambda',
    src: '/runtimes/aws-lambda.png',
    width: 64,
    height: 64,
  },
  {
    name: 'Electron',
    src: '/runtimes/electron.svg',
    width: 128,
    height: 128,
  },
] as const

const runtimeConnections = [
  { id: 'node', path: 'M 300 160 C 300 106 100 106 100 52' },
  { id: 'bun', path: 'M 300 160 C 300 106 300 106 300 52' },
  { id: 'deno', path: 'M 300 160 C 300 106 500 106 500 52' },
  { id: 'cloudflare', path: 'M 300 306 C 300 360 100 360 100 408' },
  { id: 'lambda', path: 'M 300 306 C 300 360 300 360 300 408' },
  { id: 'electron', path: 'M 300 306 C 300 360 500 360 500 408' },
] as const

function ApplicationCode() {
  return (
    <div className="relative mx-auto w-full max-w-[390px] rounded-xl border border-line-strong bg-surface shadow-[0_22px_60px_rgba(17,24,39,0.13)]">
      <div className="flex h-8 items-center gap-1.5 rounded-t-xl bg-[#162033] px-3">
        <span className="size-2 rounded-full bg-[#ff625d]" />
        <span className="size-2 rounded-full bg-[#ffbd2e]" />
        <span className="size-2 rounded-full bg-[#27c93f]" />
        <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px] text-white/70">
          app.ts
        </span>
      </div>
      <pre className="px-4 py-3 pr-24 font-mono text-[9px] leading-5 text-ink sm:px-5 sm:py-4 sm:pr-28 sm:text-[10px] sm:leading-6 [&_.hljs-attr]:text-sky-700 [&_.hljs-keyword]:text-copper [&_.hljs-title]:text-violet-600 [&_.hljs-title.class_]:text-violet-600">
        <code
          className="hljs language-typescript"
          dangerouslySetInnerHTML={{
            __html: hljs.highlight(applicationSource, {
              language: 'typescript',
              ignoreIllegals: true,
            }).value,
          }}
        />
      </pre>
      <Image
        className="pointer-events-none absolute -bottom-5 right-1 z-10 h-auto w-24 sm:right-2 sm:w-28"
        src="/characters/otter-wave.png"
        width={1254}
        height={1254}
        alt="Loutre"
      />
    </div>
  )
}

function RuntimeNode({
  runtime,
}: {
  readonly runtime: (typeof runtimes)[number]
}) {
  return (
    <div className="mx-auto flex w-full max-w-[112px] flex-col items-center justify-center gap-2 px-2 py-3 text-center">
      <span className="grid size-10 shrink-0 place-items-center sm:size-11">
        <Image
          className="size-9 object-contain sm:size-10"
          src={runtime.src}
          width={runtime.width}
          height={runtime.height}
          alt=""
          aria-hidden="true"
        />
      </span>
      <strong className="min-w-0 text-[10px] leading-4 font-semibold text-ink-soft sm:text-[11px]">
        {runtime.name}
      </strong>
    </div>
  )
}

function RuntimeDiagram() {
  return (
    <div className="relative mx-auto h-[440px] w-full max-w-[620px]">
      <div className="absolute inset-x-0 top-0 z-10 grid grid-cols-3 gap-2 sm:gap-3">
        {runtimes.slice(0, 3).map((runtime) => (
          <RuntimeNode runtime={runtime} key={runtime.name} />
        ))}
      </div>

      <svg
        className="pointer-events-none absolute inset-0 size-full overflow-visible text-line-strong"
        viewBox="0 0 600 460"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="4 5"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        >
          {runtimeConnections.map(({ id, path }) => (
            <path d={path} id={`runtime-connection-${id}`} key={id} />
          ))}
        </g>
        <g className="motion-reduce:hidden">
          {runtimeConnections.map(({ id }) => {
            const index = runtimeConnections.findIndex(
              (connection) => connection.id === id,
            )
            const duration = 2.4 + index * 0.08
            const delay = index * 0.14
            return (
              <circle fill="#ff6a30" r="2.6" key={id}>
                <animateMotion
                  begin={`${delay}s`}
                  dur={`${duration}s`}
                  repeatCount="indefinite"
                >
                  <mpath href={`#runtime-connection-${id}`} />
                </animateMotion>
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.12;0.82;1"
                  dur={`${duration}s`}
                  begin={`${delay}s`}
                  repeatCount="indefinite"
                />
              </circle>
            )
          })}
        </g>
      </svg>

      <div className="absolute inset-x-[12%] top-[120px] z-10">
        <ApplicationCode />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 grid grid-cols-3 gap-2 sm:gap-3">
        {runtimes.slice(3).map((runtime) => (
          <RuntimeNode runtime={runtime} key={runtime.name} />
        ))}
      </div>
    </div>
  )
}

export function RuntimeSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].runtime

  return (
    <HomeSection className="overflow-hidden bg-surface-muted py-18 sm:py-24">
      <div className="shell grid grid-cols-[1.1fr_0.9fr] items-center gap-12 max-lg:grid-cols-1 lg:gap-16">
        <div className="lg:order-2">
          <p className="text-[10px] font-bold tracking-[0.18em] text-ink-muted">
            {copy.eyebrow}
          </p>
          <h2 className="mt-5 max-w-xl whitespace-pre-line text-[clamp(2rem,3.2vw,3rem)] leading-[1.06] font-bold tracking-[-0.055em] lg:whitespace-pre">
            {copy.title}
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-ink-soft">
            {copy.body.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </p>
        </div>

        <div className="relative lg:order-1">
          <RuntimeDiagram />
        </div>
      </div>
    </HomeSection>
  )
}
