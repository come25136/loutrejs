import type { Metadata } from 'next'
import { DevtoolsPage } from '../../../../components/devtools-page'

export const metadata: Metadata = {
  title: 'Devtools Traces',
  description: 'ローカルのLoutre execution traceをブラウザで確認します。',
  alternates: {
    canonical: '/ja/devtools/trace/',
    languages: {
      en: '/devtools/trace/',
      ja: '/ja/devtools/trace/',
    },
  },
}

export default function Page() {
  return <DevtoolsPage locale="ja" initialWorkspace="trace" />
}
