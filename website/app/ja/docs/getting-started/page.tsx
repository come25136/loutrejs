import { pageMetadata } from '../../../../lib/seo'
import { DocumentPage } from '../../../../components/document-page'

export const metadata = pageMetadata('/docs/getting-started/', 'ja', {
  title: 'はじめる',
  description:
    'Loutreのプロジェクト作成からHTTP、Task、Runtime、CLIまでを順に解説します。',
})

export default function JapaneseGettingStartedPage() {
  return <DocumentPage slug="getting-started" locale="ja" />
}
