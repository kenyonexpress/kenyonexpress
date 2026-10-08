import ReferralQueueRow from '@/components/admin/ReferralQueueRow'
import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

type QueueRow = {
  id: string
  status: string
  created_at: string
  qualify_by: string | null
  flagged_reasons: string[] | null
  referrer_email: string | null
  referred_email: string | null
  referred_first_order_id: string | null
  total_bonus_agorot: number
  referrer_paid_count: number
}

const date = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(new Date(iso)) : '—'

/**
 * The three states the queue view returns, told apart on the screen.
 *
 * `pending` is two different things in 098: a friend who signed up and has
 * not bought yet (nothing to decide, nothing owed), and a friend whose first
 * order qualified and whose payout did not post (`referred_first_order_id`
 * set, money owed, `fn_pay_referral` failed or was never called). The second
 * is the one an admin has to act on, and before STEP 46 the page showed both
 * as one list with an approve button on each.
 */
type Lane = 'flagged' | 'owed' | 'waiting'

function laneOf(r: QueueRow): Lane {
  if (r.status === 'flagged') return 'flagged'
  return r.referred_first_order_id ? 'owed' : 'waiting'
}

// Every reason the guard can raise, phrased for the person deciding rather than
// for the log. 'same_card' is deliberately not damning: families share cards,
// which is exactly why it reaches a human instead of being auto-rejected.
const REASONS: Record<string, string> = {
  same_device: 'אותו מכשיר כמו הממליץ',
  same_card: 'אותו כרטיס אשראי כמו הממליץ',
  same_ip: 'אותה כתובת IP (חלש: בית או משרד נראים כך)',
  monthly_cap: 'הממליץ עבר את התקרה החודשית',
  yearly_cap: 'הממליץ עבר את התקרה השנתית',
}

export default async function ReferralsPage() {
  await requireSection('discounts', 'read')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('v_referral_review_queue' as never)
    .select('*')
    .limit(200)

  const rows = (data ?? []) as unknown as QueueRow[]
  const flagged = rows.filter((r) => laneOf(r) === 'flagged')
  const owed = rows.filter((r) => laneOf(r) === 'owed')
  const waiting = rows.filter((r) => laneOf(r) === 'waiting')

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">תור אישור הפניות</h1>
        <p className="mt-1 text-sm text-gray-600">
          הפניות שסומנו על ידי שומר ההונאה, שהרכישה שלהן זיכתה אבל הזיכוי לא נרשם, או שעדיין ממתינות
          לרכישה הראשונה. כסף לא זז עד שמישהו הכריע, חוץ מהפניה נקייה שמשולמת אוטומטית עם ההזמנה.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          טעינה נכשלה: {error.message}
        </p>
      )}

      {!error && (
        <dl className="grid gap-3 sm:grid-cols-3" data-testid="referral-queue-counts">
          <div className="rounded-lg border p-4">
            <dt className="text-xs text-gray-600">סומנו לבדיקה</dt>
            <dd className="mt-1 font-bold text-2xl tabular-nums">
              <bdi>{flagged.length}</bdi>
            </dd>
          </div>
          <div className="rounded-lg border p-4">
            <dt className="text-xs text-gray-600">זיכוי לא נרשם</dt>
            <dd className="mt-1 font-bold text-2xl tabular-nums">
              <bdi>{owed.length}</bdi>
            </dd>
          </div>
          <div className="rounded-lg border p-4">
            <dt className="text-xs text-gray-600">ממתינות לרכישה ראשונה</dt>
            <dd className="mt-1 font-bold text-2xl tabular-nums">
              <bdi>{waiting.length}</bdi>
            </dd>
          </div>
        </dl>
      )}

      {flagged.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">סומנו על ידי שומר ההונאה</h2>
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            סימון אינו דחייה: הוא אומר שנמצא דמיון שדורש עין אנושית.
          </p>
          <ul className="space-y-3">
            {flagged.map((r) => (
              <ReferralQueueRow
                key={r.id}
                id={r.id}
                status={r.status}
                referrerEmail={r.referrer_email}
                referredEmail={r.referred_email}
                bonus={ils(r.total_bonus_agorot)}
                referrerPaidCount={r.referrer_paid_count}
                reasons={(r.flagged_reasons ?? []).map((x) => REASONS[x] ?? x)}
              />
            ))}
          </ul>
        </section>
      )}

      {owed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">הרכישה זיכתה, הזיכוי לא נרשם</h2>
          <p className="rounded-lg bg-red-50 p-4 text-sm text-red-900">
            ההזמנה הראשונה עברה את הסף ושומר ההונאה לא מצא דבר, אבל הזיכוי האוטומטי לא נרשם (אין
            ארנק, אין חשבון רזרבה, או תקלה). אישור כאן מריץ את אותו זיכוי בדיוק.
          </p>
          <ul className="space-y-3">
            {owed.map((r) => (
              <ReferralQueueRow
                key={r.id}
                id={r.id}
                status={r.status}
                referrerEmail={r.referrer_email}
                referredEmail={r.referred_email}
                bonus={ils(r.total_bonus_agorot)}
                referrerPaidCount={r.referrer_paid_count}
                reasons={[]}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">ממתינות לרכישה ראשונה</h2>
        {waiting.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-gray-500">
            אין הפניות שממתינות לרכישה.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-right text-gray-600">
                <th className="py-2 font-medium">ממליץ</th>
                <th className="py-2 font-medium">הצטרף</th>
                <th className="py-2 font-medium">נרשם</th>
                <th className="py-2 font-medium">זמן לרכישה עד</th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2">
                    <bdi dir="ltr">{r.referrer_email ?? '—'}</bdi>
                  </td>
                  <td className="py-2">
                    <bdi dir="ltr">{r.referred_email ?? '—'}</bdi>
                  </td>
                  <td className="py-2 tabular-nums">{date(r.created_at)}</td>
                  <td className="py-2 tabular-nums">{date(r.qualify_by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rows.length === 0 && !error && (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">התור ריק.</p>
      )}
    </div>
  )
}
