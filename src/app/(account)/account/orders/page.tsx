import ReorderButton from '@/components/account/ReorderButton'
import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { readPaymentProviderGate } from '@/lib/payments/provider-gate'
import { getMyOrders } from '@/server/queries/orders'
import { getReorderOffer } from '@/server/queries/reorder'
import Link from 'next/link'

export const metadata = { title: 'ההזמנות שלי' }

export default async function OrdersPage() {
  const orders = await getMyOrders()
  // One read per page, not per row: the card and the cart are the customer's,
  // not the order's. Skipped entirely when there is no paid order to repeat.
  const reorder = orders.some((order) => order.paidAt) ? await getReorderOffer() : null
  const paymentGate = readPaymentProviderGate()

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
                  {formatIls(order.totalAgorot)}{' '}
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
                {reorder && order.paidAt && (
                  <ReorderButton
                    orderId={order.id}
                    card={reorder.card}
                    cartItemCount={reorder.cartItemCount}
                    paymentGateOpen={paymentGate.live}
                    variant="compact"
                  />
                )}
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
