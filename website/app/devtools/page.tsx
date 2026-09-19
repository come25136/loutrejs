import type { Metadata } from 'next'
import { DevtoolsPage } from '../../components/devtools-page'

export const metadata: Metadata = {
  title: 'Devtools',
  description: 'Explore a local Loutre Application Graph in the browser.',
  alternates: {
    canonical: '/devtools/',
    languages: { en: '/devtools/', ja: '/ja/devtools/' },
  },
}

export default function Page() {
  return <DevtoolsPage locale="en" initialWorkspace="graph" />
}
