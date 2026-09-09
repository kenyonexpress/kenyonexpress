import { formatIls } from '@/lib/account/format'
import { requireSection } from '@/lib/admin/rbac'
import { agorot } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import FlashDealForm from './FlashDealForm'

export const metadata = { title: 'דילים מתוזמנים' }

/**
 * What is about to happen to the catalogue, and the box to add to it.
 *
 * `discounts` and not a section of its own: this is the same authority that
 * sets `discount_campaigns`, and giving a price schedule its own permission
 * would mean an operator who can run a 50%-off code cannot run a 50%-off
 * afternoon.
 *
 * SHOWS APPLIED AND CANCELLED ROWS TOO, not only the pending ones. The question
 * an operator opens this page with is usually "why is this product ₪99" — and a
 * list of the future cannot answer it. Cancelled rows are kept for the same
 * reason: "we were going to run this and pulled it" belongs next to the deal
 * that did run.
 *
 * Empty and harmless until `migrations/pending/201` is applied.
 */

type Row = {
  id: string
  effective_at: string
  price_agorot: number
  reference_agorot: number | null
  note: string | null
  applied_at: string | null
  cancelled_at: string | null
  last_error: string | null
  products: { name_he: string | null; slug: string | null } | null
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
}

export default async function FlashDealsPage() {
  await requireSection('discounts', 'read')
  const admin = createAdminClient()

  const [{ data, error }, { data: products }] = await Promise.all([
    admin
      .from('scheduled_price_changes' as never)
      .select(
        'id, effective_at, price_agorot, reference_agorot, note, applied_at, cancelled_at, last_error, products(name_he, slug)',
      )
      .order('effective_at', { ascending: false })
      .limit(100),
    admin
      .from('products')
      .select('id, name_he')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('name_he'),
  ])

  // Read, not discarded. 42P01 is 201 being unapplied and is the expected state
  // today; anything else is a page showing "nothing scheduled" when something
  // is, which an operator has no way to tell apart.
  if (error && !['42P01', 'PGRST205'].includes(error.code ?? '')) {
    log.warn('admin.flash_deals_read_failed', { reason: error.message })
  }

  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">דילים מתוזמנים</h1>
        <p className="mt-1 text-sm text-black/60">
          שינוי מחיר עם שעה. מוחל אוטומטית כל חמש דקות, ונרשם בהיסטוריית המחירים — מה שקובע אם אפשר
          להציג מחיר מחוק אחר כך.
        </p>
      </div>

      <FlashDealForm
        products={((products ?? []) as { id: string; name_he: string | null }[]).map((p) => ({
          id: p.id,
          name: p.name_he ?? p.id,
        }))}
      />

      {rows.length === 0 ? (
        <p className="text-sm text-black/60">אין שינויים מתוזמנים.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-black/10 border-b">
              <th className="p-2 text-start">מוצר</th>
              <th className="p-2 text-start">מועד</th>
              <th className="p-2 text-start">מחיר</th>
              <th className="p-2 text-start">לפני</th>
              <th className="p-2 text-start">מצב</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-black/10 border-b">
                <td className="p-2">{row.products?.name_he ?? '—'}</td>
                <td className="p-2" dir="ltr">
                  {when(row.effective_at)}
                </td>
                <td className="p-2" dir="ltr">
                  {formatIls(agorot(row.price_agorot))}
                </td>
                <td className="p-2" dir="ltr">
                  {row.reference_agorot == null ? '—' : formatIls(agorot(row.reference_agorot))}
                </td>
                <td className="p-2">
                  {row.cancelled_at ? (
                    <span className="text-black/50">בוטל</span>
                  ) : row.applied_at ? (
                    <span className="text-emerald-700">הוחל</span>
                  ) : (
                    <span className="text-amber-700">ממתין</span>
                  )}
                  {row.last_error && (
                    <span className="block text-xs text-red-600">{row.last_error}</span>
                  )}
                  {row.note && <span className="block text-xs text-black/50">{row.note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
