import Image from 'next/image'
import { ShieldCheck } from 'lucide-react'
import type { Locale } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

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
      <pre className="px-4 py-3 pr-24 font-mono text-[9px] leading-5 text-ink sm:px-5 sm:py-4 sm:pr-28 sm:text-[10px] sm:leading-6">
        <code>
          <span className="text-copper">const</span> application ={' '}
          <span className="text-violet-600">defineApplication</span>({'{'}
          {'\n'} {'  '}modules: [UsersModule(), HealthModule()],
          {'\n'}
          {'}'}
          {'\n\n'}
          <span className="text-copper">export default</span> application
        </code>
      </pre>
      <Image
        className="pointer-events-none absolute -bottom-5 right-1 z-10 h-auto w-24 sm:right-2 sm:w-28"
        src="/characters/otter-laptop.png"
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
    <div className="mx-auto flex aspect-square w-full max-w-[88px] flex-col items-center justify-center gap-1 rounded-[1.35rem] border border-line bg-surface px-2 py-2 text-center shadow-[0_10px_24px_rgba(17,24,39,0.08)] sm:max-w-[104px] sm:gap-1.5">
      <span className="grid size-8 shrink-0 place-items-center sm:size-9">
        <Image
          className="size-7 object-contain sm:size-8"
          src={runtime.src}
          width={runtime.width}
          height={runtime.height}
          alt=""
          aria-hidden="true"
        />
      </span>
      <strong className="min-w-0 text-[9px] leading-3 sm:text-[10px] sm:leading-3">
        {runtime.name}
      </strong>
    </div>
  )
}

function RuntimeDiagram() {
  return (
    <div className="relative mx-auto h-[460px] w-full max-w-[620px]">
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

      <div className="absolute inset-x-[12%] top-[130px] z-10">
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
      <div className="shell grid grid-cols-[0.72fr_1.28fr] items-center gap-12 max-lg:grid-cols-1 lg:gap-16">
        <div>
          <p className="text-[10px] font-bold tracking-[0.18em] text-ink-muted">
            {copy.eyebrow}
          </p>
          <h2 className="mt-5 max-w-xl text-[clamp(2rem,3.2vw,3rem)] leading-[1.06] font-bold tracking-[-0.055em] text-balance">
            {copy.title}
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-7 text-ink-soft">
            {copy.body.map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
          </p>
          <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-2 font-mono text-[10px] text-ink-soft">
            <ShieldCheck
              size={13}
              className="text-emerald-600"
              aria-hidden="true"
            />
            {copy.capability}
          </p>
        </div>

        <div className="relative">
          <RuntimeDiagram />
          <p className="absolute -right-1 -bottom-10 rotate-[-3deg] whitespace-nowrap text-sm font-medium text-sky-500/80 italic max-lg:right-2 max-lg:text-xs">
            {copy.annotation}
          </p>
        </div>
      </div>
    </HomeSection>
  )
}
