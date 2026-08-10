import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import RetryButton from './RetryButton'

export const metadata = { title: 'תורים תקועים' }

/**
 * Everything that gave up, in one place.
 *
 * THREE QUEUES ON ONE SCREEN BECAUSE THEY FAIL FOR THE SAME REASONS - a
 * provider outage, a missing key, a malformed row - and each of them parks a
 * row after five attempts that nothing surfaces. Three separate pages would be
 * three places to forget, and a queue nobody looks at is a queue that does not
 * exist.
 *
 * READ WITH THE ADMIN CLIENT, deliberately. These tables have no staff-read RLS
 * policy: a queue an authenticated user could read is a queue whose contents -
 * customer emails, order references, invoice numbers - leak to anyone who signs
 * up. `requireSection` above is the gate.
 *
 * A missing table renders an empty section rather than a 500, the same rule the
 * invoice queue applies to a database without 107.
 */

const LIMIT = 50

type DeadRow = {
  id: string
  label: string
  detail: string | null
  attempts: number
  when: string | null
}

function whenText(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AdminQueuesPage() {
  await requireSection('analytics')
  const admin = createAdminClient()

  const [notifications, invoices, searchIndex] = await Promise.all([
    admin
      .from('notification_outbox')
      .select('id, kind, recipient_email, last_error, attempts, created_at')
      .eq('status', 'dead')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    admin
      .from('invoices')
      .select('id, order_id, document_type, last_error, attempts, created_at')
      .eq('status', 'dead')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    admin
      .from('search_index_dlq')
      .select('id, product_id, last_error, attempts, created_at')
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ])

  const sections: { queue: string; title: string; note: string; rows: DeadRow[] }[] = [
    {
      queue: 'notifications',
      title: 'התראות שלא נשלחו',
      note: 'מיילים ו-push שנכשלו חמש פעמים. לקוח שקנה ולא קיבל אישור נמצא כאן.',
      rows: ((notifications.data ?? []) as unknown as Record<string, string | number | null>[]).map(
        (row) => ({
          id: String(row.id),
          label: `${row.kind} → ${row.recipient_email}`,
          detail: (row.last_error as string) ?? null,
          attempts: Number(row.attempts ?? 0),
          when: (row.created_at as string) ?? null,
        }),
      ),
    },
    {
      queue: 'invoices',
      title: 'מסמכים שלא הונפקו',
      note: 'חובה חוקית: נלקח כסף והקבלה לא קיימת.',
      rows: ((invoices.data ?? []) as unknown as Record<string, string | number | null>[]).map(
        (row) => ({
          id: String(row.id),
          label: `${row.document_type} · הזמנה ${String(row.order_id).slice(0, 8).toUpperCase()}`,
          detail: (row.last_error as string) ?? null,
          attempts: Number(row.attempts ?? 0),
          when: (row.created_at as string) ?? null,
        }),
      ),
    },
    {
      queue: 'search_index',
      title: 'מוצרים שלא נכנסו לאינדקס',
      note: 'המוצר קיים באתר ולא יימצא בחיפוש.',
      rows: ((searchIndex.data ?? []) as unknown as Record<string, string | number | null>[]).map(
        (row) => ({
          id: String(row.id),
          label: `מוצר ${String(row.product_id).slice(0, 8)}`,
          detail: (row.last_error as string) ?? null,
          attempts: Number(row.attempts ?? 0),
          when: (row.created_at as string) ?? null,
        }),
      ),
    },
  ]

  const total = sections.reduce((sum, section) => sum + section.rows.length, 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">תורים תקועים</h1>
        <p className="mt-1 text-sm text-gray-500">
          {total === 0
            ? 'אין כרגע שורות תקועות.'
            : `${total} שורות ויתרו אחרי חמישה ניסיונות וממתינות להחלטה.`}
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.queue} className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">
            {section.title}
            <span className="mr-2 text-sm font-normal text-gray-500">({section.rows.length})</span>
          </h2>
          <p className="mt-1 mb-4 text-sm text-gray-500">{section.note}</p>

          {section.rows.length === 0 ? (
            <p className="text-sm text-gray-400">ריק.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {section.rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.label}</p>
                    {row.detail && (
                      <p className="mt-0.5 truncate text-xs text-red-600" title={row.detail}>
                        {row.detail}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400">
                      {whenText(row.when)} · {row.attempts} ניסיונות
                    </p>
                  </div>
                  <RetryButton queue={section.queue} id={row.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
