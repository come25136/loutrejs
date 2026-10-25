import { pageMetadata } from '../../../../lib/seo'
import { DocumentPage } from '../../../../components/document-page'

export const metadata = pageMetadata('/docs/graphql-n-plus-one/', 'ja', {
  title: 'GraphQLのN+1問題をTypeScriptで確認する',
  description:
    'GraphQLのN+1問題と一括取得を、実行可能なLoutreのOrdersサンプルで確認します。先読みとBatch Resolutionの取得回数を比較します。',
})

export default function GraphQLNPlusOnePage() {
  return <DocumentPage slug="graphql-n-plus-one" locale="ja" />
}
