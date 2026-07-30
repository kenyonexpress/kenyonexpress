import {
  COUPON_TONE_CLASS,
  couponMoneyView,
  couponStatusView,
  formatAgorot,
  formatCouponCode,
  formatCouponDate,
} from '@/lib/vouchers/coupon-view'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import Link from 'next/link'

/**
 * The list. Presenting a coupon happens on /coupon/[id], which is why there is
 * no QR here any more: rendering one per row put every live voucher's QR on a
 * single screen, made the page as heavy as the number of coupons owned, and
 * still left the customer holding a phone at a counter scrolling to the right
 * card. One row, one link, one screen to hold up.
 *
 * Status and dates come from the shared presenter, so this page and the counter
 * cannot disagree about whether a coupon is usable. In particular the deadline
 * shown is expires_at, not offer_valid_until: the two differ whenever the
 * rolling per-product window closes first, and this list used to show the later
 * of the two.
 */

export const metadata = { title: 'השוברים שלי' }

export default async function AccountVouchersPage() {
  const vouchers = await getCustomerVouchers()

  return (
    <section dir="rtl" className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900">השוברים שלי 🎟</h1>

      {vouchers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
          <p className="mb-2 text-3xl">🎟</p>
          <p>אין לך שוברים עדיין</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {vouchers.map((v) => {
            const status = couponStatusView(v)
            const money = couponMoneyView(v)
            return (
              <li
                key={v.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                  <div>
                    <p className="font-bold text-gray-900">{v.product?.name_he ?? 'שובר'}</p>
                    {v.supplier?.name && <p className="text-xs text-gray-500">{v.supplier.name}</p>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${COUPON_TONE_CLASS[status.tone]}`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="px-5 py-4">
                  <p
                    dir="ltr"
                    className="font-mono text-xl font-bold tracking-widest text-gray-900"
                  >
                    {formatCouponCode(v.code)}
                  </p>

                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">שולם באתר</dt>
                      <dd className="font-medium text-gray-900">
                        {formatAgorot(money.paidOnlineAgorot)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">לתשלום בבית העסק</dt>
                      <dd className="font-bold text-gray-900">
                        {formatAgorot(money.dueAtBusinessAgorot)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                      <dt className="text-gray-500">
                        {v.status === 'redeemed' ? 'מומש ב' : 'בתוקף עד'}
                      </dt>
                      <dd className="font-medium text-gray-900">
                        {formatCouponDate(v.status === 'redeemed' ? v.redeemed_at : v.expires_at)}
                      </dd>
                    </div>
                  </dl>

                  <Link
                    href={`/coupon/${v.id}`}
                    className={`mt-4 block rounded-xl py-3 text-center text-sm font-bold ${
                      status.presentable
                        ? 'bg-gray-900 text-white'
                        : 'border border-gray-300 text-gray-600'
                    }`}
                  >
                    {status.presentable ? 'הצג קופון ו-QR' : 'פרטי הקופון'}
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
