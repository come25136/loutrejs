import type { Metadata } from 'next'
import { ExamplesPage } from '../../components/examples-page'

export const metadata: Metadata = {
  title: 'Examples',
  description:
    'Runnable Loutre examples for HTTP, authentication, Tasks, Workers, and databases.',
}

export default function Examples() {
  return <ExamplesPage locale="en" />
}
