import type { SupplierOption } from '@/components/admin/ProductForm'
import type { createAdminClient } from '@/lib/supabase/admin'
import {
  SUPPLIER_GOOGLE_REVIEWS_COLUMNS,
  type SupplierGoogleReviewsRow,
  readOptionalColumns,
} from '@/lib/supabase/optional-columns'

/**
 * The slice of the service-role client this read uses. The generated types do
 * not know `google_reviews_url` (pending 242), and typing the full client
 * against them trips TS2589 on the optional select, so the pages pass the real
 * client and it is narrowed once, here.
 */
interface SupplierOptionsClient {
  from(table: 'suppliers'): {
    select(columns: string): {
      is(
        column: string,
        value: null,
      ): {
        order(column: string): PromiseLike<{
          data: Omit<SupplierOption, 'google_reviews_url'>[] | null
          error: { message: string } | null
        }>
      }
      in(column: string, values: string[]): unknown
    }
  }
}

const GOOGLE_REVIEWS_HINT =
  'apply migrations/pending/242_product_price_source_google_reviews.sql. The product form shows "לא הוגדר" for every supplier until then.'

/**
 * The supplier list the product form offers, with the Google reviews link
 * beside the identity fields. `google_reviews_url` is pending 242 and absent
 * from production today, so it is read through `readOptionalColumns` rather
 * than named in the main select: an absent column is "no link", never a 42703
 * that takes the whole product form down.
 */
export async function loadSupplierOptions(
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<SupplierOption[]> {
  const admin = adminClient as unknown as SupplierOptionsClient
  const { data, error } = await admin
    .from('suppliers')
    .select('id, name, contact_phone, address, logo_url, status')
    .is('deleted_at', null)
    .order('name')
  if (error) throw new Error(`supplier options: ${error.message}`)
  const rows = data ?? []
  if (rows.length === 0) return []

  const reviews = await readOptionalColumns<SupplierGoogleReviewsRow>(
    (select, ids) => admin.from('suppliers').select(select).in('id', ids) as never,
    SUPPLIER_GOOGLE_REVIEWS_COLUMNS,
    rows.map((r) => r.id),
    'product form (supplier google reviews)',
    GOOGLE_REVIEWS_HINT,
  )
  return rows.map((row) => ({
    ...row,
    google_reviews_url: reviews.get(row.id)?.google_reviews_url ?? null,
  }))
}
