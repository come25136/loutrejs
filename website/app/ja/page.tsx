import type { Metadata } from 'next'
import { HomePage } from '../../components/home-page'

export const metadata: Metadata = {
  title: 'Loutre — ランタイムに縛られないTypeScriptアプリケーション',
  description:
    'Application、Contract、DI、Taskを一つのGraphとして構築し、複数のRuntimeで実行できるTypeScript Application Framework',
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
