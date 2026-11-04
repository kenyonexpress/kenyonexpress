import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { t } from '@/lib/i18n/messages'
import { getMyOrders } from '@/server/queries/orders'
import Link from 'next/link'

export const metadata = { title: 'ההזמנות שלי' }

/**
 * V05: WooCommerce's `woocommerce-orders-table`, which Electro styles as a
 * `shop_table`: order, date, status, total and a view button per row. Below
 * 768 account-electro.css turns each row into a card whose cells print their
 * column name from `data-title`, so the table never scrolls sideways.
 */
export default async function OrdersPage() {
  const orders = await getMyOrders()

  const col = {
    order: t('account.ordersPage.colOrder'),
    date: t('account.ordersPage.colDate'),
    status: t('account.ordersPage.colStatus'),
    total: t('account.ordersPage.colTotal'),
    actions: t('account.ordersPage.colActions'),
  }

  return (
    <>
      <h1 className="account-title">{t('account.orders')}</h1>
      <p className="account-subtitle">
        {t('account.ordersPage.count').replace('{count}', String(orders.length))}
      </p>

      {orders.length === 0 ? (
        <section className="account-card">
          <p className="account-empty">{t('account.ordersPage.empty')}</p>
          <p className="text-center">
            <Link className="account-btn account-btn--primary" href="/">
              {t('account.ordersPage.browse')}
            </Link>
          </p>
        </section>
      ) : (
        <table className="account-table" data-testid="orders-table">
          <thead>
            <tr>
              <th scope="col">{col.order}</th>
              <th scope="col">{col.date}</th>
              <th scope="col">{col.status}</th>
              <th scope="col">{col.total}</th>
              <th scope="col" className="account-table__actions">
                {col.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td data-title={col.order}>
                  <Link href={`/account/orders/${order.id}`} dir="ltr">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </Link>
                </td>
                <td data-title={col.date}>
                  <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
                </td>
                <td data-title={col.status}>
                  <span
                    className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}
                  >
                    {orderStatusLabel(order.settlementStatus)}
                  </span>
                </td>
                <td data-title={col.total}>
                  <span>
                    {t('account.ordersPage.totalFor')
                      .replace('{total}', formatIls(order.totalAgorot))
                      .replace('{count}', String(order.itemCount))}
                    {order.hasVouchers ? ` · ${t('account.ordersPage.withCoupons')}` : ''}
                  </span>
                </td>
                <td className="account-table__actions">
                  <Link
                    className="account-btn account-btn--primary"
                    href={`/account/orders/${order.id}`}
                  >
                    {t('account.ordersPage.view')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
