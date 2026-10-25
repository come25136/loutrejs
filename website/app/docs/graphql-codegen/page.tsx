import { pageMetadata } from '../../../lib/seo'
import { DocumentPage } from '../../../components/document-page'

export const metadata = pageMetadata('/docs/graphql-codegen/', 'en', {
  title: 'GraphQL, Codegen & Data Resolution',
  description:
    'Build typed GraphQL APIs with Codegen, HTTP, WebSocket Subscriptions, and batched field resolution in Loutre.',
})

export default function GraphQLCodegenPage() {
  return <DocumentPage slug="graphql-codegen" locale="en" />
}
