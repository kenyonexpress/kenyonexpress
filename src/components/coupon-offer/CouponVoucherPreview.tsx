import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import { shekelsFromIls } from '@/lib/money-format'
import { maskedVoucherCode } from '@/lib/vouchers/coupon-view'
import { Lock } from 'lucide-react'

/**
 * What the buyer will hold up at the counter, shown before they have bought it.
 *
 * The card mirrors /coupon/[id] on purpose: same order (name, square, code,
 * status chip), so the voucher that arrives after payment is recognisable as
 * the thing this page promised. Two things in it are deliberately NOT real:
 *
 *   THE SQUARE IS NOT A QR. It is an SVG of the three finder patterns with a
 *   lock over the data area. `lib/vouchers/qr-image.ts` is the only module
 *   allowed to run the encoder, and a public page must render nothing a
 *   cashier could scan: the signed `KEV1` token is minted at purchase, and a
 *   square that merely looked like it invites a scan that fails in front of
 *   the customer. The product page's URL QR (`CouponQrExpiry`, rendered under
 *   this card) is a different object and says so in its caption.
 *
 *   THE CODE IS MASKED in the exact 5-5 shape of a real one, see
 *   `maskedVoucherCode`. `aria-label` carries the sentence; the glyphs are
 *   decoration to a screen reader.
 */
/** Top-right, top-left, bottom-right of a QR's three finder squares. */
const FINDER_ORIGINS: ReadonlyArray<readonly [number, number]> = [
  [6, 6],
  [66, 6],
  [6, 66],
]

export default function CouponVoucherPreview({
  name,
  supplierName,
  offer,
}: {
  name: string
  supplierName: string | null
  offer: CouponOffer
}) {
  return (
    <section className="cpn-preview" aria-labelledby="cpn-preview-title" data-cpn="preview">
      <header className="cpn-preview__head">
        <div>
          <h2 id="cpn-preview-title" className="cpn-preview__title">
            כך ייראה השובר שלכם
          </h2>
          <p className="cpn-preview__sub">
            {name}
            {supplierName ? ` · ${supplierName}` : ''}
          </p>
        </div>
        <span className="cpn-preview__chip">לפני רכישה</span>
      </header>

      <div className="cpn-preview__body">
        <div className="cpn-preview__square" aria-hidden="true">
          <svg viewBox="0 0 100 100" width="160" height="160" role="presentation">
            <title>תצוגה מקדימה של QR</title>
            <rect width="100" height="100" fill="var(--pdp-surface)" />
            {FINDER_ORIGINS.map(([x, y]) => (
              <g key={`${x}-${y}`}>
                <rect x={x} y={y} width="28" height="28" fill="var(--pdp-ink)" />
                <rect x={x + 4} y={y + 4} width="20" height="20" fill="var(--pdp-surface)" />
                <rect x={x + 8} y={y + 8} width="12" height="12" fill="var(--pdp-ink)" />
              </g>
            ))}
            <rect x="40" y="40" width="54" height="54" fill="var(--pdp-line)" opacity="0.5" />
          </svg>
          <span className="cpn-preview__lock">
            <Lock size={22} aria-hidden="true" />
          </span>
        </div>

        <p
          dir="ltr"
          className="cpn-preview__code"
          data-testid="coupon-code-mask"
          aria-label="קוד השובר נחשף לאחר הרכישה"
        >
          {maskedVoucherCode()}
        </p>
        <p className="cpn-preview__note">קוד השובר וה-QR החתום נחשפים מיד אחרי התשלום.</p>

        {offer.sellable ? (
          <dl className="cpn-preview__money">
            <div>
              <dt>משלמים באתר</dt>
              <dd>{shekelsFromIls(offer.paidOnlineIls)}</dd>
            </div>
            <div>
              <dt>משלמים בבית העסק</dt>
              <dd className="cpn-preview__money--due">
                {shekelsFromIls(offer.balanceAtBusinessIls)}
              </dd>
            </div>
            <div>
              <dt>מחיר מלא</dt>
              <dd className="cpn-preview__money--full">{shekelsFromIls(offer.fullPriceIls)}</dd>
            </div>
          </dl>
        ) : (
          <p className="cpn-preview__unavailable">
            {offer.reason === 'expired'
              ? 'המבצע הסתיים ולא ניתן לרכוש את הקופון.'
              : 'הקופון אינו זמין לרכישה כרגע.'}
          </p>
        )}
      </div>
    </section>
  )
}
