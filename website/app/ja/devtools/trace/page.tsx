import { pageMetadata } from '../../../../lib/seo'
import { DevtoolsPage } from '../../../../components/devtools-page'

export const metadata = pageMetadata('/devtools/trace/', 'ja', {
  title: 'Devtools Traces',
  description: 'ローカルのLoutre Execution Traceをブラウザで確認します。',
})

export default function Page() {
  return <DevtoolsPage locale="ja" initialWorkspace="trace" />
}
