import { pageMetadata } from '../../../../lib/seo'
import { DocumentPage } from '../../../../components/document-page'

export const metadata = pageMetadata('/docs/graphql-codegen/', 'ja', {
  title: 'GraphQLとCodegen',
  description:
    'LoutreのSDL-first Codegen、GraphQL HTTP、WebSocket Subscription、Batch Data Resolutionの使い方。',
})

export default function JapaneseGraphQLCodegenPage() {
  return <DocumentPage slug="graphql-codegen" locale="ja" />
}
