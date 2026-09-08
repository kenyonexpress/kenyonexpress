import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import LegalArticle from '../../(legal)/_components/LegalArticle'
import LegalContactBlock from '../../(legal)/_components/LegalContactBlock'
import { getLegalDoc } from '../../(legal)/_content'

/**
 * The canonical cookie policy.
 *
 * WHY `/cookie-policy` AND NOT `/legal/cookies`. The other four documents live
 * at the WordPress paths the site already linked and search engines already
 * indexed, with `/legal/<slug>` kept as a permanent redirect into them. This
 * document has no legacy path to inherit - it is new - but it follows the same
 * shape anyway, so that every legal page in this site is reached the same way
 * and `LegalFooterLinks` needs no special case for the one that is different.
 * `/cookie-policy` is also the slug the WordPress ecosystem uses, which is what
 * an inbound link written by anyone else will guess.
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
      <LegalContactBlock intro="לשאלות על העוגיות שנשמרות אצלכם או על שינוי החלטת ההסכמה, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
