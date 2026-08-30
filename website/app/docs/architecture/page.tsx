import type { Metadata } from 'next'
import { DocumentPage } from '../../../components/document-page'

export const metadata: Metadata = {
  title: 'Architecture',
  description:
    'LoutreのGraph-first設計原則と、Applicationを構成する公開境界を解説します。',
}

export default function ArchitecturePage() {
  return <DocumentPage slug="architecture" />
}
