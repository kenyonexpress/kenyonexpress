import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { shekels } from '@/lib/money-format'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const metadata = { title: 'החזרים וביטולים' }

// Read-only queue over public.refunds. The cancel/refund action itself lives
// on the order page (OrderAdminActions), so each row links there.

const STATE_HE: Record<string, string> = {
  requested: 'התקבלה בקשה',
  approved: 'אושר',
  rejected: 'נדחה',
  executing: 'בביצוע',
  completed: 'הושלם',
  failed: 'נכשל',
}

export default async function RefundsPage() {
  const { role } = await requireSection('orders')
  const showMoney = canSeeMoney(role)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('refunds')
    .select(
      'id, order_id, state, requested_agorot, granted_agorot, cancellation_fee_agorot, refund_due_by, requested_at',
    )
    .order('requested_at', { ascending: false })
    .limit(200)
  if (error) throw new Error(`admin refunds: ${error.message}`)
  const rows = data ?? []
  const now = Date.now()

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-heading">החזרים וביטולים</h1>
      <p className="text-sm text-black/60">
        קופון: עד 14 ימים מהרכישה, בניכוי 5% (עד 100 ש&quot;ח). אחרי 14 ימים או אחרי מימוש אין החזר.
        מוצר פיזי: לפי מדיניות המוצר, ברירת מחדל 100%.
      </p>
      <section className="rounded-xl border border-black/10 bg-white">
        <ul className="divide-y divide-black/5 text-sm">
          {rows.length === 0 && <li className="px-5 py-4 text-black/50">אין החזרים</li>}
          {rows.map((r) => {
            const late =
              (r.state === 'requested' || r.state === 'approved' || r.state === 'executing') &&
              new Date(r.refund_due_by).getTime() < now
            return (
              <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <Link className="underline" href={`/admin/orders/${r.order_id}`}>
                  הזמנה {r.order_id.slice(0, 8)}
                </Link>
                <span>{STATE_HE[r.state] ?? r.state}</span>
                {showMoney && (
                  <span>
                    {shekels(r.granted_agorot ?? r.requested_agorot)}
                    {r.cancellation_fee_agorot > 0 &&
                      ` (דמי ביטול ${shekels(r.cancellation_fee_agorot)})`}
                  </span>
                )}
                <span className={late ? 'font-semibold text-red-600' : 'text-black/50'}>
                  {late ? 'חריגה מהמועד' : new Date(r.refund_due_by).toLocaleDateString('he-IL')}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
