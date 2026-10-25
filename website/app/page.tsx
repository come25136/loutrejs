import { HomePage } from '../components/home-page'
import { pageMetadata } from '../lib/seo'
export const metadata = pageMetadata('/', 'en', {
  title: 'TypeScript HTTP & GraphQL Framework',
  description:
    'Build type-safe HTTP and GraphQL APIs with built-in batching and DevTools. Run Loutre on Node.js, Bun, Cloudflare Workers, and AWS Lambda.',
})

export default function Home() {
  return <HomePage locale="en" />
}
