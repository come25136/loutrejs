import type { Metadata } from 'next'
import { DevtoolsPage } from '../../../components/devtools-page'

export const metadata: Metadata = {
  title: 'Devtools',
  description: 'ローカルのLoutre Application Graphをブラウザで探索します。',
  alternates: {
    canonical: '/ja/devtools/',
    languages: { en: '/devtools/', ja: '/ja/devtools/' },
  },
}

export default function Page() {
  return <DevtoolsPage locale="ja" initialWorkspace="graph" />
}
