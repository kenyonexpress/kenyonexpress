import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format((agorot ?? 0) / 100)

const num = (n: number | null) => new Intl.NumberFormat('he-IL').format(n ?? 0)
const pct = (n: number | null) => (n === null || n === undefined ? '—' : `${n}%`)

/**
 * One tile. `hint` carries what the number means when it is not obvious, which
 * for most of these it is not: a recovery rate and a rejection rate are both
 * numbers whose good direction has to be stated.
 */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="mt-1 font-bold text-2xl tabular-nums">
        <bdi>{value}</bdi>
      </p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export default async function GrowthDashboard() {
  await requireSection('discounts', 'read')
  const admin = createAdminClient()

  const [campaigns, referrals, newsletter, recovery] = await Promise.all([
    admin
      .from('v_discount_campaign_performance' as never)
      .select('*')
      .limit(100),
    admin
      .from('v_referral_stats' as never)
      .select('*')
      .maybeSingle(),
    admin
      .from('v_newsletter_stats' as never)
      .select('*')
      .maybeSingle(),
    admin
      .from('v_abandoned_cart_recovery' as never)
      .select('*')
      .limit(8),
  ])

  type Campaign = {
    id: string
    code: string
    name: string
    used_count: number
    redemptions: number
    distinct_users: number
    total_discount_agorot: number
    counter_drift: boolean
    is_active: boolean
  }
  type Ref = {
    total: number
    pending: number
    flagged: number
    completed: number
    rejected: number
    referrers: number
    paid_agorot: number
    held_agorot: number
    rejection_rate_percent: number | null
  }
  type News = {
    subscribed: number
    pending_confirm: number
    unsubscribed: number
    churn_percent: number | null
    confirm_rate_percent: number | null
  }
  type Recovery = {
    week: string
    nudges_sent: number
    recovered: number
    recovery_rate_percent: number | null
    recovered_value_agorot: number
  }

  const camps = (campaigns.data ?? []) as unknown as Campaign[]
  const r = (referrals.data ?? null) as unknown as Ref | null
  const n = (newsletter.data ?? null) as unknown as News | null
  const rec = (recovery.data ?? []) as unknown as Recovery[]

  const campaignSpend = camps.reduce((s, c) => s + (c.total_discount_agorot ?? 0), 0)
  const drifting = camps.filter((c) => c.counter_drift)

  return (
    <div dir="rtl" className="space-y-8 p-6">
      <header>
        <h1 className="font-bold text-2xl">צמיחה</h1>
        <p className="mt-1 text-gray-600 text-sm">
          כל הסכומים כאן הם עלות שיווקית של הפלטפורמה. אף אחד מהם לא יוצא מחלקו של ספק.
        </p>
      </header>

      {drifting.length > 0 && (
        <p className="rounded-lg bg-red-50 p-4 text-red-900 text-sm">
          ב־<bdi>{drifting.length}</bdi> קמפיינים מונה השימושים אינו תואם את יומן המימושים (
          {drifting.map((c) => c.code).join(', ')}). המגבלות אינן נאכפות עליהם כרגע.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">קמפיינים</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="קמפיינים פעילים" value={num(camps.filter((c) => c.is_active).length)} />
          <Tile label="מימושים" value={num(camps.reduce((s, c) => s + (c.redemptions ?? 0), 0))} />
          <Tile
            label="לקוחות שונים"
            value={num(camps.reduce((s, c) => s + (c.distinct_users ?? 0), 0))}
          />
          <Tile label="סך ההנחות" value={ils(campaignSpend)} hint="מתוך עמלת הפלטפורמה" />
        </div>
        <Link href="/admin/discounts" className="inline-block text-sm underline">
          לניהול הקמפיינים
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">הפניות</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="שולמו" value={num(r?.completed ?? 0)} />
          <Tile
            label="ממתינות להכרעה"
            value={num((r?.pending ?? 0) + (r?.flagged ?? 0))}
            hint={`מזה ${num(r?.flagged ?? 0)} סומנו על ידי שומר ההונאה`}
          />
          <Tile label="שולם בפועל" value={ils(r?.paid_agorot ?? 0)} />
          <Tile
            label="מוחזק בתור"
            value={ils(r?.held_agorot ?? 0)}
            hint="כסף שממתין לאדם. מספר שגדל פירושו תור שלא עובדים עליו"
          />
        </div>
        <p className="text-gray-600 text-sm">
          שיעור דחייה: <bdi>{pct(r?.rejection_rate_percent ?? null)}</bdi>. קרוב לאפס פירושו שהשומר
          לא תופס דבר; קרוב למאה פירושו שהוא תופס את כולם. שניהם שווים בדיקה.
        </p>
        <Link href="/admin/referrals" className="inline-block text-sm underline">
          לתור האישור
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">רשימת דיוור</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="רשומים" value={num(n?.subscribed ?? 0)} />
          <Tile label="ממתינים לאישור" value={num(n?.pending_confirm ?? 0)} />
          <Tile
            label="שיעור אישור"
            value={pct(n?.confirm_rate_percent ?? null)}
            hint="נמוך פירושו שמייל האישור נוחת בספאם, וזה נראה בדיוק כמו חוסר עניין"
          />
          <Tile label="נטישה" value={pct(n?.churn_percent ?? null)} hint="מתוך מי שאישר אי פעם" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">שחזור עגלות נטושות</h2>
        {rec.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-gray-500 text-sm">
            עדיין לא נשלחו תזכורות.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-right">
                <tr>
                  <th className="px-4 py-3 font-medium">שבוע</th>
                  <th className="px-4 py-3 font-medium">נשלחו</th>
                  <th className="px-4 py-3 font-medium">חזרו</th>
                  <th className="px-4 py-3 font-medium">שיעור שחזור</th>
                  <th className="px-4 py-3 font-medium">ערך שחוזר</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rec.map((w) => (
                  <tr key={w.week}>
                    <td className="px-4 py-3">
                      <bdi>
                        {new Intl.DateTimeFormat('he-IL', { dateStyle: 'short' }).format(
                          new Date(w.week),
                        )}
                      </bdi>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <bdi>{num(w.nudges_sent)}</bdi>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <bdi>{num(w.recovered)}</bdi>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <bdi>{pct(w.recovery_rate_percent)}</bdi>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <bdi>{ils(w.recovered_value_agorot)}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-gray-500 text-xs">
          שחזור נספר רק בתוך 72 שעות מהתזכורת. שיעור שסופר הכל לנצח רק עולה, ולכן אינו אומר דבר.
        </p>
      </section>
    </div>
  )
}
