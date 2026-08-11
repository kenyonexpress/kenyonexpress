import LegalDocumentView from '@/components/legal/LegalDocumentView'
import { getLegalPage } from '@/content/legal'
import type { Metadata } from 'next'

const document = getLegalPage('refund_returns')

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: '/refund_returns' },
}

export default function Page() {
  return <LegalDocumentView document={document} breadcrumb={document.title} />
}
