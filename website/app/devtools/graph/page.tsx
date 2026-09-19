import type { Metadata } from 'next'
import { DevtoolsPage } from '../../../components/devtools-page'

export const metadata: Metadata = {
  title: 'Devtools Graph',
  description: 'Explore a local Loutre Application Graph in the browser.',
  alternates: {
    canonical: '/devtools/graph/',
    languages: {
      en: '/devtools/graph/',
      ja: '/ja/devtools/graph/',
    },
  },
}

export default function Page() {
  return <DevtoolsPage locale="en" initialWorkspace="graph" />
}
