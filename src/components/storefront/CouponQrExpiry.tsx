import CouponExpiryCountdown from '@/components/storefront/CouponExpiryCountdown'
import { describeCouponExpiry } from '@/lib/commerce/coupon-expiry'
import type { CouponOffer } from '@/lib/commerce/coupon-offer'
import QRCode from 'qrcode'

/**
 * How a coupon is redeemed, and until when.
 *
 * THE QR ENCODES THE PRODUCT URL, NOT A VOUCHER. A voucher's QR is a signed
 * `KEV1` token minted at purchase and rendered by `lib/vouchers/qr-image.ts`
 * on the pages a buyer reaches after paying; nothing on a public product page
 * may look like one, or a cashier will be shown it. What this square does is
 * hand the deal to a phone: a shopper reading on a laptop scans it and has
 * the page, with the WhatsApp share and the buy button, in their pocket.
 * The caption says exactly that.
 *
 * SERVER-RENDERED AND DETERMINISTIC. The URL is the canonical product path
 * under the configured site origin, so the same slug always yields the same
 * image and the prerendered page carries it; no client bundle, no canvas.
 * A failed encode renders the block without the square rather than failing
 * the page -- the text beside it is the part consumer law cares about.
 *
 * THE TWO CLOCKS are split on purpose (see `coupon-expiry.ts`): the offer's
 * calendar deadline (server date, client countdown) and the voucher's life
 * from purchase. `CouponTerms` under this block prints the raw dates; this
 * block says what they mean.
 */
export default async function CouponQrExpiry({
  offer,
  productUrl,
}: {
  offer: CouponOffer
  productUrl: string
}) {
  const expiryDays = offer.sellable ? offer.expiryDays : null
  const expiry = describeCouponExpiry({
    validUntil: offer.validUntil,
    expiryDays,
    // Only the clock-independent labels are used from this call; the ticking
    // line is the client component below.
    now: offer.validUntil ?? new Date(0),
  })

  let qr: string | null = null
  try {
    qr = await QRCode.toDataURL(productUrl, { margin: 1, width: 192 })
  } catch {
    qr = null
  }

  return (
    <section className="pdp-coupon-qr" aria-label="מימוש הקופון" data-pdp="coupon-qr">
      {qr && (
        <figure className="pdp-coupon-qr__figure">
          {/* A data URL, generated here, never passes through the image
              optimizer; a plain img is the right element. */}
          <img src={qr} alt={`קוד QR לפתיחת הדף ${productUrl}`} width={192} height={192} />
          <figcaption>סרקו כדי לפתוח את הדיל בנייד</figcaption>
        </figure>
      )}
      <div className="pdp-coupon-qr__body">
        <h2 className="pdp-coupon-qr__title">איך מממשים</h2>
        <p className="pdp-coupon-qr__text">
          משלמים באתר ומקבלים שובר עם קוד QR חתום. מציגים אותו בקופה בבית העסק, והיתרה משולמת שם.
        </p>
        <ul className="pdp-coupon-qr__list">
          {expiry.deadlineLabel && offer.validUntil && (
            <li>
              <time dateTime={offer.validUntil.toISOString()}>{expiry.deadlineLabel}</time>
              <CouponExpiryCountdown validUntilIso={offer.validUntil.toISOString()} />
            </li>
          )}
          {expiry.voucherLabel && <li>{expiry.voucherLabel}</li>}
          {!expiry.deadlineLabel && !expiry.voucherLabel && (
            <li>תוקף השובר מצוין על השובר עצמו לאחר הרכישה.</li>
          )}
        </ul>
      </div>
    </section>
  )
}
