import { pageMetadata } from '../../lib/seo'
import { OssLicensesPage } from '../../components/oss-licenses-page'

export const metadata = pageMetadata('/oss-licenses/', 'en', {
  title: 'Open Source Licenses',
  description: 'Open source packages used by Loutre and their license texts.',
})

export default function OpenSourceLicensesPage() {
  return <OssLicensesPage locale="en" />
}
