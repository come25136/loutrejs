import type { Metadata } from 'next'
import { HomePage } from '../../components/home-page'

export const metadata: Metadata = {
  title: 'Loutre — TypeScript Framework',
  description:
    'HTTP、GraphQL、WebSocket Subscriptionに対応したマルチランタイムのTypeScriptフレームワーク。型推論、Codegen、DevToolsで開発をシンプルに。',
  alternates: {
    canonical: '/ja/',
    languages: {
      en: '/',
      ja: '/ja/',
    },
  },
}

export default function JapaneseHome() {
  return <HomePage locale="ja" />
}
