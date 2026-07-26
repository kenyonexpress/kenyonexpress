import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { shekels } from '@/lib/commerce/coupon-offer'

/**
 * The pricing block on a coupon product page.
 *
 * Headline wording matches the live site, which says `מחיר רגיל` / `מחיר בקניון`
 * and does NOT spell out the split (verified in docs/coupon-page-measured.md).
 * The split table below it is a deliberate divergence: the final business rules
 * make the on-site charge a partial payment, and a customer who is not told the
 * balance is due at the business finds out at the till. Consumer-protection
 * copy wins over byte-for-byte parity with a page that predates the model.
 *
 * Every colour and size comes from the @theme tokens in globals.css.
 */
export default function CouponPricing({ offer }: { offer: CouponOffer }) {
  if (!offer.sellable) {
    return (
      <div className="rounded-lg border border-border bg-surface-hover p-4">
        <p className="text-base font-bold text-heading">
          {offer.reason === 'expired' ? 'המבצע הסתיים' : 'הקופון אינו זמין לרכישה'}
        </p>
        <p className="mt-1 text-sm text-muted">
          {offer.reason === 'expired'
            ? 'תוקף ההצעה חלף. ייתכן שיפורסם מבצע חדש בקרוב.'
            : 'מחיר הקופון טרם הוגדר. נסו שוב מאוחר יותר.'}
        </p>
        {offer.fullPriceIls > 0 && (
          <p className="mt-3 text-sm text-muted">
            מחיר רגיל:{' '}
            <span className="font-medium text-heading">{shekels(offer.fullPriceIls)}</span>
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Headline prices, in the live site's own wording. */}
      <div>
        <p className="text-sm text-muted">
          מחיר רגיל:{' '}
          <span className="line-through text-price-strike">{shekels(offer.fullPriceIls)}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-end gap-3">
          <span className="text-sm text-muted">מחיר בקניון:</span>
          <span className="text-3xl font-black text-price">{shekels(offer.paidOnlineIls)}</span>
          {offer.discountPercent > 0 && (
            <span className="rounded-md bg-price px-2 py-0.5 text-sm font-bold text-white">
              {offer.discountPercent}%-
            </span>
          )}
        </div>
      </div>

      {/* The split. Not on live; required by the final business rules. */}
      <dl className="rounded-lg border border-border bg-surface-hover p-4 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">לתשלום באתר עכשיו</dt>
          <dd className="font-bold text-heading tabular-nums">{shekels(offer.paidOnlineIls)}</dd>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-4">
          <dt className="text-muted">יתרה לתשלום בבית העסק</dt>
          <dd className="font-bold text-heading tabular-nums">
            {shekels(offer.balanceAtBusinessIls)}
          </dd>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="font-medium text-heading">סה"כ שווי</dt>
          <dd className="font-bold text-heading tabular-nums">{shekels(offer.fullPriceIls)}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Validity and redemption terms. Kept separate from the price block because it
 * renders further down the page, below the buy button.
 */
export function CouponTerms({
  offer,
  terms,
  instructions,
}: {
  offer: CouponOffer
  terms: string | null
  instructions: string | null
}) {
  const validUntil = offer.validUntil
  const expiryDays = offer.sellable ? offer.expiryDays : null

  if (!validUntil && expiryDays === null && !terms && !instructions) return null

  return (
    <section
      aria-label="תנאי מימוש ותוקף"
      className="rounded-2xl border border-border bg-white p-5 lg:p-6"
    >
      <h2 className="text-base font-bold text-heading">תנאי מימוש ותוקף</h2>

      {(validUntil || expiryDays !== null) && (
        <ul className="mt-3 space-y-1.5 text-sm text-heading">
          {validUntil && (
            <li>
              <span className="text-muted">בתוקף עד: </span>
              <time dateTime={validUntil.toISOString()} className="font-medium">
                {validUntil.toLocaleDateString('he-IL', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </time>
            </li>
          )}
          {expiryDays !== null && (
            <li>
              <span className="text-muted">ניתן למימוש תוך: </span>
              <span className="font-medium">{expiryDays} ימים מרגע הרכישה</span>
            </li>
          )}
        </ul>
      )}

      {instructions && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-heading">אופן המימוש</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">
            {instructions}
          </p>
        </div>
      )}

      {terms && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-heading">תנאים והגבלות</h3>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{terms}</p>
        </div>
      )}
    </section>
  )
}
