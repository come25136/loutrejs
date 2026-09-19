import type { Metadata } from 'next'
import { OssLicensesPage } from '../../../components/oss-licenses-page'

export const metadata: Metadata = {
  title: 'オープンソースライセンス',
  description: 'Loutreが利用しているオープンソースパッケージとライセンス本文。',
  alternates: {
    canonical: '/ja/oss-licenses/',
    languages: {
      en: '/oss-licenses/',
      ja: '/ja/oss-licenses/',
    },
  },
}

export default function JapaneseOpenSourceLicensesPage() {
  return <OssLicensesPage locale="ja" />
}
