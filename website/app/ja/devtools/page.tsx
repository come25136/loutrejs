import { pageMetadata } from '../../../lib/seo'
import { DevtoolsPage } from '../../../components/devtools-page'

export const metadata = pageMetadata('/devtools/', 'ja', {
  title: 'Devtools',
  description: 'ローカルのLoutre Application Graphをブラウザで探索します。',
})

export default function Page() {
  return <DevtoolsPage locale="ja" initialWorkspace="graph" />
}
