import {
  COUPON_TONE_CHIP,
  couponMoneyView,
  couponStatusView,
  formatAgorot,
  formatCouponCode,
  formatCouponDate,
} from '@/lib/vouchers/coupon-view'
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

  return (
    <>
      <h1 className="account-title">הקופונים שלי</h1>
      <p className="account-subtitle">הצגת הקוד או ה-QR בבית העסק. היתרה משולמת שם בזמן הסריקה.</p>

      <nav className="account-tabs" aria-label="סינון קופונים">
        {TABS.map((t) => {
          const count = grouped[t.id].length
          const href = t.id === 'active' ? '/account/coupons' : `/account/coupons?tab=${t.id}`
          return (
            <Link
              key={t.id}
              href={href}
              className={`account-tabs__link${tab === t.id ? ' is-active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
              <span className="account-tabs__count">{count}</span>
            </Link>
          )
        })}
      </nav>

      <section className="account-card">
        {vouchers.length === 0 ? (
          <p className="account-empty">עדיין לא רכשת קופונים.</p>
        ) : (
          vouchers.map((voucher) => {
            const status = couponStatusView(voucher)
            const money = couponMoneyView(voucher)
            return (
              <div className="account-row" key={voucher.id}>
                <div className="account-row__main">
                  <p className="coupon-card__code" dir="ltr">
                    {formatCouponCode(voucher.code)}
                  </p>
                  <p className="account-row__title">{voucher.product?.name_he ?? 'קופון'}</p>
                  <p className="account-row__meta">
                    <span className={`account-chip account-chip--${COUPON_TONE_CHIP[status.tone]}`}>
                      {status.label}
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
                </div>
                <div className="account-row__actions">
                  <Link className="account-btn" href={`/coupon/${voucher.id}`}>
                    {status.presentable ? 'הצגת הקופון ו-QR' : 'פרטי הקופון'}
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
