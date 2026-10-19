import { requireSection } from '@/lib/admin/rbac'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateClubTier } from '@/server/actions/admin/club-tiers'
import type { ClubTierRow } from '@/server/queries/club'

export const metadata = { title: 'דרגות מועדון' }

const ERRORS: Record<string, string> = {
  forbidden: 'אין הרשאה לעריכת דרגות.',
  invalid: 'בדקו את הערכים: שם עד 40 תווים, סף בשקלים עם עד שתי ספרות אחרי הנקודה.',
  save_failed: 'השמירה נכשלה. נסו שוב.',
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ClubTiersPage({ searchParams }: Props) {
  await requireSection('discounts', 'read')
  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null

  // All tiers, inactive included: the public policy shows only active ones.
  const { data, error } = await createAdminClient()
    .from('club_tiers' as never)
    .select(
      'id, key, name_he, min_spend_agorot, benefits_json, cashback_bonus_percent, active, sort_order',
    )
    .order('sort_order', { ascending: true })
  const tiers = (data ?? []) as ClubTierRow[]

  return (
    <div dir="rtl" className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">דרגות מועדון</h1>
        <p className="text-sm text-muted">
          הדרגה של לקוח נקבעת לפי סך הרכישות ששולמו ב-12 החודשים האחרונים. הטבה נכתבת כאן רק
          כשהמערכת באמת נותנת אותה.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          טעינת הדרגות נכשלה.
        </p>
      )}
      {errorKey && ERRORS[errorKey] && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {ERRORS[errorKey]}
        </p>
      )}
      {sp.saved === '1' && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">נשמר.</output>
      )}
      {tiers.map((t) => (
        <form
          key={t.id}
          action={updateClubTier}
          className="space-y-3 rounded-xl border border-border bg-white p-4"
        >
          <input type="hidden" name="id" value={t.id} />
          <p className="text-xs text-muted" dir="ltr">
            {t.key}
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm">
              שם הדרגה
              <input
                name="name_he"
                defaultValue={t.name_he}
                required
                maxLength={40}
                className="rounded-md border border-border px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              סף רכישות (ש&quot;ח)
              <input
                name="min_spend_ils"
                defaultValue={agorotToIls(agorot(Number(t.min_spend_agorot))).toFixed(2)}
                inputMode="decimal"
                required
                className="rounded-md border border-border px-2 py-1"
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              בונוס קשבק (%)
              <input
                name="cashback_bonus_percent"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={t.cashback_bonus_percent ?? 0}
                className="rounded-md border border-border px-2 py-1"
                dir="ltr"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              סדר
              <input
                name="sort_order"
                type="number"
                min={0}
                defaultValue={t.sort_order}
                className="rounded-md border border-border px-2 py-1"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            הטבות (שורה לכל הטבה)
            <textarea
              name="benefits"
              rows={3}
              defaultValue={
                Array.isArray(t.benefits_json) ? (t.benefits_json as string[]).join('\n') : ''
              }
              className="rounded-md border border-border px-2 py-1"
            />
          </label>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={t.active} />
              פעילה
            </label>
            <button
              type="submit"
              className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-bold text-brand-dark hover:bg-brand-primary-hover"
            >
              שמירה
            </button>
          </div>
        </form>
      ))}
    </div>
  )
}
