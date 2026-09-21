import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { formatDateTime } from '@/lib/i18n/format'
import { agorot, agorotToIls } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ReferralSettingsForm from './ReferralSettingsForm'

export const metadata = { title: 'הגדרות מערכת' }

/** Agorot column → the plain decimal the form shows and `parseIls` reads back. */
function ilsInput(value: number | null | undefined): string {
  return agorotToIls(agorot(value ?? 0)).toFixed(2)
}

type SettingsRow = {
  is_active: boolean
  referrer_bonus_agorot: number
  referred_bonus_agorot: number
  min_order_agorot: number
  qualify_window_days: number
  max_per_referrer_month: number
  max_per_referrer_year: number
  require_manual_approval: boolean
  updated_at: string | null
}

/**
 * The configuration tables an operator edits, in one place.
 *
 * Two tables carry runtime configuration today: `feature_flags` (its own
 * page, linked here) and `referral_program_settings`, which had no editor at
 * all: measured 22.09.2026 the table holds zero rows, so the referral program
 * has been "not configured" since migration 098 seeded nothing on purpose.
 * This form is how a person enters what the program pays.
 */
export default async function AdminSettingsPage() {
  const { role } = await requireSection('payments')
  const canEdit = canWriteSection(role, 'payments')

  // The admin's own session reads it: `referral_settings_admin_read` is the
  // policy. Writes go through the action, on the service key.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('referral_program_settings' as never)
    .select(
      'is_active, referrer_bonus_agorot, referred_bonus_agorot, min_order_agorot, qualify_window_days, max_per_referrer_month, max_per_referrer_year, require_manual_approval, updated_at',
    )
    .maybeSingle()
  const row = (data as SettingsRow | null) ?? null

  const values = {
    is_active: row?.is_active ?? false,
    referrer_bonus_ils: ilsInput(row?.referrer_bonus_agorot),
    referred_bonus_ils: ilsInput(row?.referred_bonus_agorot),
    min_order_ils: ilsInput(row?.min_order_agorot),
    // The table's own defaults (14 / 5 / 30 / false), so the first save of an
    // empty table proposes what migration 098 left as column defaults.
    qualify_window_days: row?.qualify_window_days ?? 14,
    max_per_referrer_month: row?.max_per_referrer_month ?? 5,
    max_per_referrer_year: row?.max_per_referrer_year ?? 30,
    require_manual_approval: row?.require_manual_approval ?? false,
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">הגדרות מערכת</h1>
        <p className="mt-1 text-sm text-gray-500">
          טבלאות התצורה שהמפעיל עורך. כל שמירה נרשמת בלוג הפעילות עם הערכים לפני ואחרי.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            תוכנית ההפניות (referral_program_settings)
          </h2>
          <span className="text-xs text-gray-500">
            {row?.updated_at
              ? `עודכן ${formatDateTime(row.updated_at)}`
              : 'אין עדיין שורה: התוכנית כבויה עד שנשמרים כאן תנאים'}
          </span>
        </div>
        {error ? (
          <p className="text-sm text-red-600">ההגדרות לא נטענו: {error.message}</p>
        ) : (
          <ReferralSettingsForm values={values} readOnly={!canEdit} />
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 border-b pb-2">
          דגלי מערכת (feature_flags)
        </h2>
        <p className="text-sm text-gray-600">
          הפעלה וכיבוי של יכולות בזמן ריצה, עם משתנה סביבה שגובר על הטבלה.{' '}
          <Link href="/admin/feature-flags" className="text-brand hover:underline">
            לעריכת הדגלים
          </Link>
        </p>
      </section>
    </div>
  )
}
