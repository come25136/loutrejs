import { pageMetadata } from '../../../lib/seo'
import { ExamplesPage } from '../../../components/examples-page'

export const metadata = pageMetadata('/examples/', 'ja', {
  title: 'サンプル',
  description:
    'HTTP、GraphQL、Subscription、Auth、Task、Worker、Databaseを扱うLoutreの実行可能なサンプル集',
})

export default function JapaneseExamples() {
  return <ExamplesPage locale="ja" />
}
