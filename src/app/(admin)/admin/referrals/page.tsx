import ReferralQueueRow from '@/components/admin/ReferralQueueRow'
import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

type QueueRow = {
  id: string
  status: string
  created_at: string
  flagged_reasons: string[] | null
  referrer_email: string | null
  referred_email: string | null
  total_bonus_agorot: number
  referrer_paid_count: number
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
  const flagged = rows.filter((r) => r.status === 'flagged')

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">תור אישור הפניות</h1>
        <p className="mt-1 text-sm text-gray-600">
          הפניות שסומנו על ידי שומר ההונאה, או שממתינות לאישור ידני. כסף לא זז עד שמישהו הכריע.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          טעינה נכשלה: {error.message}
        </p>
      )}

      {flagged.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <bdi>{flagged.length}</bdi> הפניות סומנו. סימון אינו דחייה: הוא אומר שנמצא דמיון שדורש עין
          אנושית.
        </p>
      )}

      {rows.length === 0 && !error ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">התור ריק.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
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
      )}
    </div>
  )
}
