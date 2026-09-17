import { requireSection } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLE_MISSING } from '@/lib/supabase/error-codes'

export const metadata = { title: 'בקשות מידע' }

/**
 * Right-of-access exports and right-of-erasure deletions, in one queue.
 *
 * GUARDED ON `users`, AND THAT IS NOT A FORMALITY. Until this page was moved
 * into the `(admin)` route group it sat in a directory literally named
 * `\(admin\)` -- backslashes in the name -- so Next never served it and its
 * only check, `if (!user) redirect(...)`, was never exercised. The moment the
 * route became real, that check would have let ANY signed-in customer read
 * every other customer's deletion request: user ids, the IP the request came
 * from, and the user agent. `requireSection` is what actually closes that.
 *
 * READ WITH THE ADMIN CLIENT, the same reason `admin/queues` gives: these two
 * tables carry no staff-read policy, so a request-scoped client returns an
 * empty queue to staff rather than an error, and an empty queue reads as "no
 * pending requests" -- the failure mode that makes a compliance page worse
 * than no page.
 *
 * TOLERATES ITS TABLES BEING ABSENT. `migrations/pending/230` creates both and
 * is unapplied, so on today's deployment these reads answer PGRST205. That is
 * a known state and renders the empty view; any OTHER error is logged, because
 * it means something different and unknown.
 */
type PendingExport = {
  id: string
  user_id: string
  created_at: string
  expires_at: string
  downloaded_at: string | null
}

type PendingDeletion = {
  id: string
  user_id: string
  status: string
  requested_at: string
  scheduled_delete_at: string | null
}

async function readQueue<T>(
  table: 'pending_exports' | 'pending_deletions',
  orderColumn: string,
): Promise<T[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from(table as never)
    .select('*')
    .order(orderColumn, { ascending: false })
    .limit(100)

  if (error) {
    // 230 is unapplied on this deployment: an empty queue is the truth.
    if (error.code !== TABLE_MISSING) {
      log.warn('data_requests.read_failed', { table, code: error.code ?? null })
    }
    return []
  }
  return (data ?? []) as unknown as T[]
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`
}

function day(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('he-IL') : '—'
}

export default async function DataRequestsPage() {
  await requireSection('users')

  const [exports, deletions] = await Promise.all([
    readQueue<PendingExport>('pending_exports', 'created_at'),
    readQueue<PendingDeletion>('pending_deletions', 'requested_at'),
  ])

  const byStatus = (status: string) => deletions.filter((d) => d.status === status).length

  return (
    <div dir="rtl" className="p-8">
      <h1 className="mb-8 text-3xl font-bold">בקשות מידע</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded bg-blue-50 p-4">
          <div className="text-2xl font-bold text-blue-600">{exports.length}</div>
          <div className="text-sm text-gray-600">ייצוא פעיל</div>
        </div>
        <div className="rounded bg-yellow-50 p-4">
          <div className="text-2xl font-bold text-yellow-600">{byStatus('requested')}</div>
          <div className="text-sm text-gray-600">מחיקה ממתינה</div>
        </div>
        <div className="rounded bg-orange-50 p-4">
          <div className="text-2xl font-bold text-orange-600">{byStatus('grace_period')}</div>
          <div className="text-sm text-gray-600">בתקופת צינון</div>
        </div>
        <div className="rounded bg-gray-50 p-4">
          <div className="text-2xl font-bold text-gray-600">{byStatus('anonymized')}</div>
          <div className="text-sm text-gray-600">עברו אנונימיזציה</div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-4 text-xl font-semibold">בקשות ייצוא מידע</h2>
        {exports.length === 0 ? (
          <p className="rounded bg-gray-50 p-8 text-center text-gray-600">אין בקשות ייצוא</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-end font-medium">משתמש</th>
                  <th className="px-4 py-2 text-end font-medium">נוצר</th>
                  <th className="px-4 py-2 text-end font-medium">פג</th>
                  <th className="px-4 py-2 text-end font-medium">הורד</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {exports.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-mono text-xs" dir="ltr">
                      {shortId(row.user_id)}
                    </td>
                    <td className="px-4 py-2">{day(row.created_at)}</td>
                    <td className="px-4 py-2">{day(row.expires_at)}</td>
                    <td className="px-4 py-2">{row.downloaded_at ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">בקשות מחיקה</h2>
        {deletions.length === 0 ? (
          <p className="rounded bg-gray-50 p-8 text-center text-gray-600">אין בקשות מחיקה</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-end font-medium">משתמש</th>
                  <th className="px-4 py-2 text-end font-medium">סטטוס</th>
                  <th className="px-4 py-2 text-end font-medium">התקבלה</th>
                  <th className="px-4 py-2 text-end font-medium">תימחק בעוד</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {deletions.map((row) => {
                  const daysLeft = row.scheduled_delete_at
                    ? Math.ceil(
                        (new Date(row.scheduled_delete_at).getTime() - Date.now()) / 86_400_000,
                      )
                    : null
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-2 font-mono text-xs" dir="ltr">
                        {shortId(row.user_id)}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded bg-yellow-100 px-2 py-1 text-xs">
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">{day(row.requested_at)}</td>
                      <td className="px-4 py-2">{daysLeft === null ? '—' : `${daysLeft} ימים`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
