import { pageMetadata } from '../../../lib/seo'
import { OssLicensesPage } from '../../../components/oss-licenses-page'

export const metadata = pageMetadata('/oss-licenses/', 'ja', {
  title: 'オープンソースライセンス',
  description: 'Loutreが利用しているオープンソースパッケージとライセンス本文。',
})

export default function JapaneseOpenSourceLicensesPage() {
  return <OssLicensesPage locale="ja" />
}
