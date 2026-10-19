import { OrderRowsListSkeleton } from '@/components/OrderRowSkeleton'
import OrderCard from '@/components/account/OrderCard'
import { getMyOrders } from '@/server/queries/orders'
import { Suspense } from 'react'

export const metadata = { title: 'ההזמנות שלי' }

async function OrdersList() {
  const orders = await getMyOrders()

  return (
    <>
      <h1 className="account-title">ההזמנות שלי</h1>
      <p className="account-subtitle">{orders.length} הזמנות</p>

      <section className="account-card">
        {orders.length === 0 ? (
          <p className="account-empty">עוד לא ביצעת הזמנות.</p>
        ) : (
          orders.map((order) => <OrderCard key={order.id} order={order} />)
        )}
      </section>
    </>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrderRowsListSkeleton count={5} />}>
      <OrdersList />
    </Suspense>
  )
}
