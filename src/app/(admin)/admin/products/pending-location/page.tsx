import { requireSection } from '@/lib/admin/rbac'
import { NATIONWIDE_LABEL } from '@/lib/geo/nationwide'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PendingLocationClient } from './PendingLocationClient'

export const metadata = { title: 'מוצרים שממתינים למיקום' }

const ERRORS: Record<string, string> = {
  forbidden: 'אין הרשאה לעריכת מוצרים.',
  invalid: 'יש להזין שם עיר אמיתי (2 עד 60 תווים).',
  save_failed: 'השמירה נכשלה. נסו שוב.',
  batch_failed: 'העדכון הקבוצתי נכשל. נסו שוב.',
  batch_partial: 'חלק מהמוצרים לא עודכנו. בדקו את הרשימה.',
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Physical products whose city is still the nationwide default that
 * migration 279 seeded. Supports batch editing: select multiple products
 * and update them all with the same city and address.
 */
export default async function PendingLocationPage({ searchParams }: Props) {
  await requireSection('catalog', 'read')
  const params = await searchParams
  const errorKey = typeof params.error === 'string' ? params.error : null
  const saved = params.saved === '1'
  const batchSaved = params.batch === '1'
  const batchCount = typeof params.count === 'string' ? Number.parseInt(params.count, 10) : 0

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name_he, slug, status, full_address')
    .eq('city', NATIONWIDE_LABEL)
    .is('deleted_at', null)
    .order('name_he', { ascending: true })
    .limit(500)

  const rows = (data ?? []) as {
    id: string
    name_he: string
    slug: string
    status: string
    full_address: string | null
  }[]

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">מוצרים שממתינים למיקום</h1>
          <p className="text-sm text-muted">
            מוצרים פיזיים שמוצגים כרגע כ&quot;{NATIONWIDE_LABEL}&quot;. אפשר לעדכן מוצר בודד או
            לבחור כמה מוצרים ולעדכן את כולם בבת אחת.
          </p>
          {rows.length > 0 && (
            <p className="mt-1 text-xs text-muted">סה&quot;כ {rows.length} מוצרים</p>
          )}
        </div>
        <Link href="/admin/products" className="text-sm text-link hover:underline">
          חזרה לכל המוצרים
        </Link>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          טעינת הרשימה נכשלה.
        </p>
      )}
      {errorKey && ERRORS[errorKey] && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {ERRORS[errorKey]}
        </p>
      )}
      {saved && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          המיקום נשמר.
        </output>
      )}
      {batchSaved && batchCount > 0 && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {batchCount} מוצרים עודכנו בהצלחה.
        </output>
      )}

      <PendingLocationClient products={rows} />
    </div>
  )
}
