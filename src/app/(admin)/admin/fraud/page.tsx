import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChargebackForm, ClearFlagButton, ReviewDecisionButtons } from './FraudActions'

export const metadata = { title: 'בקרת הונאות' }

/**
 * The human half of the checkout fraud rail: what the velocity and
 * coupon-stacking detectors queued, and which customers are currently blocked
 * by a live chargeback or manual flag.
 *
 * READ WITH THE ADMIN CLIENT, deliberately, same as the queues page: both
 * tables have RLS on with zero policies, because who we suspect and why must
 * not leak to anyone who signs up. `requireSection('payments')` is the gate.
 *
 * A missing table (migration 226 not applied) renders an empty section rather
 * than a 500.
 */

const LIMIT = 50

const KIND_LABEL: Record<string, string> = {
  velocity: 'קצב הזמנות חריג',
  'coupon-stacking': 'שילוב קופון חשוד',
  'chargeback-blocked': 'ניסיון תשלום של לקוח חסום',
  manual: 'ידני',
  chargeback: 'chargeback',
}

function whenText(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type QueueRow = {
  id: string
  user_id: string
  order_id: string | null
  kind: string
  details: Record<string, unknown> | null
  created_at: string | null
}

type FlagRow = {
  id: string
  user_id: string
  order_id: string | null
  kind: string
  reason: string
  created_at: string | null
}

export default async function AdminFraudPage() {
  await requireSection('payments')
  const admin = createAdminClient()

  const [queueResult, flagsResult] = await Promise.all([
    admin
      .from('fraud_review_queue' as never)
      .select('id, user_id, order_id, kind, details, created_at')
      .eq('status' as never, 'pending' as never)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    admin
      .from('fraud_flags' as never)
      .select('id, user_id, order_id, kind, reason, created_at')
      .is('cleared_at' as never, null)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ])

  const queue = (queueResult.data ?? []) as unknown as QueueRow[]
  const flags = (flagsResult.data ?? []) as unknown as FlagRow[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">בקרת הונאות</h1>
        <p className="mt-1 text-sm text-gray-500">
          {queue.length === 0
            ? 'אין פריטים הממתינים לבדיקה.'
            : `${queue.length} פריטים ממתינים להחלטה.`}
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">
          תור בדיקה
          <span className="me-2 text-sm font-normal text-gray-500">({queue.length})</span>
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-500">
          חסימה יוצרת דגל שחוסם את הלקוח מתשלום עד שמישהו מנקה אותו. אישור סוגר את הפריט בלבד.
        </p>

        {queue.length === 0 ? (
          <p className="text-sm text-gray-400">ריק.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {queue.map((row) => (
              <li key={row.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{KIND_LABEL[row.kind] ?? row.kind}</p>
                  <p className="mt-0.5 text-xs text-gray-500" dir="ltr">
                    לקוח {row.user_id.slice(0, 8)}
                    {row.order_id ? ` · הזמנה ${row.order_id.slice(0, 8)}` : ''}
                  </p>
                  {row.details && Object.keys(row.details).length > 0 && (
                    <p className="mt-0.5 truncate text-xs text-gray-400" dir="ltr">
                      {JSON.stringify(row.details)}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-gray-400">{whenText(row.created_at)}</p>
                </div>
                <ReviewDecisionButtons itemId={row.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">
          דגלים פעילים
          <span className="me-2 text-sm font-normal text-gray-500">({flags.length})</span>
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-500">
          לקוח עם דגל chargeback או דגל ידני פעיל לא יכול להתחיל תשלום חדש.
        </p>

        {flags.length === 0 ? (
          <p className="text-sm text-gray-400">אין דגלים פעילים.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {flags.map((flag) => (
              <li key={flag.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{KIND_LABEL[flag.kind] ?? flag.kind}</p>
                  <p className="mt-0.5 text-xs text-gray-500" dir="ltr">
                    לקוח {flag.user_id.slice(0, 8)}
                    {flag.order_id ? ` · הזמנה ${flag.order_id.slice(0, 8)}` : ''}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{flag.reason}</p>
                  <p className="mt-0.5 text-xs text-gray-400">{whenText(flag.created_at)}</p>
                </div>
                <ClearFlagButton flagId={flag.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold">סימון chargeback</h2>
        <p className="mt-1 mb-4 text-sm text-gray-500">
          הזינו מזהה הזמנה שחזר מהסולק. הלקוח ייחסם מתשלומים חדשים עד ניקוי הדגל.
        </p>
        <ChargebackForm />
      </section>
    </div>
  )
}
