import { requireSection } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCashbackPaid, getWalletDrift } from '@/server/queries/admin-wallet'
import AdjustCashbackClient from './AdjustCashbackClient'

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

type LedgerRow = {
  id: string
  user_id: string
  order_id: string | null
  entry_type: string
  amount_agorot: number
  percent_bp: number | null
  basis_agorot: number | null
  reason: string | null
  created_by: string | null
  created_at: string
}

const ENTRY_LABELS: Record<string, string> = {
  order_item: 'קאשבק מוצרים',
  first_purchase_bonus: 'בונוס רכישה ראשונה (10%)',
  fifth_purchase_bonus: 'בונוס רכישה חמישית (5%)',
  admin_adjustment: 'התאמה ידנית',
}

const UNDEFINED_TABLE = '42P01'

const NOT_INSTALLED =
  'יומן הקאשבק אינו מותקן בבסיס הנתונים הזה: מיגרציה 177 ממתינה לאישור. ' +
  'עד להחלתה המסך ריק, וההתאמות הידניות ייכשלו עם אותה הודעה.'

export default async function CashbackPage() {
  await requireSection('payments', 'read')

  const admin = createAdminClient()
  const [{ data, error }, drift, paid] = await Promise.all([
    admin
      .from('cashback_ledger')
      .select(
        'id, user_id, order_id, entry_type, amount_agorot, percent_bp, basis_agorot, reason, created_by, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(200),
    getWalletDrift(),
    getCashbackPaid(),
  ])

  const notInstalled = error?.code === UNDEFINED_TABLE
  const rows = (data ?? []) as LedgerRow[]

  // Emails resolved in one batch; the ledger stores ids, people read emails.
  const userIds = [...new Set(rows.flatMap((r) => [r.user_id, r.created_by]))].filter(
    (id): id is string => typeof id === 'string',
  )
  const emails = new Map<string, string>()
  if (userIds.length > 0) {
    // A failed lookup degrades to raw ids in the table rather than an empty
    // screen, but it is still named and reported: silence here would read as
    // "these users have no email".
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', userIds)
    if (profilesError) {
      log.warn('cashback.admin_page_profiles_read_failed', { reason: profilesError.message })
    }
    for (const p of profiles ?? []) {
      if (p.email) emails.set(p.id, p.email)
    }
  }

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">יומן קאשבק</h1>
        <p className="mt-1 text-sm text-gray-600">
          כל זיכוי קאשבק שנרשם: קאשבק מוצרים, בונוס רכישה ראשונה (10%), בונוס רכישה חמישית (5%)
          והתאמות ידניות. היומן הוא הוספה-בלבד: תיקון נעשה בהתאמה מקזזת, לא בעריכה.
        </p>
      </header>

      {notInstalled ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {NOT_INSTALLED}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          קריאת היומן נכשלה: {error.message}
        </div>
      ) : null}

      {/* The integrity check, above the console rather than below it: an
          operator about to post a manual adjustment should know first whether
          any wallet is already out of step with its own ledger. */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold">תקינות יתרות</h2>
        {!drift.known ? (
          <p className="mt-1 text-sm text-amber-800">
            לא ניתן לבדוק את תקינות היתרות כרגע ({drift.reason}). זו אינה תעודת תקינות: הבדיקה לא
            רצה.
          </p>
        ) : drift.rows.length === 0 ? (
          <p className="mt-1 text-sm text-gray-600">
            נבדק: אין אף חשבון ארנק שהיתרה השמורה שלו חלוקה על היומן שלו.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-red-800">
              {drift.rows.length} חשבונות שהיתרה השמורה שלהם אינה מסתדרת עם היומן. היומן הוא
              הוספה-בלבד ולכן הוא הצד שלא ניתן היה לערוך.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {drift.rows.map((row) => (
                <li key={row.accountId} className="flex flex-wrap gap-x-3 text-gray-700">
                  <span className="font-mono text-xs">
                    {row.code ?? row.userId ?? row.accountId}
                  </span>
                  <span>שמור {ils(row.cachedAgorot)}</span>
                  <span>יומן {ils(row.ledgerAgorot)}</span>
                  <span className="font-medium text-red-700">הפרש {ils(row.driftAgorot)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold">התאמה ידנית</h2>
        <p className="mt-1 text-sm text-gray-600">
          סכום חיובי מזכה את הלקוח מרזרבת הקאשבק; סכום שלילי מקזז חזרה. קיזוז נכשל אם היתרה בארנק
          כבר נוצלה, וזה הסירוב הנכון. כל התאמה נרשמת ביומן וב-audit_log עם המבצע והנימוק.
        </p>
        <AdjustCashbackClient />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">תנועות אחרונות ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            אין תנועות ביומן עדיין.
            {paid && paid.entries > 0
              ? ` שימו לב: זה לא אומר שלא שולם קאשבק. ${paid.entries} זיכויים בסך ${ils(paid.totalAgorot)} כבר יצאו מרזרבת הקאשבק דרך wallet_entries, לפני שהיומן הזה היה קיים, והוא אינו מייבא אותם אחורה.`
              : ''}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-start">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">תאריך</th>
                  <th className="px-3 py-2 text-start font-medium">לקוח</th>
                  <th className="px-3 py-2 text-start font-medium">סוג</th>
                  <th className="px-3 py-2 text-start font-medium">סכום</th>
                  <th className="px-3 py-2 text-start font-medium">בסיס</th>
                  <th className="px-3 py-2 text-start font-medium">נימוק / מבצע</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {new Date(row.created_at).toLocaleString('he-IL')}
                    </td>
                    <td className="px-3 py-2">{emails.get(row.user_id) ?? row.user_id}</td>
                    <td className="px-3 py-2">{ENTRY_LABELS[row.entry_type] ?? row.entry_type}</td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 font-medium ${
                        row.amount_agorot < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {ils(row.amount_agorot)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {row.basis_agorot != null && row.percent_bp != null
                        ? `${ils(row.basis_agorot)} · ${row.percent_bp / 100}%`
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {row.entry_type === 'admin_adjustment'
                        ? `${row.reason ?? ''}${row.created_by ? ` · ${emails.get(row.created_by) ?? row.created_by}` : ''}`
                        : (row.order_id ?? '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
