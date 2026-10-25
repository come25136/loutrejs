import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { batchResolutionCopy } from '../lib/batch-resolution-copy'
import { localePrefix, type Locale } from '../lib/i18n'
import { BatchResolutionDiagram } from './batch-resolution/diagram'
import { CodeEditor } from './code-editor'
import { HighlightedCode } from './highlighted-code'
import { TextLink } from './text-link'

const resolverSource = `export const resolvers = {
  OrderItem: {
    product: ({ parent, context }) =>
      context.catalog.findById(parent.productId, {
        signal: context.signal,
      }),
  },
} satisfies Resolvers<AppContext>`

const batchSource = `export const resolvers = {
  OrderItem: {
    product: {
      requires: ['productId'],
      load: ({ parents: items, context, signal }) =>
        context.catalog.findForItems(items, { signal }),
    },
  },
} satisfies Resolvers<AppContext>`

export function BatchResolutionPage({ locale }: { readonly locale: Locale }) {
  const copy = batchResolutionCopy[locale]
  const prefix = localePrefix(locale)

  return (
    <main className="shell py-9 sm:py-12">
      <header className="max-w-3xl pb-9 sm:pb-11">
        <nav
          aria-label={copy.breadcrumb}
          className="flex items-center gap-2 text-xs text-ink-soft"
        >
          <Link href={`${prefix}/`} className="hover:text-interaction">
            {copy.home}
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <Link
            href={`${prefix}/docs/graphql-codegen/`}
            className="hover:text-interaction"
          >
            GraphQL
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span aria-current="page" className="text-ink">
            Batch Resolution
          </span>
        </nav>
        <h1 className="mt-6 text-4xl leading-tight font-semibold tracking-tight sm:text-[2.65rem]">
          {copy.title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-ink-soft">
          {copy.body}
        </p>
        {locale === 'ja' && (
          <div className="mt-5">
            <TextLink href="/ja/docs/graphql-n-plus-one/">
              OrdersサンプルでN+1対策を確認する
            </TextLink>
          </div>
        )}
      </header>
      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_176px] lg:gap-14">
        <aside className="border-y border-line py-4 lg:sticky lg:top-28 lg:order-2 lg:border-y-0 lg:border-l lg:py-0 lg:pl-5">
          <nav aria-label={copy.pageNavigation}>
            <p className="mb-4 hidden text-xs font-medium text-ink lg:block">
              {copy.pageNavigation}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-3 lg:flex-col">
              {Object.entries(copy.sections).map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="text-xs leading-6 text-ink-soft hover:text-copper-dark"
                >
                  {label}
                </a>
              ))}
            </div>
          </nav>
        </aside>
        <article className="min-w-0 lg:order-1">
          <section
            id="comparison"
            aria-labelledby="comparison-title"
            className="scroll-mt-28 pb-10 sm:pb-12"
          >
            <h2
              id="comparison-title"
              className="mb-5 text-2xl font-semibold tracking-tight"
            >
              {copy.sections.comparison}
            </h2>
            <BatchResolutionDiagram copy={copy.diagram} />
          </section>
          <section
            id="implementation"
            aria-labelledby="implementation-title"
            className="scroll-mt-28 border-t border-line py-9 sm:py-11"
          >
            <h2
              id="implementation-title"
              className="text-2xl font-semibold tracking-tight"
            >
              {copy.sections.implementation}
            </h2>
            <p className="mt-4 max-w-3xl text-[15px] leading-8 text-ink-soft">
              {copy.implementationLead}
            </p>
            <div className="mt-7">
              <CodeEditor
                project="graphql-orders"
                label={copy.editorLabel}
                panes={[
                  [
                    {
                      path: 'src/graphql/resolve.ts',
                      language: 'typescript',
                      content: (
                        <HighlightedCode
                          source={resolverSource}
                          lineNumbers
                          className="pb-6 pt-2"
                        />
                      ),
                    },
                  ],
                  [
                    {
                      path: 'src/graphql/load.ts',
                      language: 'typescript',
                      content: (
                        <HighlightedCode
                          source={batchSource}
                          lineNumbers
                          className="pb-6 pt-2"
                        />
                      ),
                    },
                  ],
                ]}
              />
            </div>
          </section>
          <div className="flex flex-wrap gap-x-8 gap-y-4 border-t border-line pt-7">
            <TextLink href={`${prefix}/docs/graphql-codegen/`}>
              {copy.docs}
            </TextLink>
            <TextLink
              href="https://github.com/come25136/loutrejs/tree/main/examples/graphql-orders"
              external
            >
              {copy.example}
            </TextLink>
          </div>
        </article>
      </div>
    </main>
  )
}
