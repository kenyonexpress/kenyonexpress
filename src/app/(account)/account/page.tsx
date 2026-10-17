import { formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { formatDate } from '@/lib/account/format'
import {
  addressLine,
  cardLabel,
  expiryLabel,
  summarizeAddresses,
  summarizePaymentMethods,
  summarizePreferences,
} from '@/lib/account/overview'
import { isCouponPresentable } from '@/lib/vouchers/coupon-view'
import { getMyAddresses, getMyPaymentTokens, getWalletSummary } from '@/server/queries/account'
import { getCashbackTracker } from '@/server/queries/cashback'
import { getMyLoyalty } from '@/server/queries/loyalty'
import { loadPreferences } from '@/server/queries/notifications'
import { getMyOrders } from '@/server/queries/orders'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import Link from 'next/link'

export const metadata = { title: 'האזור האישי' }

/**
 * The overview: one tile per thing the account holds, each a sentence and a
 * link, all read through RLS on the session in one Promise.all.
 *
 * The lower grid (addresses, saved cards, notifications, privacy) is what was
 * missing: a customer landing here had no way to see that a saved card had
 * expired or that an address was set as default without opening each page.
 * The card tile shows brand and last four only; the query it reads never
 * selects the Cardcom token (src/lib/account/saved-cards.test.ts).
 */
export default async function AccountOverviewPage() {
  const [wallet, orders, coupons, cashback, loyalty, addresses, tokens, preferences] =
    await Promise.all([
      getWalletSummary(),
      getMyOrders(),
      getCustomerVouchers(),
      getCashbackTracker(),
      getMyLoyalty(),
      getMyAddresses(),
      getMyPaymentTokens(),
      loadPreferences(),
    ])

  const activeCoupons = coupons.filter((c) => isCouponPresentable(c))
  const addressesSummary = summarizeAddresses(addresses)
  const paymentsSummary = summarizePaymentMethods(tokens)
  const preferencesSummary = summarizePreferences(preferences)

  return (
    <>
      <h1 className="account-title">לוח בקרה</h1>
      <p className="account-subtitle">סקירה מהירה של החשבון שלך</p>

      <div className="dashboard-stats">
        <Link href="/account/wallet" className="stat-tile">
          <p className="stat-label">יתרת הארנק</p>
          <p className="stat-value">{formatIls(wallet.balanceAgorot)}</p>
          <p className="stat-meta">קרדיט בחשבון</p>
        </Link>

        <Link href="/account/cashback" className="stat-tile">
          <p className="stat-label">קאשבק זמין</p>
          <p className="stat-value">{formatIls(cashback.overview.liveAgorot)}</p>
          <p className="stat-meta">ניתן להשתמש בקנייות</p>
        </Link>

        <div className="stat-tile">
          <p className="stat-label">קופונים פעילים</p>
          <p className="stat-value">{activeCoupons.length}</p>
          <p className="stat-meta">מוכנים לסריקה</p>
        </div>

        <div className="stat-tile">
          <p className="stat-label">תוכנית חברים</p>
          <p className="stat-value">{loyalty?.tier || 'בסיסי'}</p>
          <p className="stat-meta">דרגתך הנוכחית</p>
        </div>
      </div>

      <section className="account-card">
        <h2 className="account-card__title">הזמנות אחרונות</h2>
        {orders.length > 0 ? (
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>מספר הזמנה</th>
                  <th>תאריך</th>
                  <th>סכום</th>
                  <th>סטטוס</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td className="order-id">#{order.id.slice(-8)}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td className="order-total">{formatIls(order.totalAgorot)}</td>
                    <td>
                      <span
                        className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}
                      >
                        {orderStatusLabel(order.settlementStatus)}
                      </span>
                    </td>
                    <td className="order-action">
                      <Link href={`/account/orders/${order.id}`} className="account-btn">
                        פרטים
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="account-row__meta">עוד לא ביצעת הזמנות.</p>
        )}
        {orders.length > 5 && (
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/orders">
              לכל ההזמנות
            </Link>
          </p>
        )}
      </section>

      {activeCoupons.length > 0 && (
        <section className="account-card">
          <h2 className="account-card__title">קופונים פעילים</h2>
          <div className="coupons-grid">
            {activeCoupons.slice(0, 6).map((coupon) => (
              <div key={coupon.id} className="coupon-card">
                <div className="coupon-header">
                  <p className="coupon-title">{coupon.product?.name_he || 'קופון'}</p>
                </div>
                <div className="coupon-body">
                  <p className="coupon-discount">₪{(coupon.face_value_agorot / 100).toFixed(0)}</p>
                  <p className="coupon-code">{coupon.code}</p>
                </div>
              </div>
            ))}
          </div>
          {activeCoupons.length > 6 && (
            <p style={{ marginTop: 12 }}>
              <Link className="account-btn" href="/account/coupons">
                לכל הקופונים
              </Link>
            </p>
          )}
        </section>
      )}

      <div className="account-grid">
        {paymentsSummary.count > 0 && (
          <section className="account-card">
            <h2 className="account-card__title">אמצעי תשלום</h2>
            {paymentsSummary.primary && (
              <>
                <p className="account-row__meta">{cardLabel(paymentsSummary.primary)}</p>
                {paymentsSummary.primary.expiryMonth && paymentsSummary.primary.expiryYear && (
                  <p className="account-row__meta">
                    {expiryLabel(
                      paymentsSummary.primary.expiryMonth,
                      paymentsSummary.primary.expiryYear,
                    )}
                  </p>
                )}
                {paymentsSummary.primaryExpired && (
                  <p className="account-row__meta" style={{ color: '#d32f2f' }}>
                    פג תוקף
                  </p>
                )}
              </>
            )}
            {paymentsSummary.live < paymentsSummary.count && (
              <p className="account-row__meta">
                {paymentsSummary.count - paymentsSummary.live} כרטיסים פגי תוקף
              </p>
            )}
            <p style={{ marginTop: 12 }}>
              <Link className="account-btn" href="/account/tokens">
                לאמצעי התשלום
              </Link>
            </p>
          </section>
        )}

        {addressesSummary.count > 0 && (
          <section className="account-card">
            <h2 className="account-card__title">כתובות משלוח</h2>
            {addressesSummary.primary && (
              <p className="account-row__meta">{addressLine(addressesSummary.primary)}</p>
            )}
            {addressesSummary.count > 1 && (
              <p className="account-row__meta">{addressesSummary.count} כתובות</p>
            )}
            <p style={{ marginTop: 12 }}>
              <Link className="account-btn" href="/account/addresses">
                לכתובות המשלוח
              </Link>
            </p>
          </section>
        )}

        <section className="account-card">
          <h2 className="account-card__title">התראות</h2>
          <p className="account-row__meta">
            {preferencesSummary.off === 0
              ? 'כל ההתראות פועלות'
              : preferencesSummary.off === 1
                ? 'התראה אחת כבויה'
                : `${preferencesSummary.off} התראות כבויות`}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/notifications">
              להעדפות ההתראות
            </Link>
          </p>
        </section>

        <section className="account-card">
          <h2 className="account-card__title">פרטיות ונתונים</h2>
          <p className="account-row__meta">
            הורדת כל המידע שנשמר עליכם, ניהול ההסכמה לעוגיות, ומחיקת החשבון לצמיתות.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/privacy">
              לפרטיות ומחיקת החשבון
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
