import { pageMetadata } from '../../lib/seo'
import { PrivacyPage } from '../../components/privacy-page'

export const metadata = pageMetadata('/privacy/', 'en', {
  title: 'Website analytics',
  description:
    'How the Loutre website uses Google Analytics to understand visits and improve its documentation.',
})

export default function Page() {
  return <PrivacyPage locale="en" />
}
