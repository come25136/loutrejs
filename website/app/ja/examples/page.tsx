import type { Metadata } from 'next'
import { ExamplesPage } from '../../../components/examples-page'

export const metadata: Metadata = {
  title: 'サンプル',
  description:
    'HTTP、Auth、Task、Worker、Databaseを扱うLoutreの実行可能なサンプル集',
  alternates: {
    canonical: '/ja/examples/',
    languages: {
      en: '/examples/',
      ja: '/ja/examples/',
    },
  },
}

export default function JapaneseExamples() {
  return <ExamplesPage locale="ja" />
}
