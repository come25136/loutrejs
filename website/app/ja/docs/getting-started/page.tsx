import type { Metadata } from 'next'
import { DocumentPage } from '../../../../components/document-page'

export const metadata: Metadata = {
  title: 'はじめる',
  description:
    'Loutreのプロジェクト作成からHTTP、Task、Runtime、CLIまでを順に解説します。',
  alternates: {
    canonical: '/ja/docs/getting-started/',
    languages: {
      en: '/docs/getting-started/',
      ja: '/ja/docs/getting-started/',
    },
  },
}

export default function JapaneseGettingStartedPage() {
  return <DocumentPage slug="getting-started" locale="ja" />
}
