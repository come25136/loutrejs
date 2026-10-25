import { pageMetadata } from '../../../lib/seo'
import { PrivacyPage } from '../../../components/privacy-page'

export const metadata = pageMetadata('/privacy/', 'ja', {
  title: 'アクセス解析について',
  description:
    'Loutre公式サイトのアクセス解析で計測する情報と、Google Analyticsの利用について説明します。',
})

export default function Page() {
  return <PrivacyPage locale="ja" />
}
