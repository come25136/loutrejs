import type { Metadata } from 'next'
import { HomePage } from '../../components/home-page'

export const metadata: Metadata = {
  title: 'Loutre — TypeScript Framework',
  description:
    '様々なランタイムで動くTypeScriptフレームワーク。型推論とDevToolsで、シンプルな開発体験を提供します。',
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
