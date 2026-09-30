import ReorderButton from '@/components/account/ReorderButton'
import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { readPaymentProviderGate } from '@/lib/payments/provider-gate'
import { resolveCarrier } from '@/lib/shipping/carriers'
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
                  {/* The parcel's own chip, next to the money's. A paid
                      order still on its way reads "paid · shipped", which
                      is the question the list is opened to answer. */}
                  {order.paidAt && order.shipping.label && (
                    <>
                      {' '}
                      <span className={`account-chip account-chip--${order.shipping.tone}`}>
                        {order.shipping.label}
                      </span>
                    </>
                  )}
                </p>
                <p className="account-row__meta">
                  {formatDate(order.createdAt)} · {order.itemCount} פריטים
                  {order.hasVouchers ? ' · כולל קופונים' : ''}
                </p>
                {order.paidAt &&
                  order.shipping.tracked.length > 0 &&
                  (() => {
                    // One tracking line per order row: the first parcel's
                    // number and a link when the carrier is known. More than
                    // one parcel is the detail page's job.
                    const first = order.shipping.tracked[0]
                    if (!first) return null
                    const carrier = resolveCarrier(first.carrier, first.trackingNumber)
                    const more = order.shipping.tracked.length - 1
                    return (
                      <p className="account-row__meta">
                        {'מספר מעקב: '}
                        {carrier?.url ? (
                          <a dir="ltr" href={carrier.url} target="_blank" rel="noopener noreferrer">
                            {first.trackingNumber}
                          </a>
                        ) : (
                          <span dir="ltr">{first.trackingNumber}</span>
                        )}
                        {carrier ? ` · ${carrier.label}` : ''}
                        {more > 0 ? ` · ועוד ${more}` : ''}
                      </p>
                    )
                  })()}
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
