import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { getMyOrders } from '@/server/queries/orders'
import Link from 'next/link'

export const metadata = { title: 'ההזמנות שלי' }

export default async function OrdersPage() {
  const orders = await getMyOrders()

  return (
    <>
      <h1 className="account-title">ההזמנות שלי</h1>
      <p className="account-subtitle">{orders.length} הזמנות</p>

      <section className="account-card">
        {orders.length === 0 ? (
          <p className="account-empty">עוד לא ביצעת הזמנות.</p>
        ) : (
          orders.map((order) => (
            <div className="account-row" key={order.id}>
              <div className="account-row__main">
                <p className="account-row__title">
                  {formatIls(order.totalIls)}{' '}
                  <span
                    className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}
                  >
                    {orderStatusLabel(order.settlementStatus)}
                  </span>
                </p>
                <p className="account-row__meta">
                  {formatDate(order.createdAt)} · {order.itemCount} פריטים
                  {order.hasVouchers ? ' · כולל קופונים' : ''}
                </p>
              </div>
              <div className="account-row__actions">
                <Link className="account-btn" href={`/account/orders/${order.id}`}>
                  פרטים
                </Link>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  )
}
