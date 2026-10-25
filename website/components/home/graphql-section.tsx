import type { Locale } from '../../lib/i18n'
import { localePrefix } from '../../lib/i18n'
import { CodeEditor } from '../code-editor'
import { HighlightedCode } from '../highlighted-code'
import { homeCopy } from './home-copy'
import { HomeSection } from './shared'
import { TextLink } from '../text-link'
import { BatchResolutionPreview } from './batch-resolution-preview'

const schemaSource = `type Counter {
  value: Int!
}

type Query {
  counter: Counter!
}

type Mutation {
  increment(amount: Int!): Counter!
}`

const resolverSource = `import type { Resolvers } from './generated/types.js'
import type { AppContext } from './context.js'

export const resolvers = {
  Query: {
    counter: ({ context }) => context.counter.current(),
  },
  Mutation: {
    increment: ({ args, context }) =>
      context.counter.increment(args.amount),
  },
} satisfies Resolvers<AppContext>`

const endpointSource = `import { graphql } from '@loutrejs/graphql'
import { inject } from '@loutrejs/loutre'
import { bindManifest } from './generated/bindings.js'
import { schemaDocument } from './generated/schema-ast.js'
import { resolvers } from './resolvers.js'
import { CounterStore } from '../domain/counter.js'
import type { AppContext } from './context.js'

const manifest = bindManifest<AppContext>({
  schemaDocument,
  resolvers,
})

export const endpoint = graphql.endpoint({
  name: 'Counter',
  path: '/graphql',
  manifest,
  factory: (counter = inject(CounterStore)) => ({
    context: ({ signal }) => ({ counter, signal }),
  }),
})`

export function GraphQLSection({ locale }: { readonly locale: Locale }) {
  const copy = homeCopy[locale].graphql
  const prefix = localePrefix(locale)

  return (
    <HomeSection className="py-20 sm:py-28">
      <div className="shell">
        <h2 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {copy.title}
        </h2>
        <p className="mt-5 max-w-3xl text-[15px] leading-8 text-ink-soft">
          {copy.body}
        </p>
        <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3">
          <TextLink href={`${prefix}/docs/graphql-codegen/`}>
            {copy.docs}
          </TextLink>
          <TextLink
            href="https://github.com/come25136/loutrejs/tree/main/examples/graphql-counter"
            external
          >
            {copy.example}
          </TextLink>
        </div>
        <div className="mt-9 sm:mt-10">
          <CodeEditor
            project="counter"
            label={copy.editorLabel}
            panes={[
              [
                {
                  path: 'contracts/counter.graphql',
                  language: 'graphql',
                  content: (
                    <HighlightedCode
                      source={schemaSource}
                      language="graphql"
                      lineNumbers
                      className="pb-6 pt-2"
                    />
                  ),
                },
              ],
              [
                {
                  path: 'src/graphql/resolvers.ts',
                  language: 'typescript',
                  content: (
                    <HighlightedCode
                      source={resolverSource}
                      lineNumbers
                      className="pb-6 pt-2"
                    />
                  ),
                },
                {
                  path: 'src/graphql/endpoint.ts',
                  language: 'typescript',
                  content: (
                    <HighlightedCode
                      source={endpointSource}
                      lineNumbers
                      className="pb-6 pt-2"
                    />
                  ),
                },
              ],
            ]}
          />
        </div>
        <BatchResolutionPreview locale={locale} />
        <div className="mt-8 grid gap-6 border-t border-line pt-6 md:grid-cols-2 md:gap-10">
          {copy.features.map((feature) => (
            <div key={feature.title}>
              <h3 className="text-lg font-semibold tracking-[-0.025em]">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-7 text-ink-soft">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </HomeSection>
  )
}
