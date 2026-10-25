import { pageMetadata } from '../../../lib/seo'
import { DocumentPage } from '../../../components/document-page'

export const metadata = pageMetadata('/docs/getting-started/', 'en', {
  title: 'Getting Started',
  description:
    'Learn how to create a Loutre project and work with HTTP, Tasks, Runtimes, and the CLI.',
})

export default function GettingStartedPage() {
  return <DocumentPage slug="getting-started" locale="en" />
}
