import type { Metadata } from 'next'
import { OssLicensesPage } from '../../components/oss-licenses-page'

export const metadata: Metadata = {
  title: 'Open Source Licenses',
  description: 'Open source packages used by Loutre and their license texts.',
}

export default function OpenSourceLicensesPage() {
  return <OssLicensesPage locale="en" />
}
