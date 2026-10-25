import { pageMetadata } from '../../../../lib/seo'
import { DocumentPage } from '../../../../components/document-page'

export const metadata = pageMetadata('/docs/architecture/', 'ja', {
  title: 'Architecture',
  description:
    'LoutreのArchitectureと、Applicationを構成する公開インターフェースを解説します。',
})

export default function JapaneseArchitecturePage() {
  return <DocumentPage slug="architecture" locale="ja" />
}
