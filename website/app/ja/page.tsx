import { pageMetadata } from '../../lib/seo'
import { HomePage } from '../../components/home-page'

export const metadata = pageMetadata('/', 'ja', {
  title: 'HTTP・GraphQLのTypeScriptフレームワーク',
  description:
    '型安全なHTTP API、GraphQLの型生成とN+1対策を備えたLoutre。Node.js、Bun、Cloudflare Workersなどで動作します。',
})

export default function JapaneseHome() {
  return <HomePage locale="ja" />
}
