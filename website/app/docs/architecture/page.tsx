import type { Metadata } from 'next'
import { DocumentPage } from '../../../components/document-page'

export const metadata: Metadata = {
  title: 'Architecture',
  description:
    'Explore the architecture principles and public boundaries that compose a Loutre Application.',
}

export default function ArchitecturePage() {
  return <DocumentPage slug="architecture" locale="en" />
}
