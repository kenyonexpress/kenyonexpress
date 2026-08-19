import type { Metadata } from 'next'
import LegalArticle from '../../_components/LegalArticle'
import LegalContactBlock from '../../_components/LegalContactBlock'
import { getLegalDoc } from '../../_content'

const doc = getLegalDoc('terms')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: '/legal/terms' },
}

export default function TermsPage() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="לשאלות על התקנון, על דיל מסוים או על הזמנה שביצעתם, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
