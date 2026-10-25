import { pageMetadata } from '../../lib/seo'
import { ExamplesPage } from '../../components/examples-page'

export const metadata = pageMetadata('/examples/', 'en', {
  title: 'Examples',
  description:
    'Runnable Loutre examples for HTTP, authentication, Tasks, Workers, and databases.',
})

export default function Examples() {
  return <ExamplesPage locale="en" />
}
