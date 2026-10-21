import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import LegalArticle from '../_components/LegalArticle'
import LegalContactBlock from '../_components/LegalContactBlock'
import { getLegalDoc } from '../_content'

/**
 * ביטולים והחזרות, at `/returns`. Both WordPress-era addresses
 * (`/refund_returns`, `/cancellation-policy`) permanently redirect here. The
 * text follows section 14ג of the Consumer Protection Law: an unredeemed
 * coupon cancels within 14 days for a fee of at most 5% or 100 shekels, and a
 * physical product refunds in full by default, which is also what
 * `planRefund` in `src/server/domain/orders/refund.ts` computes.
 */
const doc = getLegalDoc('returns')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: alternatesFor('/returns'),
}

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="לביטול הזמנה, לבירור על החזר או להסלמה של פנייה שלא נענתה, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
