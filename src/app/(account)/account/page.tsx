import { formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { formatDate } from '@/lib/account/format'
import { isCouponPresentable } from '@/lib/vouchers/coupon-view'
import { getWalletSummary } from '@/server/queries/account'
import { getMyOrders } from '@/server/queries/orders'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import Link from 'next/link'

export const metadata = { title: 'האזור האישי' }

export default async function AccountOverviewPage() {
  const [wallet, orders, coupons] = await Promise.all([
    getWalletSummary(),
    getMyOrders(),
    getCustomerVouchers(),
  ])

  const lastOrder = orders[0] ?? null
  // Counted through the shared presenter, so this tile, the list and the counter
  // agree. The condition here used to accept a status of `active`, which is not
  // in the voucher_status enum at all: it was left over from coupon_codes and
  // could only ever be false.
  const activeCoupons = coupons.filter((c) => isCouponPresentable(c))

  return (
    <>
      <h1 className="account-title">האזור האישי</h1>
      <p className="account-subtitle">סקירה מהירה של החשבון שלך</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">יתרת הארנק</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceIls)}</p>
        <p className="wallet-balance__note">קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.</p>
      </div>

      <div className="account-grid">
        <section className="account-card">
          <h2 className="account-card__title">ההזמנה האחרונה</h2>
          {lastOrder ? (
            <>
              <p className="account-row__title">
                {formatIls(lastOrder.totalIls)}{' '}
                <span
                  className={`account-chip account-chip--${orderStatusTone(lastOrder.settlementStatus)}`}
                >
                  {orderStatusLabel(lastOrder.settlementStatus)}
                </span>
              </p>
              <p className="account-row__meta">
                {formatDate(lastOrder.createdAt)} · {lastOrder.itemCount} פריטים
              </p>
              <p style={{ marginTop: 12 }}>
                <Link className="account-btn" href={`/account/orders/${lastOrder.id}`}>
                  לפרטי ההזמנה
                </Link>
              </p>
            </>
          ) : (
            <p className="account-row__meta">עוד לא ביצעת הזמנות.</p>
          )}
        </section>

        <section className="account-card">
          <h2 className="account-card__title">קופונים פעילים</h2>
          <p className="account-row__title">{activeCoupons.length}</p>
          <p className="account-row__meta">
            {activeCoupons.length > 0
              ? 'מוכנים לסריקה בבית העסק'
              : 'אין כרגע קופונים שממתינים למימוש'}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/coupons">
              לכל הקופונים
            </Link>
          </p>
        </section>

        <section className="account-card">
          <h2 className="account-card__title">סך ההזמנות</h2>
          <p className="account-row__title">{orders.length}</p>
          <p className="account-row__meta">היסטוריית הרכישות שלך</p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/orders">
              לכל ההזמנות
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
