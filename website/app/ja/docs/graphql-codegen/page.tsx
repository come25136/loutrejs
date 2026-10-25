import type { Metadata } from 'next'
import { DocumentPage } from '../../../../components/document-page'

export const metadata: Metadata = {
  title: 'GraphQLとCodegen',
  description:
    'LoutreのSDL-first Codegen、GraphQL HTTP、WebSocket Subscription、Batch Data Resolutionの使い方。',
  alternates: {
    canonical: '/ja/docs/graphql-codegen/',
    languages: {
      en: '/docs/graphql-codegen/',
      ja: '/ja/docs/graphql-codegen/',
    },
  },
}

export default function JapaneseGraphQLCodegenPage() {
  return <DocumentPage slug="graphql-codegen" locale="ja" />
}
