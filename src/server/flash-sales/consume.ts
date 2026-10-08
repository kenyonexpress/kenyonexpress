import { isMissingFlashSchema } from '@/lib/flash-sales/rules'
import { log } from '@/lib/observability/log'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The flash-sale holds the checkout bound to an order become sales (STEP 61).
 *
 * Called from `finalizeOrder` after the money moved, in the same class as
 * `consume_order_stock` and `consume_order_discount`: one statement,
 * idempotent through the claim's status, and never allowed to fail the
 * finalize, because the card is already charged. A hold the sweep had
 * already lapsed is consumed too: the customer paid the flash price and the
 * allocation must say so.
 *
 * A HELPER AND NOT AN INLINE CALL, for the reason `server/loyalty/refresh.ts`
 * is one: `finalize-schema-contract.test.ts` holds finalize.ts to the RPCs
 * the hosted project HAS, and `consume_flash_sale_claims` arrives with
 * migration 266, which is pending. Until it is applied the function is
 * absent, and that absence is the logged no-op below.
 */
export type FlashConsumeOutcome =
  | { status: 'consumed'; claims: number }
  | { status: 'not_applied' }
  | { status: 'failed' }

export async function consumeFlashSaleClaimsForOrder(
  admin: SupabaseClient,
  input: { orderId: string },
): Promise<FlashConsumeOutcome> {
  const { data, error } = await admin.rpc(
    'consume_flash_sale_claims' as never,
    {
      p_order: input.orderId,
    } as never,
  )
  if (error) {
    if (isMissingFlashSchema(error)) {
      log.info('flash_sales.consume_not_applied', {
        orderId: input.orderId,
        hint: 'migration 266 creates consume_flash_sale_claims',
      })
      return { status: 'not_applied' }
    }
    log.error('finalize.flash_consume_failed', { orderId: input.orderId, reason: error.message })
    return { status: 'failed' }
  }
  return { status: 'consumed', claims: Math.max(0, Math.trunc(Number(data ?? 0))) }
}
