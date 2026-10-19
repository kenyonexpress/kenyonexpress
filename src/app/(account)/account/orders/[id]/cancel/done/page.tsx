import { formatDateTime, formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/commerce/money'
import { cancellationNoticeLines } from '@/lib/email/cancellation-requested'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'בקשת הביטול התקבלה' }

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const STATE_LABEL: Record<string, string> = {
  requested: 'בבדיקה',
  approved: 'אושרה',
  executing: 'בביצוע',
  completed: 'הושלמה',
  rejected: 'נדחתה',
  failed: 'נכשלה',
}

/**
 * The confirmation after the cancel button. Read on the customer's own
 * session: `refunds` RLS lets a customer see their own notices and nothing
 * else, so a foreign refund id is a 404.
 */
export default async function CancelDonePage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = await searchParams
  const refundId = typeof sp.r === 'string' ? sp.r : null
  if (!refundId) notFound()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('refunds')
    .select(
      'id, order_id, state, destination, requested_at, requested_agorot, cancellation_fee_agorot',
    )
    .eq('id', refundId)
    .eq('order_id', id)
    .maybeSingle()
  if (error || !data) notFound()

  const row = data as {
    id: string
    state: string
    destination: 'original_method' | 'wallet'
    requested_at: string
    requested_agorot: number
    cancellation_fee_agorot: number
  }
  const lines = cancellationNoticeLines({
    refundId: row.id,
    orderRef: id,
    requestedAtIso: row.requested_at,
    requestedAgorot: Number(row.requested_agorot),
    cancellationFeeAgorot: Number(row.cancellation_fee_agorot),
    destination: row.destination,
    autoApproved: row.state === 'approved',
  })

  return (
    <>
      <h1 className="account-title">בקשת הביטול התקבלה</h1>
      <p className="account-subtitle">
        סטטוס: {STATE_LABEL[row.state] ?? row.state}. נשלח עותק למייל שלך.
      </p>
      <section className="account-card">
        {lines.map((line) => (
          <p key={line} className="mt-2">
            {line}
          </p>
        ))}
        <div className="account-row mt-4">
          <div className="account-row__main">
            <p className="account-row__meta">נרשמה בתאריך {formatDateTime(row.requested_at)}</p>
          </div>
          <div className="account-row__actions">
            <strong>
              {formatIls(
                agorot(
                  Math.max(0, Number(row.requested_agorot) - Number(row.cancellation_fee_agorot)),
                ),
              )}
            </strong>
          </div>
        </div>
      </section>
      <p>
        <Link className="account-btn" href="/account/orders">
          להזמנות שלי
        </Link>
      </p>
    </>
  )
}
