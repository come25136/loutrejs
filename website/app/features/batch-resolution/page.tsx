import { pageMetadata } from '../../../lib/seo'
import { BatchResolutionPage } from '../../../components/batch-resolution-page'

export const metadata = pageMetadata('/features/batch-resolution/', 'en', {
  title: 'Batch Resolution',
  description:
    'Compare per-item GraphQL resolvers with batched loading and see how to implement load in Loutre.',
})

export default function BatchResolutionFeaturePage() {
  return <BatchResolutionPage locale="en" />
}
