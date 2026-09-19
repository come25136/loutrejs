import type { Metadata } from 'next'
import { DevtoolsPage } from '../../../../components/devtools-page'

export const metadata: Metadata = {
  title: 'Devtools Graph',
  description: 'ローカルのLoutre Application Graphをブラウザで探索します。',
  alternates: {
    canonical: '/ja/devtools/graph/',
    languages: {
      en: '/devtools/graph/',
      ja: '/ja/devtools/graph/',
    },
  },
}

export default function Page() {
  return <DevtoolsPage locale="ja" initialWorkspace="graph" />
}
