import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { type GiftCardState, judgeGiftCard } from '@/lib/commerce/gift-card'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import CancelGiftCardButton from './CancelGiftCardButton'

const ils = (agorot: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100)

type CardRow = {
  id: string
  code_last4: string
  amount_agorot: number
  status: string
  purchaser_user_id: string | null
  redeemed_by_user_id: string | null
  recipient_email: string | null
  order_id: string | null
  issued_at: string
  expires_at: string
  redeemed_at: string | null
}

const STATE_LABELS: Record<GiftCardState, string> = {
  active: 'פעיל',
  redeemed: 'נטען לארנק',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
}

const STATE_TONE: Record<GiftCardState, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  redeemed: 'bg-gray-100 text-gray-700',
  expired: 'bg-amber-50 text-amber-800',
  cancelled: 'bg-red-50 text-red-700',
}

const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

const NOT_INSTALLED =
  'טבלת הגיפט קארד אינה מותקנת בבסיס הנתונים הזה: מיגרציה 234 ממתינה לאישור. ' +
  'עד להחלתה המסך ריק, וביטול ייכשל עם אותה הודעה.'

/**
 * Gift cards (STEP 48): every card the platform has issued, with the state
 * each one is in and the liability the active ones add up to.
 *
 * Payments section, read for the list and write for the one verb (cancel an
 * issued card). The code is never here: the row holds a hash and the last
 * four characters, same as the customer's own page.
 */
export default async function GiftCardsAdminPage() {
  const session = await requireSection('payments', 'read')
  const canCancel = canWriteSection(session.role, 'payments')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('gift_cards' as never)
    .select(
      'id, code_last4, amount_agorot, status, purchaser_user_id, redeemed_by_user_id, recipient_email, order_id, issued_at, expires_at, redeemed_at',
    )
    .order('issued_at', { ascending: false })
    .limit(200)

  const notInstalled = error ? TABLE_MISSING.has(error.code) : false
  const now = new Date()
  const rows = ((data ?? []) as CardRow[]).map((row) => ({
    ...row,
    judged: judgeGiftCard(row, now),
  }))

  const userIds = [
    ...new Set(rows.flatMap((r) => [r.purchaser_user_id, r.redeemed_by_user_id])),
  ].filter((id): id is string => typeof id === 'string')
  const emails = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', userIds)
    if (profilesError) {
      log.warn('gift_cards.admin_page_profiles_read_failed', { reason: profilesError.message })
    }
    for (const p of profiles ?? []) {
      if (p.email) emails.set(p.id, p.email)
    }
  }

  const counts: Record<GiftCardState, number> = { active: 0, redeemed: 0, expired: 0, cancelled: 0 }
  let liabilityAgorot = 0
  let redeemedAgorot = 0
  for (const row of rows) {
    counts[row.judged.state] += 1
    if (row.judged.state === 'active') liabilityAgorot += row.judged.balanceAgorot
    if (row.judged.state === 'redeemed') redeemedAgorot += row.amount_agorot
  }

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">גיפט קארד</h1>
        <p className="mt-1 text-sm text-gray-600">
          כל גיפט קארד שהונפק בתשלום: סכום, מצב, מי קנה ומי טען. כרטיס פעיל הוא התחייבות של
          הפלטפורמה עד שייטען לארנק. ביטול אפשרי רק לכרטיס שטרם נטען, ונרשם ב-audit_log עם הנימוק.
        </p>
      </header>

      {notInstalled ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {NOT_INSTALLED}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          קריאת הגיפט קארד נכשלה: {error.message}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="gift-card-tiles">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">פעילים (התחייבות פתוחה)</p>
          <p className="mt-1 text-xl font-bold">{ils(liabilityAgorot)}</p>
          <p className="text-xs text-gray-500">{counts.active} כרטיסים</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">נטענו לארנק</p>
          <p className="mt-1 text-xl font-bold">{ils(redeemedAgorot)}</p>
          <p className="text-xs text-gray-500">{counts.redeemed} כרטיסים</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">פגי תוקף</p>
          <p className="mt-1 text-xl font-bold">{counts.expired}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">בוטלו</p>
          <p className="mt-1 text-xl font-bold">{counts.cancelled}</p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">כרטיסים אחרונים ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            עדיין לא הונפק גיפט קארד. כרטיס נוצר כשמוצר שמסומן "גיפט קארד דיגיטלי" נקנה ומשולם.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-start">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">הונפק</th>
                  <th className="px-3 py-2 text-start font-medium">קוד</th>
                  <th className="px-3 py-2 text-start font-medium">סכום</th>
                  <th className="px-3 py-2 text-start font-medium">מצב</th>
                  <th className="px-3 py-2 text-start font-medium">קונה</th>
                  <th className="px-3 py-2 text-start font-medium">נמען / טוען</th>
                  <th className="px-3 py-2 text-start font-medium">תוקף</th>
                  <th className="px-3 py-2 text-start font-medium">הזמנה</th>
                  {canCancel && <th className="px-3 py-2 text-start font-medium">פעולה</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id} data-state={row.judged.state}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {new Date(row.issued_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono" dir="ltr">
                      ****-{row.code_last4}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      {ils(row.amount_agorot)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${STATE_TONE[row.judged.state]}`}
                      >
                        {STATE_LABELS[row.judged.state]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.purchaser_user_id
                        ? (emails.get(row.purchaser_user_id) ?? row.purchaser_user_id)
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {row.redeemed_by_user_id
                        ? (emails.get(row.redeemed_by_user_id) ?? row.redeemed_by_user_id)
                        : (row.recipient_email ?? '-')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                      {row.judged.state === 'redeemed' && row.redeemed_at
                        ? `נטען ${new Date(row.redeemed_at).toLocaleDateString('he-IL')}`
                        : `עד ${new Date(row.expires_at).toLocaleDateString('he-IL')}`}
                    </td>
                    <td className="px-3 py-2">
                      {row.order_id ? (
                        <Link
                          className="text-blue-700 underline"
                          href={`/admin/orders/${row.order_id}`}
                        >
                          {row.order_id.slice(0, 8)}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    {canCancel && (
                      <td className="px-3 py-2">
                        {row.judged.state === 'active' ? (
                          <CancelGiftCardButton id={row.id} last4={row.code_last4} />
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    )}
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
