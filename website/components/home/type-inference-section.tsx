import type { Locale } from '../../lib/i18n'
import { CodeEditor } from '../code-editor'
import { HighlightedCode } from '../highlighted-code'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'

const contractSource = `import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

export const AppContract = http.contract({
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

const implementationSource = `import { http } from '@loutrejs/loutre/http'
import { AppContract } from './contract.js'

export const AppController = http.implementation({
  name: 'AppController',
  contract: AppContract,
  factory: () => ({
    greet(ctx) {
      const name = ctx.input.params.name

      return ctx.response.ok({
        body: {
          message: \`Hello, \${name}!\`,
        },
      })
    },
  }),
})`

export function TypeInferenceSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].typeInference

  return (
    <HomeSection className="py-20 sm:py-28">
      <div className="shell">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {copy.title}
        </h2>
        <p className="mt-5 max-w-3xl text-[15px] leading-8 text-ink-soft">
          {copy.body}
        </p>
        <div className="mt-9 sm:mt-10">
          <CodeEditor
            project="hello-http"
            label={copy.editorLabel}
            panes={[
              [
                {
                  path: 'src/contract.ts',
                  language: 'typescript',
                  content: (
                    <HighlightedCode
                      source={contractSource}
                      lineNumbers
                      className="pb-6 pt-2"
                    />
                  ),
                },
              ],
              [
                {
                  path: 'src/controller.ts',
                  language: 'typescript',
                  content: (
                    <HighlightedCode
                      source={implementationSource}
                      lineNumbers
                      className="pb-6 pt-2"
                    />
                  ),
                },
              ],
            ]}
          />
        </div>
      </div>
    </HomeSection>
  )
}
