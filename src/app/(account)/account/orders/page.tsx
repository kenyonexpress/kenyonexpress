import OrderCard from '@/components/account/OrderCard'
import { readPaymentProviderGate } from '@/lib/payments/provider-gate'
import { getMyOrders } from '@/server/queries/orders'
import { getReorderOffer } from '@/server/queries/reorder'

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

      {orders.length === 0 ? (
        <section className="account-card">
          <p className="account-empty">עוד לא ביצעת הזמנות.</p>
        </section>
      ) : (
        <section className="order-list" aria-label="ההזמנות שלי">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              reorder={reorder}
              paymentGateOpen={paymentGate.live}
            />
          ))}
        </section>
      )}
    </>
  )
}
