import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import LegalArticle from '../_components/LegalArticle'
import LegalContactBlock from '../_components/LegalContactBlock'
import { getLegalDoc } from '../_content'

/**
 * תנאי שימוש, at `/terms`.
 *
 * F42 moved the canonical legal pages onto the short English paths the goal,
 * the docs and the old `(legal)/legal/*` stubs all name. The WordPress-era
 * URL (`/terms-and-conditions`) permanently redirects here from
 * `next.config.ts`, so every inbound link, footer href and indexed result
 * keeps resolving and only the address shortens. The text is the single
 * `(legal)/_content` set: minimum age 18 under section 2 of the Legal Capacity
 * and Guardianship Law, Israeli law and Tel Aviv jurisdiction, liability
 * capped at the amount paid, prohibited uses, intellectual property and the
 * account rules, each checked by `legal-pages.test.ts`.
 */
const doc = getLegalDoc('terms')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: alternatesFor('/terms'),
}

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="לשאלות על התקנון, על דיל מסוים או על הזמנה שביצעתם, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
