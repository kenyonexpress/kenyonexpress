import CopyCouponCode from '@/components/coupon/CopyCouponCode'
import CouponCountdown from '@/components/coupon/CouponCountdown'
import { countdownDeadline } from '@/lib/homepage/coupon-countdown'
import { shekelsFromIls } from '@/lib/money-format'
import { MapPin, TicketPercent } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export type Coupon = {
  id: string
  title_he: string
  business_name: string
  original_price: number
  platform_price: number | null
  discount_percentage: number | null
  location_he: string | null
  image_url: string | null
  /** `coupon_deals.valid_until`; optional because older readers omit it. */
  valid_until?: string | null
  /**
   * `coupon_deals.code`, pending migration 270: the code the shopper shows at
   * the business. Read through `readOptionalColumns`, so it is `undefined`
   * until the column exists and `null` on a row that has none.
   */
  code?: string | null
}

/**
 * The percentage the stub advertises: the row's own figure, else derived from
 * the two prices, else nothing (a card without a price advertises no number).
 */
export function couponDiscountPercent(
  coupon: Pick<Coupon, 'discount_percentage' | 'platform_price' | 'original_price'>,
): number | null {
  const original = Number(coupon.original_price)
  const pct =
    coupon.discount_percentage != null
      ? Math.round(Number(coupon.discount_percentage))
      : coupon.platform_price != null && original > 0
        ? Math.round((1 - coupon.platform_price / original) * 100)
        : null
  return pct != null && Number.isFinite(pct) && pct > 0 ? pct : null
}

/**
 * A coupon deal as a TICKET (UX10): a brand-yellow stub carrying the
 * percentage, a dashed perforation with a notch at each end, and the body with
 * the business, the title, the price split and, in the footer, the countdown
 * to `valid_until` and the copy-code button.
 *
 * THE CARD IS NO LONGER ONE LINK. It used to be an `<a>` around everything,
 * which is invalid the moment a button goes inside it, and a copy button is
 * the point of this step. The title is the link to the deal; the photograph,
 * when there is one, is a second link to the same place for the thumb, hidden
 * from the accessibility tree so the deal is not announced twice; and the
 * footer's action is the copy button when the row has a code and a "לפרטי
 * הקופון" link when it has none. Every control is at least 44px tall
 * (`touch-targets.spec.ts` measures `/` at 375).
 *
 * WHAT IS CONDITIONAL AND WHAT IS NOT. The countdown mounts only for a set,
 * parseable `valid_until` (`countdownDeadline`): a deal with no deadline makes
 * no urgency claim at all, the same rule as the product page. The copy button
 * mounts only for a row with a code, which today is none of them: the column
 * arrives with pending migration 270, and until it is applied every card shows
 * the details link. The title reserves two lines and the footer sits at the
 * bottom of the body, so a row of tickets lines up whatever each one has;
 * `grid-auto-rows: 1fr` on the grids that hold them does the rest (UX09).
 *
 * The photograph goes through the optimizer for the CSP reason the previous
 * card gave (`img-src` allows self, so `/_next/image` covers any upstream), and
 * `sizes` is the ticket's own column: one column on a phone, two from 768, four
 * from 1200 on the home page, three from 1024 on /coupons.
 */
export default function CouponCard({ coupon }: { coupon: Coupon }) {
  const href = `/coupons/${coupon.id}`
  // platform_price is the absolute amount charged online, set per product by
  // the admin. There is no default: the card used to fall back to 10% of the
  // sticker, the pricing model abolished on 2026-07-24. A coupon without a
  // price is shown without one rather than advertised at an invented number.
  const platformPrice = coupon.platform_price
  const original = Number(coupon.original_price)
  const discountPct = couponDiscountPercent(coupon)
  const deadline = countdownDeadline(coupon.valid_until)
  const code = coupon.code?.trim() || null

  return (
    <article className="coupon-ticket" data-coupon-card>
      {coupon.image_url && (
        <Link
          href={href}
          className="coupon-ticket__image"
          data-coupon-image
          aria-hidden="true"
          tabIndex={-1}
        >
          <Image
            src={coupon.image_url}
            alt=""
            fill
            sizes="(max-width: 767px) calc(100vw - 50px), (max-width: 1199px) calc(50vw - 55px), 280px"
            className="object-cover"
          />
        </Link>
      )}
      <div className="coupon-ticket__row">
        <div className="coupon-ticket__stub" data-coupon-stub>
          {discountPct != null ? (
            <>
              <span className="coupon-ticket__pct" data-coupon-badge>
                {discountPct}%
              </span>
              <span className="coupon-ticket__pct-label">הנחה</span>
            </>
          ) : (
            <TicketPercent size={28} aria-hidden="true" />
          )}
        </div>
        <div className="coupon-ticket__body">
          <p className="coupon-ticket__business" data-coupon-business>
            {coupon.business_name}
          </p>
          <h3 className="coupon-ticket__title" data-coupon-title>
            <Link href={href} className="coupon-ticket__title-link">
              {coupon.title_he}
            </Link>
          </h3>
          {coupon.location_he && (
            <p className="coupon-ticket__location">
              <MapPin size={11} aria-hidden="true" />
              {coupon.location_he}
            </p>
          )}
          <div className="coupon-ticket__price">
            {platformPrice != null ? (
              <>
                <span className="coupon-ticket__now" data-coupon-price>
                  {shekelsFromIls(platformPrice)}
                </span>
                <span className="coupon-ticket__was">{shekelsFromIls(original)}</span>
              </>
            ) : (
              <span className="coupon-ticket__tba">המחיר יעודכן בקרוב</span>
            )}
          </div>
          {platformPrice != null && (
            <p className="coupon-ticket__split">
              {shekelsFromIls(platformPrice)} באתר, היתרה בבית העסק
            </p>
          )}
          <div className="coupon-ticket__footer">
            {deadline && <CouponCountdown validUntilIso={deadline} />}
            {code ? (
              <CopyCouponCode code={code} />
            ) : (
              <Link href={href} className="coupon-ticket__more" data-coupon-more>
                לפרטי הקופון
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
