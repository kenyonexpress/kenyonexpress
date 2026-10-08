import { publicPageMetadata } from '@/lib/seo/page-metadata'
import type { Metadata } from 'next'
import LegalArticle from '../../(legal)/_components/LegalArticle'
import LegalContactBlock from '../../(legal)/_components/LegalContactBlock'
import { getLegalDoc } from '../../(legal)/_content'

/**
 * The cookie policy, at the short path the goal names.
 *
 * No WordPress ancestor and no legacy URL, so `/cookies` is canonical. The
 * inventory tables are built in `(legal)/_content/cookies.ts` from the cookie
 * constants the code declares; this file is only the route and the head.
 */
const doc = getLegalDoc('cookies')

export const metadata: Metadata = publicPageMetadata({
  title: doc.title,
  description: doc.description,
  path: doc.path,
})

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="לשאלות על עוגיות, על ההסכמה שנתתם או על מחיקת מידע שנאסף, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
