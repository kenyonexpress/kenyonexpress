import 'server-only'

import { noSales } from '@/lib/flash-sales/read'
import { type FlashClaim, type FlashSale, phaseOf, remainingOf } from '@/lib/flash-sales/rules'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The waiting room's poll (STEP 61), on the service role.
 *
 * Kept apart from `read.ts` so the catalogue pages' import tree stays on the
 * anon key alone. The service role is needed here because the poll SWEEPS
 * the sale (lapse, promote) before reading, and the sweep is a write no
 * client role may run.
 */

const int = (v: number | string | null | undefined): number => Math.trunc(Number(v ?? 0))

export type FlashStatus = {
  phase: ReturnType<typeof phaseOf>
  remaining: number
  allocation: number
  /** The caller's own claim, or null when they have none. */
  claim: (FlashClaim & { ahead: number | null }) | null
  starts_at: string
  ends_at: string
  server_now: string
}

type ClaimRow = {
  status: string
  quantity: number | string
  queue_position: number | null
  expires_at: string | null
  order_id: string | null
}

/**
 * The waiting room's poll, on the service role: sweep the sale so a lapsed
 * hold is handed on NOW rather than at the next cron, then the aggregate and
 * the caller's own row. Null when the sale is absent or not visible.
 */
export async function readFlashStatus(
  saleId: string,
  userId: string | null,
): Promise<FlashStatus | null> {
  const admin = createAdminClient()
  const { data: saleData, error: saleError } = await admin
    .from('flash_sales' as never)
    .select('id, allocation, starts_at, ends_at, is_active')
    .eq('id', saleId)
    .eq('is_active', true)
    .maybeSingle()
  if (saleError) return noSales(saleError, 'status.sale')
  if (!saleData) return null
  const sale = saleData as unknown as Pick<
    FlashSale,
    'id' | 'allocation' | 'starts_at' | 'ends_at' | 'is_active'
  >

  const { error: sweepError } = await admin.rpc(
    'sweep_flash_sale' as never,
    {
      p_sale: saleId,
    } as never,
  )
  if (sweepError) log.warn('flash_sales.sweep_failed', { saleId, reason: sweepError.message })

  const { data: takenData, error: takenError } = await admin.rpc(
    'flash_sale_taken' as never,
    {
      p_sale: saleId,
    } as never,
  )
  if (takenError) return noSales(takenError, 'status.taken')
  const remaining = remainingOf(int(sale.allocation), int(takenData as number | string | null))

  let claim: FlashStatus['claim'] = null
  if (userId) {
    const { data: claimData, error: claimError } = await admin
      .from('flash_sale_claims' as never)
      .select('status, quantity, queue_position, expires_at, order_id')
      .eq('flash_sale_id', saleId)
      .eq('user_id', userId)
      .maybeSingle()
    if (claimError) return noSales(claimError, 'status.claim')
    const row = claimData as unknown as ClaimRow | null
    if (row) {
      let ahead: number | null = null
      if (row.status === 'queued' && row.queue_position !== null) {
        const { count, error: aheadError } = await admin
          .from('flash_sale_claims' as never)
          .select('id', { count: 'exact', head: true })
          .eq('flash_sale_id', saleId)
          .eq('status', 'queued')
          .lt('queue_position', row.queue_position)
        if (aheadError) {
          log.warn('flash_sales.ahead_read_failed', { saleId, reason: aheadError.message })
        } else {
          ahead = count ?? 0
        }
      }
      claim = {
        status: row.status as FlashClaim['status'],
        quantity: Math.max(1, int(row.quantity)),
        position: row.queue_position,
        expires_at: row.expires_at,
        order_id: row.order_id,
        ahead,
      }
    }
  }

  const now = new Date()
  return {
    phase: phaseOf(sale, now),
    remaining,
    allocation: int(sale.allocation),
    claim,
    starts_at: sale.starts_at,
    ends_at: sale.ends_at,
    server_now: now.toISOString(),
  }
}
