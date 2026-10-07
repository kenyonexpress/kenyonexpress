import ReturnStatus from '@/components/account/ReturnStatus'
import { formatDate, formatIls } from '@/lib/account/format'
import { RETURN_WINDOW_DAYS } from '@/lib/returns/policy'
import { getMyOrders } from '@/server/queries/orders'
import { OPEN_RETURN_STATES, getMyReturnRequests } from '@/server/queries/returns'
import Link from 'next/link'

export const metadata = { title: 'החזרות וביטולים' }

/**
 * /account/return (STEP 44): every request the customer has made, with its
 * status, and the paid orders a new request can be opened on. The window
 * check itself runs on the order's page, which has the lines; this list only
 * excludes orders that already have an open request or are refunded.
 */
export default async function ReturnsPage() {
  const [requests, orders] = await Promise.all([getMyReturnRequests(), getMyOrders()])
  const withRequest = new Set(
    requests.filter((r) => OPEN_RETURN_STATES.includes(r.state)).map((r) => r.orderId),
  )
  const candidates = orders.filter(
    (order) => order.paidAt && order.status !== 'refunded' && !withRequest.has(order.id),
  )

  return (
    <>
      <h1 className="account-title">החזרות וביטולים</h1>
      <p className="account-subtitle">
        ביטול עסקה בתוך {RETURN_WINDOW_DAYS} יום, החזר לכרטיס או זיכוי לארנק, ומעקב אחרי כל בקשה.{' '}
        <Link href="/refund_returns">למדיניות המלאה</Link>
      </p>

      <section className="account-card">
        <h2 className="account-card__title">הבקשות שלי</h2>
        {requests.length === 0 ? (
          <p className="account-empty">עוד לא שלחת בקשת החזרה.</p>
        ) : (
          requests.map((request) => (
            <div className="account-row" key={request.id}>
              <div className="account-row__main">
                <ReturnStatus request={request} />
              </div>
              <div className="account-row__actions">
                <Link className="account-btn" href={`/account/orders/${request.orderId}`}>
                  להזמנה
                </Link>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="account-card">
        <h2 className="account-card__title">פתיחת בקשה חדשה</h2>
        {candidates.length === 0 ? (
          <p className="account-empty">אין הזמנות ששולמו שאפשר לפתוח עליהן בקשה כרגע.</p>
        ) : (
          candidates.map((order) => (
            <div className="account-row" key={order.id}>
              <div className="account-row__main">
                <p className="account-row__title">{formatIls(order.totalAgorot)}</p>
                <p className="account-row__meta">
                  {formatDate(order.createdAt)} · {order.itemCount} פריטים
                  {order.hasVouchers ? ' · כולל קופונים' : ''}
                </p>
              </div>
              <div className="account-row__actions">
                <Link className="account-btn" href={`/account/return/${order.id}`}>
                  בקשת החזרה
                </Link>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  )
}
