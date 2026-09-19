import type { Metadata } from 'next'
import { DevtoolsPage } from '../../../components/devtools-page'

export const metadata: Metadata = {
  title: 'Devtools Traces',
  description: 'Inspect local Loutre execution traces in the browser.',
  alternates: {
    canonical: '/devtools/trace/',
    languages: {
      en: '/devtools/trace/',
      ja: '/ja/devtools/trace/',
    },
  },
}

export default function Page() {
  return <DevtoolsPage locale="en" initialWorkspace="trace" />
}
