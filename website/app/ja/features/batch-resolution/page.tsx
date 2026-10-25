import { pageMetadata } from '../../../../lib/seo'
import { BatchResolutionPage } from '../../../../components/batch-resolution-page'

export const metadata = pageMetadata('/features/batch-resolution/', 'ja', {
  title: 'GraphQLのN+1問題とBatch Resolution',
  description:
    'GraphQLのN+1問題が起きる仕組みと、一括取得で問い合わせを減らす方法を図とTypeScriptのコードで解説します。',
})

export default function JapaneseBatchResolutionFeaturePage() {
  return <BatchResolutionPage locale="ja" />
}
