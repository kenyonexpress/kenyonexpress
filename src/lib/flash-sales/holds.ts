import 'server-only'

import { noSales } from '@/lib/flash-sales/read'
import { type FlashClaim, isLiveHold } from '@/lib/flash-sales/rules'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

/**
 * The visitor's own flash-sale holds (STEP 61), through THEIR session.
 *
 * Kept apart from `read.ts` on purpose: this imports the cookie-reading
 * Supabase client, and the home page's import tree must never reach it
 * (`catalogue-render-path.test.ts`). The cart is the only caller, and the
 * cart reads the session anyway. RLS (`flash_sale_claims: owner read`) is
 * the gate here, not a service-role read filtered in code.
 */

const int = (v: number | string | null | undefined): number => Math.trunc(Number(v ?? 0))

/** A hold the cart prices a line from. */
export type FlashHold = {
  flash_sale_id: string
  product_id: string
  price_agorot: number
  quantity: number
}

type HoldRow = {
  flash_sale_id: string
  status: string
  quantity: number | string
  expires_at: string | null
  order_id: string | null
  flash_sales:
    | { product_id: string; price_agorot: number | string }
    | { product_id: string; price_agorot: number | string }[]
    | null
}

/** Exported for the tests: the rows the session read returns to the holds the pricer takes. */
export function holdsFromRows(rows: HoldRow[], now: Date): FlashHold[] {
  const holds: FlashHold[] = []
  for (const row of rows) {
    const sale = Array.isArray(row.flash_sales) ? (row.flash_sales[0] ?? null) : row.flash_sales
    if (!sale) continue
    const claim: Pick<FlashClaim, 'status' | 'expires_at' | 'order_id'> = {
      status: row.status as FlashClaim['status'],
      expires_at: row.expires_at,
      order_id: row.order_id,
    }
    if (!isLiveHold(claim, now)) continue
    holds.push({
      flash_sale_id: row.flash_sale_id,
      product_id: sale.product_id,
      price_agorot: int(sale.price_agorot),
      quantity: Math.max(1, int(row.quantity)),
    })
  }
  return holds
}

/**
 * The signed-in shopper's live holds for the products named. A guest has
 * none: the claim action requires an account, because the checkout does.
 */
export async function loadFlashHoldsForUser(
  userId: string | null,
  productIds: string[],
): Promise<FlashHold[]> {
  if (!userId || productIds.length === 0) return []
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('flash_sale_claims' as never)
      .select(
        'flash_sale_id, status, quantity, expires_at, order_id, flash_sales(product_id, price_agorot)',
      )
      .eq('user_id', userId)
      .eq('status', 'held')
    if (error) {
      noSales(error, 'holds')
      return []
    }
    const wanted = new Set(productIds)
    return holdsFromRows((data as unknown as HoldRow[] | null) ?? [], new Date()).filter((hold) =>
      wanted.has(hold.product_id),
    )
  } catch (error) {
    log.warn('flash_sales.holds_read_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return []
  }
}
