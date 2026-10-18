import CancelOrderForm from '@/components/account/CancelOrderForm'
import { formatDate, formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  cancellationDeadline,
  customerCancellationGround,
  effectiveCancellationWindowDays,
} from '@/server/domain/orders/cancellation-window'
import { computeCancellationFee } from '@/server/domain/orders/refund'
import { getOrderDetail } from '@/server/queries/orders'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'ביטול הזמנה' }

type Props = { params: Promise<{ id: string }> }

/**
 * What a cancellation would come to, before the customer commits. The figures
 * are an estimate from the order total; the server recomputes them from the
 * card charge when the notice is filed, and that is what the confirmation and
 * the email show.
 */
export default async function CancelOrderPage({ params }: Props) {
  const { id } = await params
  const order = await getOrderDetail(id)
  if (!order) notFound()

  const productIds = [...new Set(order.lines.map((l) => l.productId).filter(Boolean))] as string[]
  let windowDays = effectiveCancellationWindowDays([])
  if (productIds.length > 0) {
    const { data, error } = await createAdminClient()
      .from('products')
      .select('cancellation_window_days')
      .in('id', productIds)
    if (!error) {
      windowDays = effectiveCancellationWindowDays(
        (data ?? []).map(
          (p) => (p as { cancellation_window_days?: number | null }).cancellation_window_days,
        ),
      )
    }
  }

  const paidAt = order.paidAt ? new Date(order.paidAt) : undefined
  const ground = customerCancellationGround(paidAt, new Date(), windowDays)
  const fee =
    ground === 'extended_window' ? agorot(0) : computeCancellationFee(order.totalAgorot, false)
  const refund = agorot(Math.max(0, order.totalAgorot - fee))
  const deadline = paidAt ? cancellationDeadline(paidAt, windowDays) : null
  const cancellable = order.status === 'paid'

  return (
    <>
      <h1 className="account-title">ביטול הזמנה</h1>
      <p className="account-subtitle">הזמנה מתאריך {formatDate(order.createdAt)}</p>

      <section className="account-card">
        <h2 className="account-card__title">תנאי הביטול</h2>
        <p>
          לפי חוק הגנת הצרכן, אפשר לבטל עסקה מרחוק בתוך 14 ימים מהרכישה. ההחזר הוא בניכוי דמי ביטול
          של 5% מהמחיר או 100 ש&quot;ח, הנמוך מביניהם, ומוחזר לאמצעי התשלום המקורי.
        </p>
        {windowDays > 14 && (
          <p className="mt-2">
            המוצרים בהזמנה הזו מאפשרים ביטול במשך {windowDays} ימים. ביטול אחרי היום ה-14 ועד סוף
            התקופה מזוכה במלואו, בלי דמי ביטול, לארנק שלך באתר.
          </p>
        )}
        {deadline && (
          <p className="account-row__meta mt-2">
            אפשר לבטל עד {formatDate(deadline.toISOString())}.
          </p>
        )}
      </section>

      <section className="account-card">
        <h2 className="account-card__title">הערכת ההחזר</h2>
        <div className="account-row">
          <div className="account-row__main">
            <p className="account-row__meta">סך ההזמנה</p>
          </div>
          <div className="account-row__actions">{formatIls(order.totalAgorot)}</div>
        </div>
        <div className="account-row">
          <div className="account-row__main">
            <p className="account-row__meta">דמי ביטול</p>
          </div>
          <div className="account-row__actions">{formatIls(fee)}</div>
        </div>
        <div className="account-row">
          <div className="account-row__main">
            <p className="account-row__title">
              {ground === 'extended_window' ? 'יזוכה לארנק' : 'יוחזר לאמצעי התשלום'}
            </p>
          </div>
          <div className="account-row__actions">
            <strong>{formatIls(refund)}</strong>
          </div>
        </div>
      </section>

      <section className="account-card">
        {cancellable ? (
          <CancelOrderForm orderId={order.id} />
        ) : (
          <p>אפשר לבטל רק הזמנה ששולמה. אם יש שאלה על ההזמנה, אפשר לפנות לשירות הלקוחות.</p>
        )}
      </section>

      <p>
        <Link className="account-btn" href={`/account/orders/${order.id}`}>
          חזרה להזמנה
        </Link>
      </p>
    </>
  )
}
