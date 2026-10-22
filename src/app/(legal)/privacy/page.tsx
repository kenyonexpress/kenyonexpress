import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import LegalArticle from '../_components/LegalArticle'
import LegalContactBlock from '../_components/LegalContactBlock'
import { getLegalDoc } from '../_content'

/**
 * מדיניות פרטיות, at `/privacy`. `/privacy-policy` permanently redirects here
 * (see `next.config.ts` and the note in `../terms/page.tsx`). The document is
 * written to the Protection of Privacy Law as amended by Amendment 13: what is
 * collected, the cookie table, retention periods, the section 13 and 14 access
 * and deletion rights, and the statement that personal data is never sold.
 */
const doc = getLegalDoc('privacy')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: alternatesFor('/privacy'),
}

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="לשאלות על המידע שנשמר עליכם, למימוש זכות עיון או למחיקה, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
