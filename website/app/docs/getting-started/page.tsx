import type { Metadata } from 'next'
import { DocumentPage } from '../../../components/document-page'

export const metadata: Metadata = {
  title: 'Getting Started',
  description:
    'Learn how to create a Loutre project and work with HTTP, Tasks, Runtimes, and the CLI.',
}

export default function GettingStartedPage() {
  return <DocumentPage slug="getting-started" locale="en" />
}
