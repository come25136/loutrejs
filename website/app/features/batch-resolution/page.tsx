import type { Metadata } from 'next'
import { BatchResolutionPage } from '../../../components/batch-resolution-page'

export const metadata: Metadata = {
  title: 'Batch Resolution',
  description:
    'Compare per-item GraphQL resolvers with batched loading and see how to implement load in Loutre.',
  alternates: {
    canonical: '/features/batch-resolution/',
    languages: {
      en: '/features/batch-resolution/',
      ja: '/ja/features/batch-resolution/',
    },
  },
}

export default function BatchResolutionFeaturePage() {
  return <BatchResolutionPage locale="en" />
}
