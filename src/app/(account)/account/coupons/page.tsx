import { giftHeldCopy } from '@/lib/gifts/held-copy'
import {
  COUPON_TONE_CHIP,
  couponMoneyView,
  couponStatusView,
  formatAgorot,
  formatCouponCode,
  formatCouponDate,
} from '@/lib/vouchers/coupon-view'
import { expiryRefundView } from '@/lib/vouchers/expiry-refund'
import { getVoucherExpiryCredits } from '@/server/queries/expiry'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import Link from 'next/link'

/**
 * The customer's coupons. One list, and the only one.
 *
 * There were two until now. This page read them through `getMyCoupons` and
 * printed the code as text; `/account/vouchers` read the same table through the
 * shared presenter and linked each row to `/coupon/[id]`. The account nav and
 * the overview card both pointed here, at the page with no route to the QR, so
 * the presentable coupon page was reachable only from the checkout confirmation
 * or from the issue email. A customer who closed either one could not get back
 * to their own QR from inside the account area at all.
 *
 * The surviving URL is this one, because it is the one in the nav, in the
 * overview and in the goal's own wording. `/account/vouchers` now redirects
 * here, so anything already sent or printed still works.
 *
 * No QR per row, on purpose. One per row put every live voucher's QR on a
 * single screen, made the page as heavy as the number of coupons owned, and
 * still left the customer scrolling at a counter. One row, one link, one screen
 * to hold up.
 *
 * Status and dates come from the shared presenter, so this page and the counter
 * cannot disagree about whether a coupon is usable. The deadline shown is
 * `expires_at`, never `offer_valid_until`: the two differ whenever the rolling
 * per-product window closes first.
 */

export const metadata = { title: 'הקופונים שלי' }

export default async function CouponsPage() {
  const vouchers = await getCustomerVouchers()

  /*
    The expiry credits for every lapsed coupon on the page, in ONE query.

    Per-row would be one round trip per expired coupon, which is the N+1 that
    costs the most for the customer who has bought the most. The ids come from
    a read already scoped by RLS and the credit read is scoped by RLS again.

    Skipped entirely when nothing on the page has expired, so the common list --
    live coupons -- is exactly as many queries as it was before.
  */
  const expiredIds = vouchers.filter((v) => v.status === 'expired').map((v) => v.id)
  const credits =
    expiredIds.length > 0
      ? await getVoucherExpiryCredits(expiredIds)
      : new Map<string, { amountAgorot: number; createdAt: string }>()

  return (
    <>
      <h1 className="account-title">הקופונים שלי</h1>
      <p className="account-subtitle">הצגת הקוד או ה-QR בבית העסק. היתרה משולמת שם בזמן הסריקה.</p>

      <section className="account-card">
        {vouchers.length === 0 ? (
          <p className="account-empty">עדיין לא רכשת קופונים.</p>
        ) : (
          vouchers.map((voucher) => {
            const status = couponStatusView(voucher)
            const money = couponMoneyView(voucher)
            const refund = expiryRefundView({
              status: voucher.status,
              coupon_price_agorot: voucher.coupon_price_agorot,
              credit: credits.get(voucher.id) ?? null,
            })
            return (
              <div className="account-row" key={voucher.id}>
                <div className="account-row__main">
                  {/*
                    A gift the recipient has not collected shows what it is
                    instead of a code. `getCustomerVouchers` blanks the code for
                    it, so the alternative is not "a code the buyer should not
                    have" but an empty line where one used to be.
                  */}
                  {voucher.gift ? (
                    <p className="account-row__title">{giftHeldCopy(voucher.gift).headline}</p>
                  ) : (
                    <p className="coupon-card__code" dir="ltr">
                      {formatCouponCode(voucher.code)}
                    </p>
                  )}
                  <p className="account-row__title">{voucher.product?.name_he ?? 'קופון'}</p>
                  <p className="account-row__meta">
                    <span className={`account-chip account-chip--${COUPON_TONE_CHIP[status.tone]}`}>
                      {voucher.gift ? giftHeldCopy(voucher.gift).badge : status.label}
                    </span>
                    {voucher.status === 'redeemed'
                      ? ` · מומש ב-${formatCouponDate(voucher.redeemed_at)}`
                      : ` · בתוקף עד ${formatCouponDate(voucher.expires_at)}`}
                    {voucher.supplier?.name ? ` · ${voucher.supplier.name}` : ''}
                  </p>
                  <p className="account-row__meta">
                    שולם באתר {formatAgorot(money.paidOnlineAgorot)}
                    {money.dueAtBusinessAgorot > 0
                      ? ` · לתשלום בבית העסק ${formatAgorot(money.dueAtBusinessAgorot)}`
                      : ''}
                  </p>
                  {status.presentable && status.expiringSoon && (
                    <p className="account-row__meta">
                      {status.daysLeft === 0
                        ? 'הקופון פג היום'
                        : `נותרו ${status.daysLeft} ימים לניצול הקופון`}
                    </p>
                  )}
                  {/*
                    One line, not the detail page's whole panel: this is a list.
                    It exists because the row above it says only `פג תוקף`, and
                    a customer scanning the list for what happened to their
                    money should not have to open each dead coupon to find out.
                  */}
                  {refund.state !== 'none' && (
                    <p className="account-row__meta" data-testid="coupon-row-refund">
                      {refund.headline}
                    </p>
                  )}
                </div>
                <div className="account-row__actions">
                  <Link className="account-btn" href={`/coupon/${voucher.id}`}>
                    {/*
                      Never "הצגת הקופון ו-QR" on a gift: there is no QR behind
                      that link for the buyer, and a button promising one is how
                      a customer decides the page is broken.
                    */}
                    {voucher.gift
                      ? 'פרטי המתנה'
                      : status.presentable
                        ? 'הצגת הקופון ו-QR'
                        : 'פרטי הקופון'}
                  </Link>
                </div>
              </div>
            )
          })
        )}
      </section>
    </>
  )
}
