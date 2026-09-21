import type { Metadata } from 'next'
import { DocumentPage } from '../../../../components/document-page'

export const metadata: Metadata = {
  title: 'Architecture',
  description:
    'LoutreのArchitectureと、Applicationを構成する公開インターフェースを解説します。',
  alternates: {
    canonical: '/ja/docs/architecture/',
    languages: {
      en: '/docs/architecture/',
      ja: '/ja/docs/architecture/',
    },
  },
}

export default function JapaneseArchitecturePage() {
  return <DocumentPage slug="architecture" locale="ja" />
}
