import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import type { Locale } from '../../lib/i18n'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

hljs.registerLanguage('typescript', typescript)

const contractSource = `const AppContract = http.contract({
  greet: {
    method: 'GET',
    path: '/{name}',
    request: {
      params: {
        name: z.string(),
      },
    },
    responses: {
      ok: {
        status: 200,
        body: z.object({
          message: z.string(),
        }),
      },
    },
  },
})`

function implementationSource(comment: string) {
  return `const AppController = http.implementation({
  contract: AppContract,
  factory: () => ({
    greet(ctx) {
      // ${comment}
      const name = ctx.input.params.name

      return ctx.response.ok({
        body: {
          message: \`Hello, \${name}!\`,
        },
      })
    },
  }),
})`
}

const codeClass = [
  'overflow-x-auto font-mono text-[10px] leading-[1.85] text-slate-300 lg:text-[11px]',
  '[&_.hljs-keyword]:text-[#ff9d76] [&_.hljs-literal]:text-[#ff9d76]',
  '[&_.hljs-string]:text-[#a7d28d] [&_.hljs-title]:text-[#a7d28d]',
  '[&_.hljs-variable]:text-[#f4c58a] [&_.hljs-template-variable]:text-[#f4c58a] [&_.hljs-attr]:text-[#f4c58a] [&_.hljs-property]:text-[#f4c58a]',
  '[&_.hljs-number]:text-violet-300 [&_.hljs-built_in]:text-sky-300 [&_.hljs-type]:text-sky-300',
  '[&_.hljs-comment]:text-[#7d8790] [&_.hljs-comment]:italic',
].join(' ')

function HighlightedCode({ source }: { readonly source: string }) {
  const highlighted = hljs.highlight(source, {
    language: 'typescript',
    ignoreIllegals: true,
  }).value

  return (
    <pre className={codeClass}>
      <code
        className="hljs language-typescript"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </pre>
  )
}

function InferenceCode({ comment }: { readonly comment: string }) {
  return (
    <div className="overflow-hidden border border-[#263447] bg-[#0b121b] text-slate-300">
      <div className="grid min-[860px]:grid-cols-2">
        <div className="border-b border-white/8 p-5 min-[860px]:border-r min-[860px]:border-b-0 sm:p-7">
          <p className="mb-5 font-mono text-[9px] font-semibold tracking-[0.16em] text-sky-300 uppercase">
            Contract
          </p>
          <HighlightedCode source={contractSource} />
        </div>

        <div className="p-5 sm:p-7">
          <p className="mb-5 font-mono text-[9px] font-semibold tracking-[0.16em] text-sky-300 uppercase">
            Implementation
          </p>
          <HighlightedCode source={implementationSource(comment)} />
        </div>
      </div>
    </div>
  )
}

export function TypeInferenceSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].typeInference

  return (
    <HomeSection className="py-20 sm:py-28">
      <div className="shell grid grid-cols-[1.28fr_0.72fr] items-center gap-12 max-lg:grid-cols-1 lg:gap-14">
        <div className="max-w-3xl lg:order-2">
          <p className="text-[10px] font-bold tracking-[0.18em] text-ink-muted">
            {copy.eyebrow}
          </p>
          <h2 className="mt-5 text-[clamp(2.25rem,3.7vw,3.5rem)] leading-[1.03] font-bold tracking-[-0.055em]">
            {copy.title}
          </h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-ink-soft">
            {copy.body}
          </p>
          <p className="mt-3 font-mono text-[10px] text-ink-muted">
            {copy.note}
          </p>
        </div>

        <div className="mt-10 min-w-0 lg:order-1 lg:mt-0">
          <InferenceCode comment={copy.codeComment} />
        </div>
      </div>
    </HomeSection>
  )
}
