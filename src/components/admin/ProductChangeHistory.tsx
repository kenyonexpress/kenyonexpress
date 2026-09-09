import { createAdminClient } from '@/lib/supabase/admin'

/**
 * What changed on this product, who changed it, and when.
 *
 * THE DATA WAS ALREADY THERE. `products` has carried an audit trigger since
 * 011/149, upgraded in place by 169, and it writes the full old row into
 * `audit_log.before` on every UPDATE. Nothing has ever SHOWN it against a
 * product, so "why is this price different from last week" was a question only
 * answerable by somebody willing to query `audit_log` by hand.
 *
 * ONLY THE FIELDS THAT ACTUALLY MOVED. A diff of the whole row lists thirty
 * unchanged columns and buries the one that matters; the point of a history is
 * to be scannable. Values are rendered as text and truncated: this is a
 * changelog, not an editor.
 *
 * THE SERVICE-ROLE CLIENT, ON A PAGE ALREADY BEHIND `requireStaffSession`.
 * `audit_log` denies SELECT to every client role by policy, deliberately, and
 * the guard that makes this safe is the page's - not this component's.
 */

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703'])

const ACTION_LABELS: Record<string, string> = {
  created: 'נוצר',
  updated: 'עודכן',
  deleted: 'נמחק',
  restored: 'שוחזר',
  status_change: 'שינוי סטטוס',
  manual_override: 'עקיפה ידנית',
}

/** Columns whose diff is noise on every single edit. */
const IGNORED_FIELDS = new Set(['updated_at', 'search_vector', 'created_at'])

type AuditRow = {
  id: string
  action: string
  created_at: string
  actor_role: string | null
  before: unknown
  after: unknown
  changes: unknown
  metadata: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function short(value: unknown): string {
  if (value === null || value === undefined) return '-'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

/** The fields that differ between before and after, ignoring the noisy ones. */
function changedFields(row: AuditRow): Array<{ field: string; from: string; to: string }> {
  const before = asRecord(row.before)
  const after = asRecord(row.after)
  if (!before || !after) {
    // A `created` row has no before, and some writers record a `changes` blob
    // instead of a full pair. Shown as-is rather than dropped: a history that
    // silently omits creations starts at the second edit.
    const changes = asRecord(row.changes)
    if (!changes) return []
    return Object.entries(changes)
      .filter(([field]) => !IGNORED_FIELDS.has(field))
      .map(([field, value]) => ({ field, from: '-', to: short(value) }))
  }

  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  const diffs: Array<{ field: string; from: string; to: string }> = []
  for (const field of fields) {
    if (IGNORED_FIELDS.has(field)) continue
    const from = short(before[field])
    const to = short(after[field])
    if (from !== to) diffs.push({ field, from, to })
  }
  return diffs
}

export default async function ProductChangeHistory({ productId }: { productId: string }) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('audit_log')
    .select('id, action, created_at, actor_role, before, after, changes, metadata')
    .eq('entity_type', 'products')
    .eq('entity_id', productId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    // Reported rather than rendered as "no changes": an empty history and an
    // unreadable one look identical, and only one of them means nothing
    // happened.
    if (MISSING.has(error.code ?? '')) return null
    return (
      <section className="rounded-lg border bg-white p-4" dir="rtl">
        <h2 className="text-lg font-semibold">היסטוריית שינויים</h2>
        <p className="mt-2 text-sm text-red-700">לא ניתן לטעון את ההיסטוריה כרגע.</p>
      </section>
    )
  }

  const rows = (data ?? []) as unknown as AuditRow[]

  return (
    <section className="rounded-lg border bg-white p-4" dir="rtl">
      <h2 className="text-lg font-semibold">היסטוריית שינויים</h2>

      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">
          לא נרשמו שינויים למוצר הזה. שינויים נרשמים אוטומטית מרגע העדכון הבא.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {rows.map((row) => {
            const diffs = changedFields(row)
            return (
              <li key={row.id} className="border-b pb-2 text-sm last:border-b-0">
                <p className="font-medium">
                  {ACTION_LABELS[row.action] ?? row.action}
                  {row.actor_role ? ` · ${row.actor_role}` : ''}{' '}
                  <span className="text-gray-500">
                    {new Date(row.created_at).toLocaleString('he-IL')}
                  </span>
                </p>
                {diffs.length === 0 ? (
                  <p className="text-gray-500">לא נרשמו שדות שהשתנו.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-gray-700">
                    {diffs.slice(0, 12).map((diff) => (
                      <li key={diff.field}>
                        <span className="font-mono text-xs" dir="ltr">
                          {diff.field}
                        </span>
                        {': '}
                        <span dir="auto">{diff.from}</span> ← <span dir="auto">{diff.to}</span>
                      </li>
                    ))}
                    {diffs.length > 12 && (
                      <li className="text-gray-500">ועוד {diffs.length - 12} שדות</li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
