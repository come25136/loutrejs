import type { Metadata } from 'next'
import { DocumentPage } from '../../../components/document-page'

export const metadata: Metadata = {
  title: 'GraphQL, Codegen & Data Resolution',
  description:
    'Build typed GraphQL APIs with Codegen, HTTP, WebSocket Subscriptions, and batched field resolution in Loutre.',
  alternates: {
    canonical: '/docs/graphql-codegen/',
    languages: {
      en: '/docs/graphql-codegen/',
      ja: '/ja/docs/graphql-codegen/',
    },
  },
}

export default function GraphQLCodegenPage() {
  return <DocumentPage slug="graphql-codegen" locale="en" />
}
