import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import LegalArticle from '../_components/LegalArticle'
import LegalContactBlock from '../_components/LegalContactBlock'
import { getLegalDoc } from '../_content'
import ConsentResetBlock from './ConsentResetBlock'

/**
 * מדיניות עוגיות, at `/cookie-policy`.
 *
 * F42 placed all five legal documents in the (legal) route group, as the goal
 * required. This page lives here rather than in (store) so that every legal
 * document is reached the same way and organized in one place. The consent
 * reset control travels with it - the promise to allow withdrawal is made in
 * this document, so the control belongs on this page.
 *
 * The slug is `/cookie-policy` (not `/cookies`) because it is the WordPress
 * ecosystem standard and what any inbound link written elsewhere will guess.
 */
const doc = getLegalDoc('cookies')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: alternatesFor('/cookie-policy'),
}

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <ConsentResetBlock />
      <LegalContactBlock intro="לשאלות על העוגיות שנשמרות אצלכם או על שינוי החלטת ההסכמה, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
