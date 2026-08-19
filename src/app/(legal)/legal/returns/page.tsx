import type { Metadata } from 'next'
import LegalArticle from '../../_components/LegalArticle'
import LegalContactBlock from '../../_components/LegalContactBlock'
import { getLegalDoc } from '../../_content'

const doc = getLegalDoc('returns')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: '/legal/returns' },
}

export default function ReturnsPage() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock
        heading="שליחת הודעת ביטול"
        intro="הודעת ביטול נקלטת בכל אחד מהערוצים הבאים. ציינו מספר הזמנה, את הפריט ואת סיבת הביטול:"
      />
    </LegalArticle>
  )
}
