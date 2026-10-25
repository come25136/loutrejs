import { pageMetadata } from '../../lib/seo'
import { DevtoolsPage } from '../../components/devtools-page'

export const metadata = pageMetadata('/devtools/', 'en', {
  title: 'Devtools',
  description: 'Explore a local Loutre Application Graph in the browser.',
})

export default function Page() {
  return <DevtoolsPage locale="en" initialWorkspace="graph" />
}
