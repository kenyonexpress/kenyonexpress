import LegalDocumentView from '@/components/legal/LegalDocumentView'
import { getLegalPage } from '@/content/legal'
import type { Metadata } from 'next'

const document = getLegalPage('accessibility')

export const metadata: Metadata = {
  title: document.title,
  description: document.description,
  alternates: { canonical: '/accessibility' },
}

export default function Page() {
  return <LegalDocumentView document={document} breadcrumb={document.title} />
}
