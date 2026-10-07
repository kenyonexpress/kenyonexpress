import ReturnRequestForm from '@/components/account/ReturnRequestForm'
import ReturnStatus from '@/components/account/ReturnStatus'
import { formatDate, formatIls } from '@/lib/account/format'
import { evaluateReturnEligibility } from '@/lib/returns/policy'
import { getOrderDetail } from '@/server/queries/orders'
import { OPEN_RETURN_STATES, getMyReturnForOrder } from '@/server/queries/returns'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'בקשת החזרה' }

type Props = { params: Promise<{ orderId: string }> }

/**
 * /account/return/[orderId] (STEP 44): the form when the order is inside
 * its window, the status when a request already exists, the refusal in
 * words otherwise. The same `evaluateReturnEligibility` the action runs, so
 * what the page offers and what the server accepts are one decision.
 */
export default async function ReturnOrderPage({ params }: Props) {
  const { orderId } = await params
  const order = await getOrderDetail(orderId)
  if (!order) notFound()

  const existing = await getMyReturnForOrder(order.id)
  const open = existing !== null && OPEN_RETURN_STATES.includes(existing.state)
  const eligibility = evaluateReturnEligibility({
    status: order.status,
    paidAt: order.paidAt,
    lines: order.lines.map((line) => ({
      productType: line.productType,
      settlementStatus: line.settlementStatus,
      deliveredAt: line.deliveredAt,
      voucherStatuses: line.vouchers.map((v) => v.status),
    })),
    openRequest: open,
    now: new Date(),
  })

  return (
    <>
      <h1 className="account-title">בקשת החזרה</h1>
      <p className="account-subtitle">
        הזמנה מתאריך {formatDate(order.createdAt)} · {formatIls(order.totalAgorot)} ·{' '}
        <Link href={`/account/orders/${order.id}`}>לפרטי ההזמנה</Link>
      </p>

      {existing && (
        <section className="account-card">
          <h2 className="account-card__title">{open ? 'הבקשה הפתוחה' : 'הבקשה הקודמת'}</h2>
          <ReturnStatus request={existing} />
        </section>
      )}

      <section className="account-card">
        <h2 className="account-card__title">פריטים בהזמנה</h2>
        {order.lines.map((line) => (
          <div className="account-row" key={line.id}>
            <div className="account-row__main">
              <p className="account-row__title">{line.productName}</p>
              <p className="account-row__meta">
                {line.quantity} יחידות · {formatIls(line.totalAgorot)}
                {line.productType === 'physical' && line.deliveredAt
                  ? ` · נמסר ב-${formatDate(line.deliveredAt)}`
                  : ''}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="account-card">
        <h2 className="account-card__title">
          {eligibility.ok ? 'פרטי הבקשה' : 'לא ניתן לפתוח בקשה'}
        </h2>
        {eligibility.ok ? (
          <ReturnRequestForm
            orderId={order.id}
            requestedAgorot={order.totalAgorot}
            allowedDestinations={eligibility.allowedDestinations}
            hasPhysical={eligibility.hasPhysical}
            windowEndsLabel={eligibility.windowEndsAt ? formatDate(eligibility.windowEndsAt) : null}
          />
        ) : (
          <>
            <p className="account-empty">{eligibility.message}</p>
            <p>
              <Link className="account-btn" href="/contact">
                פנייה לשירות הלקוחות
              </Link>
            </p>
          </>
        )}
      </section>
    </>
  )
}
