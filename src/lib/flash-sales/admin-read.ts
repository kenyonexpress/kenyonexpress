import 'server-only'

import { type FlashSale, isMissingFlashSchema } from '@/lib/flash-sales/rules'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin-side reads of flash sales (STEP 61): every row, active or not, with
 * the product named and the claim counts. Service role, because the list must
 * show what the public policy hides (a switched-off sale), behind the page's
 * own `requireSection('discounts')` gate.
 *
 * `tableExists` is false on a database without 266, and the page says so
 * instead of rendering an empty list that reads as "no sales yet".
 */

export type AdminFlashSale = FlashSale & {
  created_at: string
  updated_at: string
  product_name_he: string | null
  product_status: string | null
  product_kenyon_price: number | null
  /** Units spoken for: consumed plus live holds, as `flash_sale_taken` counts them. */
  taken: number
  /** Shoppers in the waiting room right now. */
  queued: number
  /** Paid units. */
  consumed: number
}

type Row = {
  id: string
  product_id: string
  name_he: string
  price_agorot: number | string
  reference_agorot: number | string | null
  allocation: number | string
  max_per_claim: number | string
  hold_minutes: number | string
  starts_at: string
  ends_at: string
  is_active: boolean
  created_at: string
  updated_at: string
  products:
    | { name_he: string | null; status: string | null; kenyon_price: number | string | null }
    | { name_he: string | null; status: string | null; kenyon_price: number | string | null }[]
    | null
}

type ClaimCountRow = {
  flash_sale_id: string
  status: string
  quantity: number | string
  expires_at: string | null
  order_id: string | null
}

const SELECT =
  'id, product_id, name_he, price_agorot, reference_agorot, allocation, max_per_claim, hold_minutes, starts_at, ends_at, is_active, created_at, updated_at, products(name_he, status, kenyon_price)'

const int = (v: number | string | null | undefined): number => Math.trunc(Number(v ?? 0))

/** Exported for the tests: the embed shape to the page's shape, counts folded in. */
export function adminFlashSaleFromRow(
  row: Row,
  claims: readonly ClaimCountRow[],
  now: Date,
): AdminFlashSale {
  const product = Array.isArray(row.products) ? (row.products[0] ?? null) : row.products
  let taken = 0
  let queued = 0
  let consumed = 0
  for (const claim of claims) {
    if (claim.flash_sale_id !== row.id) continue
    const qty = int(claim.quantity)
    if (claim.status === 'consumed') {
      consumed += qty
      taken += qty
    } else if (claim.status === 'held') {
      const live =
        claim.order_id !== null ||
        (claim.expires_at !== null && Date.parse(claim.expires_at) > now.getTime())
      if (live) taken += qty
    } else if (claim.status === 'queued') {
      queued += 1
    }
  }
  return {
    id: row.id,
    product_id: row.product_id,
    name_he: row.name_he,
    price_agorot: int(row.price_agorot),
    reference_agorot: row.reference_agorot == null ? null : int(row.reference_agorot),
    allocation: int(row.allocation),
    max_per_claim: Math.max(1, int(row.max_per_claim)),
    hold_minutes: Math.max(1, int(row.hold_minutes)),
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    product_name_he: product?.name_he ?? null,
    product_status: product?.status ?? null,
    product_kenyon_price: product?.kenyon_price == null ? null : Number(product.kenyon_price),
    taken,
    queued,
    consumed,
  }
}

async function claimRows(saleIds: string[]): Promise<ClaimCountRow[]> {
  if (saleIds.length === 0) return []
  const { data, error } = await createAdminClient()
    .from('flash_sale_claims' as never)
    .select('flash_sale_id, status, quantity, expires_at, order_id')
    .in('flash_sale_id', saleIds)
  if (error) return []
  return (data as unknown as ClaimCountRow[] | null) ?? []
}

export async function listFlashSalesForAdmin(): Promise<{
  sales: AdminFlashSale[]
  tableExists: boolean
  error: string | null
}> {
  const { data, error } = await createAdminClient()
    .from('flash_sales' as never)
    .select(SELECT)
    .order('starts_at', { ascending: false })
    .limit(200)
  if (error) {
    if (isMissingFlashSchema(error)) return { sales: [], tableExists: false, error: null }
    return { sales: [], tableExists: true, error: error.message }
  }
  const rows = (data as unknown as Row[] | null) ?? []
  const claims = await claimRows(rows.map((row) => row.id))
  const now = new Date()
  return {
    sales: rows.map((row) => adminFlashSaleFromRow(row, claims, now)),
    tableExists: true,
    error: null,
  }
}

export async function readFlashSaleForAdmin(id: string): Promise<AdminFlashSale | null> {
  const { data, error } = await createAdminClient()
    .from('flash_sales' as never)
    .select(SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  const claims = await claimRows([id])
  return adminFlashSaleFromRow(data as unknown as Row, claims, new Date())
}
