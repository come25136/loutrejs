import type { Metadata } from 'next'
import { DocumentPage } from '../../../components/document-page'

export const metadata: Metadata = {
  title: 'はじめる',
  description:
    'Loutreのプロジェクト作成からHTTP、Task、Runtime、CLIまでを順に解説します。',
}

export default function GettingStartedPage() {
  return <DocumentPage slug="getting-started" />
}
