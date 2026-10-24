import type { Metadata } from 'next'
import { BatchResolutionPage } from '../../../../components/batch-resolution-page'

export const metadata: Metadata = {
  title: 'Batch Resolution',
  description:
    'GraphQLの個別取得とBatch取得を図で比較し、loadの実装方法を確認できます。',
  alternates: {
    canonical: '/ja/features/batch-resolution/',
    languages: {
      en: '/features/batch-resolution/',
      ja: '/ja/features/batch-resolution/',
    },
  },
}

export default function JapaneseBatchResolutionFeaturePage() {
  return <BatchResolutionPage locale="ja" />
}
