import { requireSection } from '@/lib/admin/rbac'
import { CITIES } from '@/lib/geo/cities'
import { NATIONWIDE_LABEL } from '@/lib/geo/nationwide'
import { createClient } from '@/lib/supabase/server'
import { setProductLocation } from '@/server/actions/admin/product-location'
import Link from 'next/link'

export const metadata = { title: 'מוצרים בלי מיקום' }

const ERRORS: Record<string, string> = {
  forbidden: 'אין הרשאה לעריכת מוצרים.',
  invalid: 'יש להזין שם עיר אמיתי (2 עד 60 תווים).',
  save_failed: 'השמירה נכשלה. נסו שוב.',
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Physical products whose city is still the nationwide default that
 * migration 279 seeded. Each row takes a real city (and, optionally, a street
 * address for the Waze link) and drops off the list once saved.
 */
export default async function MissingLocationPage({ searchParams }: Props) {
  await requireSection('catalog', 'read')
  const params = await searchParams
  const errorKey = typeof params.error === 'string' ? params.error : null
  const saved = params.saved === '1'

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
          <h1 className="text-2xl font-bold text-heading">מוצרים בלי מיקום</h1>
          <p className="text-sm text-muted">
            מוצרים פיזיים שמוצגים כרגע כ&quot;{NATIONWIDE_LABEL}&quot;. הזינו עיר אמיתית והמוצר יירד
            מהרשימה.
          </p>
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

      <datalist id="known-cities">
        {CITIES.map((c) => (
          <option key={c.slug} value={c.name} />
        ))}
      </datalist>

      {rows.length === 0 && !error ? (
        <p className="text-sm text-muted">אין מוצרים שממתינים למיקום.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">מוצרים שממתינים לעיר</caption>
            <thead className="bg-surface-hover text-start">
              <tr>
                <th scope="col" className="p-3 text-start">
                  מוצר
                </th>
                <th scope="col" className="p-3 text-start">
                  סטטוס
                </th>
                <th scope="col" className="p-3 text-start">
                  עיר וכתובת
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="p-3">
                    <Link href={`/admin/products/${p.id}`} className="text-link hover:underline">
                      {p.name_he}
                    </Link>
                  </td>
                  <td className="p-3 text-muted">{p.status}</td>
                  <td className="p-3">
                    <form action={setProductLocation} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted">עיר</span>
                        <input
                          name="city"
                          list="known-cities"
                          required
                          minLength={2}
                          maxLength={60}
                          className="rounded-md border border-border px-2 py-1"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-muted">כתובת (לא חובה)</span>
                        <input
                          name="full_address"
                          defaultValue={p.full_address ?? ''}
                          maxLength={200}
                          className="rounded-md border border-border px-2 py-1"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-bold text-brand-dark hover:bg-brand-primary-hover"
                      >
                        שמירה
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
