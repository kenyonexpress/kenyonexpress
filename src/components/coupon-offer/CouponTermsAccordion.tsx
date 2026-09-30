import { describeCouponExpiry } from '@/lib/commerce/coupon-expiry'
import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import Link from 'next/link'

/**
 * The terms of the deal, foldable.
 *
 * `<details>` and not a client accordion: the page is a cached Server
 * Component and the fold works with no JavaScript, with the keyboard, and in
 * the printed page. Every section renders only when it has content. The
 * first one is open, because a page that hides all of its terms behind a
 * click is the pattern consumer law is written against.
 *
 * The cancellation section is always present: the right to cancel does not
 * depend on the admin having typed anything, and the sentence links the
 * policy it quotes.
 */
export interface CouponTermsSection {
  id: string
  title: string
  body: React.ReactNode
}

export function buildTermsSections(input: {
  offer: CouponOffer
  terms: string | null
  instructions: string | null
}): CouponTermsSection[] {
  const { offer, terms, instructions } = input
  const expiryDays = offer.sellable ? offer.expiryDays : null
  const expiry = describeCouponExpiry({
    validUntil: offer.validUntil,
    expiryDays,
    now: offer.validUntil ?? new Date(0),
  })

  const sections: CouponTermsSection[] = []

  if (expiry.deadlineLabel || expiry.voucherLabel) {
    sections.push({
      id: 'validity',
      title: 'תוקף',
      body: (
        <ul className="cpn-terms__list">
          {expiry.deadlineLabel && offer.validUntil && (
            <li>
              <time dateTime={offer.validUntil.toISOString()}>{expiry.deadlineLabel}</time>
            </li>
          )}
          {expiry.voucherLabel && <li>{expiry.voucherLabel}</li>}
        </ul>
      ),
    })
  }

  if (instructions?.trim()) {
    sections.push({
      id: 'redemption',
      title: 'אופן המימוש',
      body: <p className="cpn-terms__text">{instructions.trim()}</p>,
    })
  }

  if (terms?.trim()) {
    sections.push({
      id: 'conditions',
      title: 'תנאים והגבלות',
      body: <p className="cpn-terms__text">{terms.trim()}</p>,
    })
  }

  sections.push({
    id: 'cancellation',
    title: 'ביטול והחזר',
    body: (
      <p className="cpn-terms__text">
        אפשר לבטל את הרכישה כל עוד השובר לא מומש, בהתאם ל
        <Link href="/refund_returns" className="cpn-terms__link">
          מדיניות הביטולים
        </Link>
        . שובר שמומש בבית העסק אינו ניתן לביטול.
      </p>
    ),
  })

  return sections
}

export default function CouponTermsAccordion(props: {
  offer: CouponOffer
  terms: string | null
  instructions: string | null
}) {
  const sections = buildTermsSections(props)

  return (
    <section className="cpn-terms" aria-labelledby="cpn-terms-title" data-cpn="terms">
      <h2 id="cpn-terms-title" className="cpn-terms__title">
        תנאי הקופון
      </h2>
      <div className="cpn-terms__items">
        {sections.map((section, index) => (
          <details
            key={section.id}
            className="cpn-terms__item"
            open={index === 0}
            data-section={section.id}
          >
            <summary className="cpn-terms__summary">{section.title}</summary>
            <div className="cpn-terms__body">{section.body}</div>
          </details>
        ))}
      </div>
    </section>
  )
}
