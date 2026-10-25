import { pageMetadata } from '../../../lib/seo'
import { DevtoolsPage } from '../../../components/devtools-page'

export const metadata = pageMetadata('/devtools/trace/', 'en', {
  title: 'Devtools Traces',
  description: 'Inspect local Loutre execution traces in the browser.',
})

export default function Page() {
  return <DevtoolsPage locale="en" initialWorkspace="trace" />
}
