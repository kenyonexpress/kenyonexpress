import type { Metadata } from 'next'
import LegalArticle from '../../(legal)/_components/LegalArticle'
import LegalContactBlock from '../../(legal)/_components/LegalContactBlock'
import { getLegalDoc } from '../../(legal)/_content'

/**
 * The canonical privacy document, at the URL the site actually links to.
 *
 * THIS PAGE USED TO RENDER A SECOND, OLDER TEXT. Two indexable sets of terms
 * existed: this path, which `SiteFooter` links and `next.config.ts` aliases,
 * rendering `src/content/legal`; and `/legal/privacy`, unlinked and noindexed,
 * rendering the better-sourced set under `(legal)/_content`, written to
 * Amendment 13, to the no-Escrow coupon model, and to sections 14ג and 14ח.
 *
 * The newer text is now served here, at the older, linked, indexed URL, and
 * `/legal/privacy` permanently redirects to this path. That is the promotion the
 * old `(legal)/layout.tsx` comment described, done in the direction that keeps
 * every existing inbound link and every footer href working: the URL a customer
 * or a search engine already holds is the one that keeps resolving, and only
 * the text behind it improves.
 */
const doc = getLegalDoc('privacy')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: '/privacy-policy' },
}

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="לשאלות על המידע שנשמר עליכם, למימוש זכות עיון או למחיקה, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
