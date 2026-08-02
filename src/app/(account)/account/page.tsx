import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { getWalletSummary } from '@/server/queries/account'
import { getMyOrders } from '@/server/queries/orders'
import { getCustomerVouchers, isVoucherRedeemable } from '@/server/queries/vouchers'
import Link from 'next/link'

export const metadata = { title: 'האזור האישי' }

export default async function AccountOverviewPage() {
  const [wallet, orders, vouchers] = await Promise.all([
    getWalletSummary(),
    getMyOrders(),
    getCustomerVouchers(),
  ])

  const lastOrder = orders[0] ?? null
  const activeCoupons = vouchers.filter((v) => isVoucherRedeemable(v))

  return (
    <>
      <h1 className="account-title">סקירה</h1>
      <p className="account-subtitle">סקירה מהירה של החשבון שלך</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">יתרת הארנק</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">
          הארנק משמש לתשלום חלקי או מלא באתר. אין משיכה למזומן ואין העברה למשתמש אחר.
        </p>
      </div>

      <div className="account-grid">
        <section className="account-card">
          <h2 className="account-card__title">ההזמנה האחרונה</h2>
          {lastOrder ? (
            <>
              <p className="account-row__title">
                {formatIls(lastOrder.totalAgorot)}{' '}
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
