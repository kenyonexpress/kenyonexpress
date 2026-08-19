import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { type MarkRedeemedAdmin, markOrderItemRedeemed } from './mark-order-item-redeemed'

/**
 * Minimal shape of the service-role client this needs: the voucher lookup and
 * the order line write. Typed as loosely as `MarkRedeemedAdmin` and for the
 * same reason, so Supabase's deep query-builder generics cannot blow up the
 * typecheck of the routes that call it.
 */
export type StampAdmin = MarkRedeemedAdmin & {
  // biome-ignore lint/suspicious/noExplicitAny: same generics recursion as MarkRedeemedAdmin.
  from: (table: 'order_items' | 'vouchers') => any
}

/**
 * Move a burned voucher's order line to `settlement_status = 'redeemed'`.
 *
 * Required by ARCHITECTURE-COUPON-REDEMPTION-UX section 0 and its acceptance
 * list. It is a LIFECYCLE stamp, not a money movement, and that distinction is
 * what makes it safe: under the no-Escrow model the whole on-site prepayment
 * settled when the order was paid (`split_executed` / `platform_settled`), and
 * the balance the customer hands over at the till never reaches the platform.
 * Nothing here releases or moves an agora.
 *
 * Stamped AFTER the atomic RPC and never inside it, for the same reason
 * `stampStaff` is: `redeem_voucher` is the money-path RPC, and a display column
 * has no business sharing a failure path with burning the voucher. A failure
 * here loses a status label and nothing else, so it warns and never throws.
 *
 * `voucher_success_payload` does not return the order line, so it is resolved
 * from the voucher id the RPC does return.
 *
 * Idempotent twice over: `markOrderItemRedeemed` only matches
 * REDEEMABLE_SETTLEMENT_STATUSES, so a replay, a retry or a second scan updates
 * zero rows and can never overwrite `refunded` or `cancelled`. That is also why
 * callers run it on replays instead of skipping them: a stamp lost to a failed
 * first attempt still converges on the next scan.
 */
export async function stampSettlementRedeemed(
  voucherId: string,
  adminClient?: StampAdmin,
): Promise<void> {
  const admin = adminClient ?? (createAdminClient() as unknown as StampAdmin)

  const { data: voucher, error: lookupError } = await admin
    .from('vouchers')
    .select('order_item_id')
    .eq('id', voucherId)
    .maybeSingle()

  if (lookupError) {
    log.warn('voucher.settlement_stamp_lookup_failed', { reason: lookupError.message })
    return
  }

  if (!voucher?.order_item_id) {
    log.warn('voucher.settlement_stamp_no_order_item', { voucher_id: voucherId })
    return
  }

  const { error } = await markOrderItemRedeemed(admin, voucher.order_item_id)
  if (error) log.warn('voucher.settlement_stamp_failed', { reason: error })
}
