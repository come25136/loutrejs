import type { Metadata } from 'next'
import { HomePage } from '../../components/home-page'

export const metadata: Metadata = {
  title: 'Loutre — ランタイムに縛られないTypeScript Application Framework',
  description:
    'Loutreはひとつの明示的なApplication ModelをNode.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronで実行できるTypeScript Application Frameworkです。',
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
